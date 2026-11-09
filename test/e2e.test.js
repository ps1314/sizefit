// End-to-end: fixtures → loadFile → analyze → HTML report. Checks verdicts and that no
// personal data from the source files leaks into the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV } from '../src/csv.js';
import { loadFile, isPiiHeader } from '../src/formats.js';
import { analyze } from '../src/analyze.js';
import { renderReportDocument } from '../src/report.js';

const read = n => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const chartText = read('size_chart.csv');

function piiValues(name) {
  const { headers, rows } = parseCSV(read(name));
  const out = new Set();
  for (const h of headers.filter(h => isPiiHeader(h) && h !== 'Name')) {
    for (const r of rows) if (r[h] && r[h].length > 3 && !/^(US|true|false|yes|no)$/i.test(r[h])) out.add(r[h]);
  }
  return out;
}

function run(names, lang = 'zh') {
  const files = names.map(n => loadFile(n, read(n)));
  const a = analyze(files, { chartText });
  const html = renderReportDocument(a, { lang, generatedAt: new Date('2026-11-09T00:00:00Z') });
  return { files, a, html };
}

function assertNoPii(names, html) {
  for (const n of names) {
    const values = piiValues(n);
    assert.ok(values.size > 0, `${n} should contain fake PII to test against`);
    for (const v of values) assert.ok(!html.includes(v), `${n}: "${v}" leaked into report`);
  }
  assert.doesNotMatch(html, /[\w.+-]+@example\.com/);
  assert.doesNotMatch(html, /555-01\d\d/);
  assert.doesNotMatch(html, /Call me at|pls refund to|Gift for/); // free-text notes never rendered
}

const verdicts = (a, product) => Object.fromEntries(
  a.products.find(p => p.product === product).sizes.map(c => [c.size.size, c.verdict]));

for (const set of [
  ['shopify_orders_export.csv'],
  ['aftership_returns_export.csv'],
  ['shopify_orders_export.csv', 'loop_returns.csv'],
  ['dirty_returns.csv'],
]) {
  for (const lang of ['zh', 'en']) {
    test(`no PII in ${lang} report: ${set.join(' + ')}`, () => {
      const { files, html } = run(set, lang);
      for (const f of files) assert.ok(f.droppedColumns.length > 0);
      assertNoPii(set, html);
    });
  }
}

test('Shopify orders only: refunds give 待确认, never a direction', () => {
  const { a, html } = run(['shopify_orders_export.csv']);
  assert.equal(a.refundsInferred, true);
  for (const p of a.products) for (const c of p.sizes) assert.ok(!['small', 'large'].includes(c.verdict));
  assert.equal(verdicts(a, 'Classic Crew Tee').S, 'unconfirmed');
  assert.equal(verdicts(a, 'Ribbed Knit Cardigan').XL, 'unconfirmed');
  assert.match(html, /只上传了订单导出/);
});

test('AfterShip returns: finds the planted size problems', () => {
  const { a, html } = run(['aftership_returns_export.csv']);
  const tee = verdicts(a, 'Classic Crew Tee');
  for (const s of ['S', 'M', 'L']) assert.equal(tee[s], 'small', `tee ${s}`);
  const jean = verdicts(a, 'High Rise Straight Jean');
  assert.equal(jean['28'], 'large');
  assert.equal(jean['30'], 'large');
  assert.equal(verdicts(a, 'Ribbed Knit Cardigan').XL, 'large');
  assert.ok(Object.values(verdicts(a, 'Everyday Hoodie')).every(v => v === 'insufficient'));
  assert.equal(a.products[0].product === 'Everyday Hoodie', false);
  assert.match(html, /Runs small — we recommend sizing up\./);
  assert.match(html, /Chest \+3cm（98 → 101）/);
  assert.match(html, /意思：整体偏小，建议买大一码/);
  const en = run(['aftership_returns_export.csv'], 'en').html;
  assert.match(en, /Runs small — we recommend sizing up\./);
  assert.match(en, /Chest \+3 cm \(98 → 101\)/);
  // ≥ half of returns attributable to a concrete direction (the validation pass bar)
  assert.ok((a.totals.small + a.totals.large) / a.totals.returns >= 0.5);
});

test('Orders + Loop: sales as denominator, Loop exchanges as strongest signal', () => {
  const { a } = run(['shopify_orders_export.csv', 'loop_returns.csv']);
  assert.equal(a.refundsInferred, false);
  assert.ok(a.totals.sold > 1500);
  assert.ok(a.totals.exchange > 50);
  const tee = verdicts(a, 'Classic Crew Tee');
  assert.equal(tee.S, 'small');
  assert.equal(verdicts(a, 'Ribbed Knit Cardigan').XL, 'large');
  assert.equal(verdicts(a, 'Ribbed Knit Cardigan').S, 'normal');
  const card = a.products.find(p => p.product === 'Ribbed Knit Cardigan');
  assert.equal(card.fitNote.text, "Size XL runs large — if you're between sizes, we recommend sizing down.");
});

test('dirty export: unknown format is guessed, mostly no conclusions', () => {
  const { files, a } = run(['dirty_returns.csv']);
  assert.equal(files[0].format, 'generic');
  assert.equal(files[0].mapping.product, 'Item');
  assert.equal(files[0].mapping.variant, 'Variant');
  assert.ok(a.skipped.noSize > 0);
  const all = a.products.flatMap(p => p.sizes.map(c => c.verdict));
  assert.ok(!all.includes('small') && !all.includes('large'), 'too few reasons for a direction');
  assert.ok(a.totals.unknown / a.totals.returns > 0.5);
});
