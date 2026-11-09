// Turns loaded files into per-product, per-size verdicts.

import { parseSize, splitLineItemName, sizeFromVariant, sizeFromSku, sizeFromText, compareSizes, sortSizes } from './sizes.js';
import { classifyReason } from './reasons.js';
import { parseCSV } from './csv.js';

// Thresholds. The reasoning behind each one is written up in README.md ("判断规则").
export const RULES = {
  MIN_DIRECTIONAL: 5,        // need ≥5 units saying "small" or "large" before calling a direction
  WILSON_Z: 1.28,            // ~90% one-sided confidence; dominant share's lower bound must exceed 50%
  MIN_DIR_SHARE_OF_SALES: 0.02, // with sales data: directional complaints on <2% of units sold = noise
  MIN_SOLD_FOR_NORMAL: 30,   // "正常" needs ≥30 units sold…
  MAX_DIR_RATE_NORMAL: 0.05, // …and size complaints on <5% of them
  MIN_RETURNS_NORMAL_NO_SALES: 10, // without sales: ≥10 returns with a reason, <20% of them size-related
  MAX_SIZE_SHARE_NORMAL_NO_SALES: 0.2,
  FIT_UNCLEAR_MIN: 3,        // ≥3 "wrong size" returns without direction → 待确认
  HIGH_RATE_MIN_RETURNS: 5,  // high-return-rate flag needs ≥5 returns,
  HIGH_RATE_MIN_SOLD: 20,    // ≥20 sold,
  HIGH_RATE_MULT: 1.5,       // a rate ≥1.5× the product baseline,
  HIGH_RATE_MIN_GAP: 0.05,   // and at least 5 percentage points above it
};

export const VERDICTS = ['small', 'large', 'normal', 'unconfirmed', 'insufficient'];

const num = v => {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

function lineIdentity(row, m) {
  const get = role => (m[role] ? (row[m[role]] || '').trim() : '');
  let product = get('product');
  let variant = get('variant');
  const lineName = get('lineName');
  const sku = get('sku');
  if (lineName && !product) {
    const split = splitLineItemName(lineName);
    product = split.product;
    variant = variant || split.variant;
  } else if (product && !variant) {
    // Some exports put "Product - Variant" into the product title column.
    const split = splitLineItemName(product);
    if (split.variant) { product = split.product; variant = split.variant; }
  }
  const size = parseSize({ variant, name: lineName, sku });
  if (!product && sku) {
    product = sku.replace(/[-_\s]+[^-_\s]+$/, ''); // drop the trailing size segment
  }
  return { product, variant, sku, size }; // empty product name is rendered as "unnamed" by the report
}

function exchangeSize(value, header) {
  if (!value) return null;
  if (/note|comment|备注/i.test(header || '')) return sizeFromText(value);
  return sizeFromVariant(value) || sizeFromSku(value) || sizeFromText(value);
}

/** Convert one loaded file into normalised sale / return records. */
export function toRecords(file, { inferReturnsFromRefunds = true } = {}) {
  const m = file.mapping;
  const out = { records: [], skipped: { noSize: 0, oneSize: 0, ambiguousRefund: 0 } };
  const push = (rec) => {
    if (!rec.size) { out.skipped.noSize += rec.qty; return; }
    if (rec.size.family === 'one') { out.skipped.oneSize += rec.qty; return; }
    out.records.push(rec);
  };

  if (file.kind === 'orders') {
    // Shopify writes order-level fields (status, refunded amount) on the first row of each order only.
    const orders = [];
    let current = null;
    for (const row of file.rows) {
      const id = m.orderId ? row[m.orderId] : '';
      const status = m.financialStatus ? row[m.financialStatus] : '';
      if (!current || (id && id !== current.id) || (!id && status)) {
        current = { id, status: '', refunded: NaN, lines: [] };
        orders.push(current);
      }
      if (status) current.status = status.toLowerCase();
      if (m.refundedAmount && row[m.refundedAmount] !== '') current.refunded = num(row[m.refundedAmount]);
      const ident = lineIdentity(row, m);
      const qty = Math.max(1, Math.round(num(m.qty ? row[m.qty] : 1)) || 1);
      current.lines.push({ ...ident, qty, price: num(m.price ? row[m.price] : NaN) });
    }
    for (const o of orders) {
      for (const l of o.lines) push({ type: 'sale', product: l.product, size: l.size, qty: l.qty });
      if (!inferReturnsFromRefunds) continue;
      let returned = [];
      if (o.status === 'refunded') returned = o.lines;
      else if (o.status === 'partially_refunded' && Number.isFinite(o.refunded) && o.refunded > 0) {
        const near = (a, b) => Math.abs(a - b) < 0.01;
        const full = o.lines.filter(l => near(l.price * l.qty, o.refunded));
        const unit = o.lines.filter(l => near(l.price, o.refunded));
        if (full.length === 1) returned = full;
        else if (unit.length === 1) returned = [{ ...unit[0], qty: 1 }];
        else out.skipped.ambiguousRefund++;
      }
      for (const l of returned) {
        push({ type: 'return', product: l.product, size: l.size, qty: l.qty, reason: 'unknown', exchange: null, source: 'refund' });
      }
    }
    return out;
  }

  for (const row of file.rows) {
    const ident = lineIdentity(row, m);
    const qty = Math.max(1, Math.round(num(m.qty ? row[m.qty] : 1)) || 1);
    const text = role => (m[role] ? row[m[role]] : '');
    const { cls } = classifyReason(text('reason'), text('subReason'), text('note'), text('staffNote'));
    let exchange = null;
    const exVal = text('exchange');
    const outcome = text('outcome').toLowerCase();
    if (exVal && (!outcome || /exchange|换/.test(outcome) || !m.outcome)) {
      const to = exchangeSize(exVal, m.exchange);
      const cmp = compareSizes(ident.size, to);
      if (cmp === -1) exchange = 'small';   // swapped to a bigger size → original runs small
      else if (cmp === 1) exchange = 'large';
    }
    push({ type: 'return', product: ident.product, size: ident.size, qty, reason: cls, exchange, source: 'returns' });
  }
  return out;
}

function wilsonLower(k, n, z = RULES.WILSON_Z) {
  if (!n) return 0;
  const p = k / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / (1 + z2 / n);
}

function emptyCell(size) {
  return {
    size, sold: 0, returns: 0,
    small: { exchange: 0, reason: 0 }, large: { exchange: 0, reason: 0 },
    fit: 0, other: 0, unknown: 0,
  };
}

/**
 * Decide small / large / normal / unconfirmed / insufficient for one size cell.
 * `why` is language-neutral: { key, p } is rendered through the i18n dictionary ("why.<key>").
 */
export function judgeCell(cell, ctx = {}) {
  const R = RULES;
  const s = cell.small.exchange + cell.small.reason;
  const l = cell.large.exchange + cell.large.reason;
  const dir = s + l;
  const hasSales = !!ctx.hasSales;
  const sold = cell.sold;
  const lean = s > l ? 'small' : l > s ? 'large' : null;
  const why = (key, p = {}) => ({ key, p });

  if (dir >= R.MIN_DIRECTIONAL) {
    if (hasSales && sold > 0 && dir / sold < R.MIN_DIR_SHARE_OF_SALES) {
      return { verdict: 'normal', why: why('noise', { dir, sold, pct: R.MIN_DIR_SHARE_OF_SALES * 100 }) };
    }
    const dom = Math.max(s, l);
    if (wilsonLower(dom, dir) > 0.5) {
      return { verdict: lean, why: why('direction', { dir, dom, word: lean }) };
    }
    return { verdict: 'unconfirmed', why: why('mixed', { small: s, large: l }) };
  }

  if (cell.fit >= R.FIT_UNCLEAR_MIN) {
    return { verdict: 'unconfirmed', why: why('fitUnclear', { n: cell.fit }) };
  }

  if (hasSales && sold >= R.HIGH_RATE_MIN_SOLD && cell.returns >= R.HIGH_RATE_MIN_RETURNS && ctx.baselineRate != null) {
    const rate = cell.returns / sold;
    if (rate >= ctx.baselineRate * R.HIGH_RATE_MULT && rate - ctx.baselineRate >= R.HIGH_RATE_MIN_GAP) {
      return { verdict: 'unconfirmed', why: why('highRate', { rate: pct(rate), base: pct(ctx.baselineRate) }) };
    }
  }
  if (!hasSales && cell.returns >= R.HIGH_RATE_MIN_RETURNS && ctx.avgReturnsPerSize
      && cell.returns >= ctx.avgReturnsPerSize * R.HIGH_RATE_MULT
      && (cell.unknown + cell.fit) / cell.returns >= 0.5) {
    return { verdict: 'unconfirmed', why: why('highReturnsNoSales', { n: cell.returns }) };
  }

  const known = cell.returns - cell.unknown;
  if (hasSales && sold >= R.MIN_SOLD_FOR_NORMAL && dir / sold < R.MAX_DIR_RATE_NORMAL) {
    return {
      verdict: 'normal',
      why: cell.returns && known / cell.returns < 0.5
        ? why('normalSalesNoReasons', { sold, rate: pct(cell.returns / sold) })
        : why('normalSales', { sold, dir }),
    };
  }
  if (!hasSales && known >= R.MIN_RETURNS_NORMAL_NO_SALES
      && (dir + cell.fit) / known < R.MAX_SIZE_SHARE_NORMAL_NO_SALES) {
    return { verdict: 'normal', why: why('normalNoSales', { known, n: dir + cell.fit }) };
  }
  const need = R.MIN_DIRECTIONAL - dir;
  if (!dir) return { verdict: 'insufficient', why: why('insufficientNone') };
  return {
    verdict: 'insufficient',
    why: lean ? why('insufficientLean', { dir, need, word: lean }) : why('insufficientSome', { dir, need }),
  };
}

const pct = x => `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`;

/** Parse an optional size chart CSV: Product (optional), Size, then numeric measurement columns. */
export function parseSizeChart(text) {
  const { headers, rows } = parseCSV(text);
  const productH = headers.find(h => /^(product|商品|款式|style)/i.test(h));
  const sizeH = headers.find(h => /^(size|尺码)$/i.test(h.trim()));
  if (!sizeH) return [];
  const measureHs = headers.filter(h => h !== productH && h !== sizeH);
  const out = [];
  for (const r of rows) {
    const size = sizeFromVariant(r[sizeH]);
    if (!size) continue;
    const measures = {};
    for (const h of measureHs) {
      const v = num(r[h]);
      if (Number.isFinite(v)) measures[h] = v;
    }
    out.push({ product: productH ? (r[productH] || '*').trim().toLowerCase() : '*', size, measures });
  }
  return out;
}

function chartFor(chart, product) {
  const p = product.toLowerCase();
  const exact = chart.filter(r => r.product === p);
  if (exact.length) return exact;
  const partial = chart.filter(r => r.product !== '*' && (p.includes(r.product) || r.product.includes(p)));
  if (partial.length) return partial;
  return chart.filter(r => r.product === '*');
}

const roundHalf = x => Math.round(x * 2) / 2;

/**
 * Size-chart change suggestions for one product. Language-neutral:
 *   { size, up, fromChart, parts: [{ label, delta, unit, cur, next }] }
 * fromChart=false → no chart row for this size (direction only); parts empty → chart had no usable step.
 */
export function chartSuggestions(product, sizes, chart) {
  const flagged = sizes.filter(c => c.verdict === 'small' || c.verdict === 'large');
  if (!flagged.length) return [];
  const rows = chart?.length ? sortSizes(chartFor(chart, product).map(r => ({ ...r.size, measures: r.measures }))) : [];
  return flagged.map(c => {
    const up = c.verdict === 'small';
    const idx = rows.findIndex(r => r.size === c.size.size);
    if (idx === -1) return { size: c.size.size, up, fromChart: false, parts: [] };
    const parts = [];
    for (const [measure, cur] of Object.entries(rows[idx].measures)) {
      const neighbour = up ? (rows[idx + 1] || rows[idx - 1]) : (rows[idx - 1] || rows[idx + 1]);
      const other = neighbour?.measures[measure];
      if (!Number.isFinite(other)) continue;
      const step = Math.abs(other - cur);
      if (!step) continue;
      const delta = Math.max(0.5, roundHalf(step / 2));
      const unit = /\b(in|inch|inches)\b|"/i.test(measure) ? 'in' : 'cm';
      const label = measure.replace(/\s*[(（][^)）]*[)）]\s*/g, '').trim();
      const next = Math.round((cur + (up ? delta : -delta)) * 10) / 10;
      parts.push({ label, delta, unit, cur, next });
    }
    return { size: c.size.size, up, fromChart: true, parts };
  });
}

/**
 * English fit note a merchant can paste on the product page, or null when there is nothing to say.
 * Returns { text, kind, p }; kind + p let the UI explain the note in other languages ("fitMeaning.<kind>").
 */
export function fitNote(sizes) {
  const small = sizes.filter(c => c.verdict === 'small').map(c => c.size.size);
  const large = sizes.filter(c => c.verdict === 'large').map(c => c.size.size);
  const normal = sizes.filter(c => c.verdict === 'normal').map(c => c.size.size);
  const judged = small.length + large.length + normal.length;
  const list = a => (a.length === 1 ? `Size ${a[0]} runs` : `Sizes ${a.slice(0, -1).join(', ')} and ${a[a.length - 1]} run`);
  if (small.length && large.length) {
    const v = a => `${a.join('/')} ${a.length === 1 ? 'runs' : 'run'}`;
    return {
      text: `Fit varies by size: ${v(small)} small, ${v(large)} large — please check the size chart before ordering.`,
      kind: 'mixed', p: { small: small.join('/'), large: large.join('/') },
    };
  }
  if (small.length) {
    return small.length * 2 >= judged
      ? { text: 'Runs small — we recommend sizing up.', kind: 'allSmall', p: {} }
      : { text: `${list(small)} small — if you're between sizes, we recommend sizing up.`, kind: 'someSmall', p: { sizes: small.join('/') } };
  }
  if (large.length) {
    return large.length * 2 >= judged
      ? { text: 'Runs large — we recommend sizing down.', kind: 'allLarge', p: {} }
      : { text: `${list(large)} large — if you're between sizes, we recommend sizing down.`, kind: 'someLarge', p: { sizes: large.join('/') } };
  }
  const unconfirmed = sizes.some(c => c.verdict === 'unconfirmed');
  if (normal.length >= 2 && !unconfirmed) return { text: 'True to size — order your usual size.', kind: 'tts', p: {} };
  return null;
}

/**
 * Main entry. `files` are results of loadFile(); `chartText` is an optional size chart CSV.
 * When a dedicated returns file is present, refunds in the orders export are not counted as
 * returns (they would double count); orders then only provide units sold.
 */
export function analyze(files, { chartText = '' } = {}) {
  const hasReturnsFile = files.some(f => f.kind === 'returns');
  const hasSales = files.some(f => f.kind === 'orders');
  const skipped = { noSize: 0, oneSize: 0, ambiguousRefund: 0 };
  const records = [];
  for (const f of files) {
    const r = toRecords(f, { inferReturnsFromRefunds: !hasReturnsFile });
    records.push(...r.records);
    for (const k of Object.keys(skipped)) skipped[k] += r.skipped[k];
  }

  const products = new Map();
  for (const rec of records) {
    const key = rec.product.toLowerCase();
    if (!products.has(key)) products.set(key, { product: rec.product, cells: new Map() });
    const p = products.get(key);
    const sk = `${rec.size.family}:${rec.size.size}`;
    if (!p.cells.has(sk)) p.cells.set(sk, emptyCell(rec.size));
    const c = p.cells.get(sk);
    if (rec.type === 'sale') { c.sold += rec.qty; continue; }
    c.returns += rec.qty;
    if (rec.exchange) c[rec.exchange].exchange += rec.qty;
    else if (rec.reason === 'small' || rec.reason === 'large') c[rec.reason].reason += rec.qty;
    else c[rec.reason] += rec.qty;
  }

  const chart = chartText ? parseSizeChart(chartText) : [];
  let storeSold = 0;
  let storeReturns = 0;
  for (const p of products.values()) for (const c of p.cells.values()) { storeSold += c.sold; storeReturns += c.returns; }
  const storeRate = storeSold ? storeReturns / storeSold : null;

  const result = [];
  for (const p of products.values()) {
    const cells = sortSizes([...p.cells.values()].map(c => ({ ...c.size, cell: c }))).map(x => x.cell);
    const sold = cells.reduce((a, c) => a + c.sold, 0);
    const returns = cells.reduce((a, c) => a + c.returns, 0);
    const baselineRate = cells.length > 1 && sold ? returns / sold : storeRate;
    const avgReturnsPerSize = returns / cells.length;
    const sizes = cells.map(c => {
      const j = judgeCell(c, { hasSales, baselineRate, avgReturnsPerSize });
      const evidence = c.small.exchange + c.small.reason + c.large.exchange + c.large.reason + c.fit;
      return { ...c, ...j, evidence };
    });
    const sizeIssueUnits = sizes.reduce((a, c) => a + c.evidence, 0);
    const flagged = sizes.filter(c => c.verdict === 'small' || c.verdict === 'large').length;
    const unconfirmed = sizes.filter(c => c.verdict === 'unconfirmed').length;
    result.push({
      product: p.product,
      sold, returns, sizeIssueUnits, flagged, unconfirmed,
      returnRate: sold ? returns / sold : null,
      sizes,
      fitNote: fitNote(sizes),
      suggestions: chartSuggestions(p.product, sizes, chart),
      hasChart: chart.length > 0 && chartFor(chart, p.product).length > 0,
    });
  }
  result.sort((a, b) => (b.flagged - a.flagged) || (b.unconfirmed - a.unconfirmed)
    || (b.sizeIssueUnits - a.sizeIssueUnits) || (b.returns - a.returns) || a.product.localeCompare(b.product));

  const totals = { sold: storeSold, returns: storeReturns, small: 0, large: 0, fit: 0, other: 0, unknown: 0, exchange: 0 };
  for (const p of result) for (const c of p.sizes) {
    totals.small += c.small.exchange + c.small.reason;
    totals.large += c.large.exchange + c.large.reason;
    totals.exchange += c.small.exchange + c.large.exchange;
    totals.fit += c.fit; totals.other += c.other; totals.unknown += c.unknown;
  }
  return {
    products: result,
    totals,
    hasSales,
    hasReturnsFile,
    refundsInferred: hasSales && !hasReturnsFile,
    skipped,
    chartRows: chart.length,
    files: files.map(f => ({ name: f.name, format: f.format, kind: f.kind, rows: f.rows.length, droppedColumns: f.droppedColumns.length })),
  };
}
