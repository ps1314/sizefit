import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeCell, analyze, fitNote, chartSuggestions, RULES } from '../src/analyze.js';
import { loadFile } from '../src/formats.js';
import { sizeFromVariant } from '../src/sizes.js';
import { suggestionText } from '../src/report.js';

const cell = (o = {}) => ({
  size: sizeFromVariant(o.size || 'M'), sold: 0, returns: 0,
  small: { exchange: 0, reason: 0 }, large: { exchange: 0, reason: 0 }, fit: 0, other: 0, unknown: 0, ...o,
});

test('insufficient sample: fewer than MIN_DIRECTIONAL signals never yields a direction', () => {
  for (let n = 0; n < RULES.MIN_DIRECTIONAL; n++) {
    const v = judgeCell(cell({ returns: n, small: { exchange: n, reason: 0 } })).verdict;
    assert.equal(v, 'insufficient', `n=${n}`);
  }
});

test('enough one-sided signals → direction', () => {
  assert.equal(judgeCell(cell({ returns: 5, small: { exchange: 3, reason: 2 } })).verdict, 'small');
  assert.equal(judgeCell(cell({ returns: 6, large: { exchange: 0, reason: 5 }, small: { exchange: 0, reason: 1 } })).verdict, 'large');
});

test('split signals → 待确认, not a direction', () => {
  assert.equal(judgeCell(cell({ returns: 10, small: { exchange: 0, reason: 5 }, large: { exchange: 0, reason: 5 } })).verdict, 'unconfirmed');
  assert.equal(judgeCell(cell({ returns: 5, small: { exchange: 0, reason: 3 }, large: { exchange: 0, reason: 2 } })).verdict, 'unconfirmed');
});

test('direction-less size complaints → 待确认', () => {
  assert.equal(judgeCell(cell({ returns: 4, fit: 3 })).verdict, 'unconfirmed');
});

test('high return rate without reasons → 待确认', () => {
  const j = judgeCell(cell({ sold: 100, returns: 25, unknown: 25 }), { hasSales: true, baselineRate: 0.1 });
  assert.equal(j.verdict, 'unconfirmed');
  assert.equal(j.why.key, 'highRate');
  assert.equal(j.why.p.base, '10%');
});

test('normal needs enough sales or enough reasoned returns', () => {
  assert.equal(judgeCell(cell({ sold: 100, returns: 5, other: 5 }), { hasSales: true, baselineRate: 0.05 }).verdict, 'normal');
  assert.equal(judgeCell(cell({ sold: 10, returns: 1, other: 1 }), { hasSales: true, baselineRate: 0.05 }).verdict, 'insufficient');
  assert.equal(judgeCell(cell({ returns: 12, other: 11, small: { exchange: 0, reason: 1 } })).verdict, 'normal');
  // 12 returns but all without reasons: cannot call it normal
  assert.equal(judgeCell(cell({ returns: 12, unknown: 12 })).verdict, 'insufficient');
});

test('directional complaints that are a tiny share of sales are treated as noise', () => {
  assert.equal(judgeCell(cell({ sold: 1000, returns: 6, small: { exchange: 0, reason: 6 } }), { hasSales: true, baselineRate: 0.01 }).verdict, 'normal');
});

const csv = rows => 'title,sku,return_reason,parent_return_reason,outcome,exchange_variant\n' + rows.join('\n') + '\n';

test('exchange direction: S→M means S runs small, L→M means L runs large', () => {
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push('Tee,TEE-BLK-S,Other,Other,exchange,M / Black');
  for (let i = 0; i < 6; i++) rows.push('Tee,TEE-BLK-L,,,exchange,M / Black');
  rows.push('Tee,TEE-BLK-M,Changed Mind,,exchange,M / White'); // same size, colour swap: no signal
  const a = analyze([loadFile('loop.csv', csv(rows))]);
  const tee = a.products[0];
  const by = Object.fromEntries(tee.sizes.map(c => [c.size.size, c]));
  assert.equal(by.S.small.exchange, 6);
  assert.equal(by.S.verdict, 'small');
  assert.equal(by.L.large.exchange, 6);
  assert.equal(by.L.verdict, 'large');
  assert.equal(by.M.small.exchange + by.M.large.exchange, 0);
});

test('exchange beats the written reason when they disagree', () => {
  const a = analyze([loadFile('loop.csv', csv(['Tee,TEE-S,Too Large,Size/Fit,exchange,M']))]);
  const c = a.products[0].sizes[0];
  assert.equal(c.small.exchange, 1);
  assert.equal(c.large.reason, 0);
});

test('fit notes', () => {
  const sz = (size, verdict) => ({ size: { size }, verdict });
  assert.equal(fitNote([sz('S', 'small'), sz('M', 'small'), sz('L', 'normal')]).text, 'Runs small — we recommend sizing up.');
  const some = fitNote([sz('S', 'normal'), sz('M', 'normal'), sz('XL', 'large')]);
  assert.equal(some.text, "Size XL runs large — if you're between sizes, we recommend sizing down.");
  assert.deepEqual([some.kind, some.p], ['someLarge', { sizes: 'XL' }]);
  assert.match(fitNote([sz('S', 'small'), sz('XL', 'large')]).text, /^Fit varies by size: S runs small, XL runs large/);
  assert.equal(fitNote([sz('S', 'normal'), sz('M', 'normal')]).text, 'True to size — order your usual size.');
  assert.equal(fitNote([sz('S', 'insufficient')]), null);
  assert.equal(fitNote([sz('S', 'normal'), sz('M', 'normal'), sz('L', 'unconfirmed')]), null);
});

test('size chart suggestions use half the grading step', () => {
  const chart = [
    { product: 'tee', size: sizeFromVariant('S'), measures: { 'Chest (cm)': 92 } },
    { product: 'tee', size: sizeFromVariant('M'), measures: { 'Chest (cm)': 96 } },
    { product: 'tee', size: sizeFromVariant('L'), measures: { 'Chest (cm)': 100 } },
  ];
  const [s] = chartSuggestions('Tee', [{ size: sizeFromVariant('M'), verdict: 'small' }], chart);
  assert.deepEqual(s.parts, [{ label: 'Chest', delta: 2, unit: 'cm', cur: 96, next: 98 }]);
  assert.equal(suggestionText('zh', s), 'M：Chest +2cm（96 → 98）');
  assert.equal(suggestionText('en', s), 'M: Chest +2 cm (96 → 98)');
  const [n] = chartSuggestions('Other', [{ size: sizeFromVariant('M'), verdict: 'large' }], []);
  assert.equal(n.fromChart, false);
  assert.match(suggestionText('zh', n), /缩小约半个码/);
  assert.match(suggestionText('en', n), /take in all measurements by about half a size/);
});

import { estimateFixes, parseDate } from '../src/analyze.js';
import { HERO_EXAMPLE } from '../src/hero.js';
import { readFileSync } from 'node:fs';
import { renderReportDocument } from '../src/report.js';

test('parseDate handles Shopify, ISO, month-only and US formats', () => {
  assert.equal(parseDate('2026-05-01 10:20:00 -0400'), Date.UTC(2026, 4, 1));
  assert.equal(parseDate('2026-10-02T12:00:00Z'), Date.UTC(2026, 9, 2));
  assert.equal(parseDate('2026-09'), Date.UTC(2026, 8, 1));
  assert.equal(parseDate('9/14/2026'), Date.UTC(2026, 8, 14));
  assert.ok(Number.isNaN(parseDate('')));
  assert.ok(Number.isNaN(parseDate('Refund')));
});

const fixProducts = (price = 40) => [{
  product: 'Tee', unitPrice: price,
  sizes: [
    { size: { size: 'S' }, verdict: 'small', evidence: 12, unitPrice: price },
    { size: { size: 'M' }, verdict: 'unconfirmed', evidence: 20, unitPrice: price },
    { size: { size: 'L' }, verdict: 'large', evidence: 6, unitPrice: null },
    { size: { size: 'XL' }, verdict: 'normal', evidence: 30, unitPrice: price },
    { size: { size: 'XS' }, verdict: 'insufficient', evidence: 3, unitPrice: price },
  ],
}];

test('fixes: small/large first, then needs review; normal/insufficient never listed', () => {
  const f = estimateFixes(fixProducts(), { days: 61 });
  assert.deepEqual(f.items.map(i => i.size), ['S', 'L', 'M']);
});

test('fixes: monthly amount = units × unit price × 30.44 / days', () => {
  const f = estimateFixes(fixProducts(), { days: 61 });
  const s = f.items[0];
  assert.equal(f.monthly, true);
  assert.ok(Math.abs(s.unitsPerMonth - 12 * 30.44 / 61) < 1e-9);
  assert.ok(Math.abs(s.amountPerMonth - 12 * 40 * 30.44 / 61) < 1e-9);
  // L has no own price → falls back to the product's average price
  assert.ok(Math.abs(f.items[1].amountPerMonth - 6 * 40 * 30.44 / 61) < 1e-9);
  assert.ok(Math.abs(f.totalAmountPerMonth - 38 * 40 * 30.44 / 61) < 1e-9);
});

test('fixes without prices: monthly units, no amount', () => {
  const f = estimateFixes(fixProducts(null), { days: 61 });
  assert.equal(f.monthly, true);
  assert.ok(f.items.every(i => i.amountPerMonth === null && i.unitsPerMonth > 0));
  assert.equal(f.totalAmountPerMonth, null);
});

test('fixes without dates (or too short a span): totals only, no money', () => {
  for (const period of [null, { days: 1 }, { days: 13 }]) {
    const f = estimateFixes(fixProducts(), period);
    assert.equal(f.monthly, false);
    assert.ok(f.items.every(i => i.amountPerMonth === null && i.unitsPerMonth === null));
    assert.equal(f.totalUnits, 38);
    assert.equal(f.totalAmountPerMonth, null);
  }
});

const fx = n => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

test('report shows money only when price and dates exist', () => {
  const withBoth = analyze(['shopify_orders_export.csv', 'loop_returns.csv'].map(n => loadFile(n, fx(n))));
  assert.equal(withBoth.currency, 'USD');
  assert.ok(withBoth.period.days > 100);
  const zh = renderReportDocument(withBoth, { lang: 'zh' });
  const en = renderReportDocument(withBoth, { lang: 'en' });
  assert.match(zh, /先改这几个/);
  assert.match(zh, /≈ US\$\d[\d,]*\/月/);
  assert.match(en, /Fix these first/);
  assert.match(en, /≈ \$\d[\d,]*\/mo/);
  assert.match(en, /an estimate/);

  // AfterShip sample: prices but every return has the same date → no monthly money
  const noSpan = analyze([loadFile('a.csv', fx('aftership_returns_export.csv'))]);
  assert.equal(noSpan.fixes.monthly, false);
  const html = renderReportDocument(noSpan, { lang: 'en' });
  assert.doesNotMatch(html, /≈ \$/);
  assert.match(html, /these are totals, not monthly figures/);

  // Dirty sample: no price, no dates
  const dirty = analyze([loadFile('d.csv', fx('dirty_returns.csv'))]);
  assert.equal(dirty.period, null);
  assert.ok(dirty.fixes.items.every(i => i.unitPrice === null && i.amountPerMonth === null));
});

test('hero example matches the sample analysis', () => {
  const a = analyze(HERO_EXAMPLE.sample.map(n => loadFile(n, fx(n))));
  const p = a.products.find(x => x.product === HERO_EXAMPLE.product);
  const c = p.sizes.find(x => x.size.size === HERO_EXAMPLE.size);
  assert.equal(c.verdict, HERO_EXAMPLE.verdict);
  assert.equal(c.returns, HERO_EXAMPLE.returns);
  assert.equal(c.large.exchange + c.large.reason, HERO_EXAMPLE.n);
  assert.equal(c.large.exchange, HERO_EXAMPLE.ex);
  assert.equal(p.fitNote.text, HERO_EXAMPLE.fitNote);
  const fix = a.fixes.items.find(i => i.product === HERO_EXAMPLE.product && i.size === HERO_EXAMPLE.size);
  assert.equal(Math.round(fix.amountPerMonth), HERO_EXAMPLE.amountPerMonth);
  assert.equal(a.currency, HERO_EXAMPLE.currency);
});
