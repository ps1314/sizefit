// Renders an analysis result as HTML. Pure string output, so the same code runs in the
// browser and in Node (tests / CLI). Free-text customer notes are never rendered.

import { RULES } from './analyze.js';
import { t } from './i18n.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = x => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);

export const REPORT_CSS = `
.sf-report{--ink:#1d2330;--muted:#5d6675;--line:#e3e6eb;--card:#fff;--soft:#f5f6f8;
  --small:#b45309;--small-bg:#fef3c7;--large:#6d28d9;--large-bg:#ede9fe;--ok:#047857;--ok-bg:#d1fae5;
  --warn:#9a3412;--warn-bg:#ffedd5;--na:#6b7280;--na-bg:#f3f4f6;--accent:#1f4fd1;
  color:var(--ink);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
@media (prefers-color-scheme: dark){.sf-report:not(.sf-light){--ink:#e7e9ee;--muted:#9aa3b2;--line:#2c323d;--card:#171b22;--soft:#1e232c;
  --small:#fbbf24;--small-bg:#3a2a07;--large:#c4b5fd;--large-bg:#2a1f4a;--ok:#6ee7b7;--ok-bg:#0d3326;
  --warn:#fdba74;--warn-bg:#3b1d0b;--na:#9ca3af;--na-bg:#262b33;--accent:#8fb0ff}}
.sf-report h1{font-size:22px;margin:0 0 4px}
.sf-report h2{font-size:17px;margin:28px 0 10px}
.sf-report h3{font-size:16px;margin:0}
.sf-report .muted{color:var(--muted)}
.sf-report .meta{color:var(--muted);font-size:13px;margin-bottom:16px}
.sf-report .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:14px 0}
.sf-report .kpi{background:var(--soft);border-radius:10px;padding:10px 12px}
.sf-report .kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums}
.sf-report .kpi span{font-size:12px;color:var(--muted)}
.sf-report .note{background:var(--warn-bg);color:var(--warn);border-radius:8px;padding:8px 12px;margin:8px 0;font-size:13px}
.sf-report table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
.sf-report th,.sf-report td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
.sf-report th{font-size:12px;color:var(--muted);font-weight:600;white-space:nowrap}
.sf-report td.n,.sf-report th.n{text-align:right}
.sf-report .scroll{overflow-x:auto}
.sf-report .product table{min-width:880px}
.sf-report table.rank{min-width:520px}
.sf-report td.why{min-width:200px}
.sf-report td.ev{white-space:nowrap}
.sf-report .badge{display:inline-block;border-radius:999px;padding:1px 9px;font-size:12px;font-weight:600;white-space:nowrap}
.sf-report .v-small{color:var(--small);background:var(--small-bg)}
.sf-report .v-large{color:var(--large);background:var(--large-bg)}
.sf-report .v-normal{color:var(--ok);background:var(--ok-bg)}
.sf-report .v-unconfirmed{color:var(--warn);background:var(--warn-bg)}
.sf-report .v-insufficient{color:var(--na);background:var(--na-bg)}
.sf-report .product{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:14px 0;break-inside:avoid}
.sf-report .phead{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;margin-bottom:10px}
.sf-report .fitnote{display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:var(--soft);border-radius:8px;padding:10px 12px;margin:12px 0 6px}
.sf-report .fitnote q{font-weight:600;quotes:"“" "”"}
.sf-report .fitnote .meaning{flex-basis:100%;font-size:12px;color:var(--muted)}
.sf-report .fitnote button{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:2px 10px;cursor:pointer}
.sf-report ul.sugg{margin:6px 0 0;padding-left:20px}
.sf-report .why{font-size:12px;color:var(--muted)}
.sf-report .rank td:first-child{color:var(--muted)}
.sf-report footer{margin-top:28px;font-size:12px;color:var(--muted)}
.sf-report footer li{margin:2px 0}
@media print{.sf-report{--card:#fff;--soft:#f5f6f8;color:#000}.sf-report button{display:none}.sf-report .product{border-color:#ccc}}
@media (max-width:640px){.sf-report .kpi b{font-size:18px}.sf-report th,.sf-report td{padding:6px 5px}}
`;

/** Render the language-neutral pieces of an analysis result. */
export function whyText(lang, why) {
  const p = { ...why.p };
  if (p.word) p.word = t(lang, `word.${p.word}`);
  return t(lang, `why.${why.key}`, p);
}

export function suggestionText(lang, s) {
  if (!s.fromChart) return t(lang, s.up ? 'sugg.noChartUp' : 'sugg.noChartDown', { size: s.size });
  if (!s.parts.length) return t(lang, s.up ? 'sugg.halfUp' : 'sugg.halfDown', { size: s.size });
  const parts = s.parts.map(x => t(lang, 'sugg.part', { ...x, sign: s.up ? '+' : '−' })).join(t(lang, 'sugg.partSep'));
  return t(lang, 'sugg.chart', { size: s.size, parts });
}

/** Explanation of the (always English) fit note in the UI language; empty when the UI is English. */
export function fitNoteMeaning(lang, note) {
  return note ? t(lang, `fitMeaning.${note.kind}`, note.p) : '';
}

/** Report body (inside a .sf-report wrapper). */
export function renderReport(a, { lang = 'en', generatedAt = new Date() } = {}) {
  const T = (k, p) => t(lang, k, p);
  const badge = v => `<span class="badge v-${v}">${esc(T(`verdict.${v}`))}</span>`;
  const productName = p => esc(p.product || T('report.unnamedProduct'));

  const evidenceCell = e => {
    const total = e.exchange + e.reason;
    if (!total) return '<span class="muted">0</span>';
    const parts = [];
    if (e.exchange) parts.push(esc(T('report.evExchange', { n: e.exchange })));
    if (e.reason) parts.push(esc(T('report.evReason', { n: e.reason })));
    return `<b>${total}</b> <span class="why">${parts.join(' · ')}</span>`;
  };

  const summaryBadges = p => {
    const groups = {};
    for (const c of p.sizes) {
      if (c.verdict === 'normal' || c.verdict === 'insufficient') continue;
      (groups[c.verdict] ||= []).push(c.size.size);
    }
    const out = Object.entries(groups).map(([v, list]) => `${esc(list.join('/'))} ${badge(v)}`);
    if (out.length) return out.join(' ');
    return p.sizes.every(c => c.verdict === 'insufficient') ? badge('insufficient') : badge('normal');
  };

  const productSection = (p, i) => {
    const sales = a.hasSales;
    const rows = p.sizes.map(c => `
      <tr>
        <td><b>${esc(c.size.size)}</b></td>
        ${sales ? `<td class="n">${c.sold}</td>` : ''}
        <td class="n">${c.returns}</td>
        <td class="ev">${evidenceCell(c.small)}</td>
        <td class="ev">${evidenceCell(c.large)}</td>
        <td class="n">${c.fit || '<span class="muted">0</span>'}</td>
        <td class="n">${c.other}/${c.unknown}</td>
        <td>${badge(c.verdict)}</td>
        <td class="n">${c.evidence}</td>
        <td class="why">${esc(whyText(lang, c.why))}</td>
      </tr>`).join('');
    let note;
    if (p.fitNote) {
      const meaning = fitNoteMeaning(lang, p.fitNote);
      note = `<div class="fitnote"><span class="muted">${esc(T('report.fitNoteLabel'))}</span><q lang="en">${esc(p.fitNote.text)}</q>`
        + `<button type="button" data-copy="${esc(p.fitNote.text)}" data-copied="${esc(T('report.copied'))}">${esc(T('report.copy'))}</button>`
        + (meaning ? `<span class="meaning">${esc(T('report.fitNoteMeaning', { meaning }))}</span>` : '')
        + '</div>';
    } else {
      const review = p.sizes.some(c => c.verdict === 'unconfirmed');
      note = `<div class="fitnote muted">${esc(T(review ? 'report.fitNoteNoneReview' : 'report.fitNoteNoneData'))}</div>`;
    }
    const sugg = p.suggestions.length
      ? `<div><b>${esc(T('report.suggTitle'))}</b>${p.hasChart ? '' : ` <span class="muted">${esc(T('report.suggNoChart'))}</span>`}
        <ul class="sugg">${p.suggestions.map(s => `<li>${esc(suggestionText(lang, s))}</li>`).join('')}</ul></div>`
      : '';
    const meta = [T('report.productReturns', { n: p.returns })];
    if (p.sold) meta.push(T('report.productSales', { sold: p.sold, rate: pct(p.returnRate) }));
    meta.push(T('report.productSizeIssue', { n: p.sizeIssueUnits }));
    return `
  <section class="product" id="p${i}">
    <div class="phead"><h3>${i + 1}. ${productName(p)}</h3>
      <span class="muted">${esc(meta.join(' · '))}</span>
    </div>
    <div class="scroll"><table>
      <thead><tr><th>${esc(T('report.thSize'))}</th>${sales ? `<th class="n">${esc(T('report.thSold'))}</th>` : ''}
        <th class="n">${esc(T('report.thReturns'))}</th><th>${esc(T('report.thSmallEv'))}</th><th>${esc(T('report.thLargeEv'))}</th>
        <th class="n">${esc(T('report.thFit'))}</th><th class="n">${esc(T('report.thOtherUnknown'))}</th><th>${esc(T('report.thVerdict'))}</th>
        <th class="n">${esc(T('report.thEvidence'))}</th><th>${esc(T('report.thWhy'))}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${note}
    ${sugg}
  </section>`;
  };

  const tot = a.totals;
  const flaggedSizes = a.products.reduce((n, p) => n + p.flagged, 0);
  const unconfirmedSizes = a.products.reduce((n, p) => n + p.unconfirmed, 0);
  const notes = [];
  if (a.refundsInferred) notes.push(T('report.noteRefunds'));
  if (!a.hasSales) notes.push(T('report.noteNoSales'));
  if (a.skipped.noSize) notes.push(T('report.noteNoSize', { n: a.skipped.noSize }));
  if (a.skipped.ambiguousRefund) notes.push(T('report.noteAmbiguous', { n: a.skipped.ambiguousRefund }));

  const ranked = a.products.filter(p => p.flagged || p.unconfirmed || p.sizeIssueUnits);
  const rankRows = ranked.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><a href="#p${a.products.indexOf(p)}">${productName(p)}</a></td>
        <td>${summaryBadges(p)}</td>
        <td class="n">${p.sizeIssueUnits}</td>
        <td class="n">${p.returns}</td>
        ${a.hasSales ? `<td class="n">${pct(p.returnRate)}</td>` : ''}
      </tr>`).join('');

  const files = a.files.map(f => T('report.fileMeta', {
    name: f.name, format: T(`format.${f.format}`), rows: f.rows, dropped: f.droppedColumns,
  })).join(T('report.fileSep'));
  const R = RULES;

  return `
<div class="sf-report" lang="${lang === 'zh' ? 'zh-CN' : 'en'}">
  <h1>${esc(T('report.title'))}</h1>
  <div class="meta">${esc(T('report.generated', { time: generatedAt.toISOString().slice(0, 16).replace('T', ' ') }))} ·
    ${esc(T('report.data'))}${esc(files)}${a.chartRows ? ` · ${esc(T('report.chartRows', { n: a.chartRows }))}` : ''}</div>
  ${notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}
  <div class="kpis">
    <div class="kpi"><b>${tot.returns}</b><span>${esc(T('report.kpiReturns'))}</span></div>
    ${a.hasSales ? `<div class="kpi"><b>${tot.sold}</b><span>${esc(T('report.kpiSold'))}</span></div>` : ''}
    <div class="kpi"><b>${tot.small} / ${tot.large}</b><span>${esc(T('report.kpiDirection', { n: tot.exchange }))}</span></div>
    <div class="kpi"><b>${tot.fit}</b><span>${esc(T('report.kpiFit'))}</span></div>
    <div class="kpi"><b>${tot.returns ? pct((tot.small + tot.large) / tot.returns) : '—'}</b><span>${esc(T('report.kpiAttributed'))}</span></div>
    <div class="kpi"><b>${flaggedSizes} / ${unconfirmedSizes}</b><span>${esc(T('report.kpiFlagged'))}</span></div>
  </div>

  <h2>${esc(T('report.rankTitle'))}</h2>
  ${ranked.length ? `<div class="scroll"><table class="rank">
    <thead><tr><th>#</th><th>${esc(T('report.thProduct'))}</th><th>${esc(T('report.thVerdict'))}</th>
      <th class="n">${esc(T('report.thSizeIssue'))}</th><th class="n">${esc(T('report.thReturns'))}</th>
      ${a.hasSales ? `<th class="n">${esc(T('report.thRate'))}</th>` : ''}</tr></thead>
    <tbody>${rankRows}</tbody></table></div>` : `<p class="muted">${esc(T('report.rankNone'))}</p>`}

  <h2>${esc(T('report.sizesTitle'))}</h2>
  ${a.products.map(productSection).join('')}

  <footer>
    <b>${esc(T('report.rulesTitle'))}</b>
    <ul>
      <li>${esc(T('report.ruleSignals'))}</li>
      <li>${esc(T('report.ruleDirection', { min: R.MIN_DIRECTIONAL }))}</li>
      <li>${esc(T('report.ruleReview', { mult: R.HIGH_RATE_MULT, gap: R.HIGH_RATE_MIN_GAP * 100, fit: R.FIT_UNCLEAR_MIN }))}</li>
      <li>${esc(T('report.ruleNormal', { sold: R.MIN_SOLD_FOR_NORMAL, rate: R.MAX_DIR_RATE_NORMAL * 100, returns: R.MIN_RETURNS_NORMAL_NO_SALES, share: R.MAX_SIZE_SHARE_NORMAL_NO_SALES * 100 }))}</li>
      <li>${esc(T('report.rulePrivacy'))}</li>
    </ul>
  </footer>
</div>`;
}

/** Standalone HTML document for "download HTML", in the given language. */
export function renderReportDocument(a, opts = {}) {
  const lang = opts.lang || 'en';
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t(lang, 'report.title'))}</title>
<style>body{margin:0;padding:24px 16px;background:#fff}@media (prefers-color-scheme: dark){body{background:#0f1217}}
.wrap{max-width:1080px;margin:0 auto}${REPORT_CSS}</style></head>
<body><div class="wrap">${renderReport(a, opts)}</div>
<script>document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent=b.dataset.copied})})</script>
</body></html>`;
}
