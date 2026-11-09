import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeCell, analyze, fitNote, chartSuggestions, RULES } from '../src/analyze.js';
import { loadFile } from '../src/formats.js';
import { sizeFromVariant } from '../src/sizes.js';

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
  assert.match(j.why, /退货率/);
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
  assert.equal(fitNote([sz('S', 'small'), sz('M', 'small'), sz('L', 'normal')]), 'Runs small — we recommend sizing up.');
  assert.equal(fitNote([sz('S', 'normal'), sz('M', 'normal'), sz('XL', 'large')]), "Size XL runs large — if you're between sizes, we recommend sizing down.");
  assert.match(fitNote([sz('S', 'small'), sz('XL', 'large')]), /^Fit varies by size: S runs small, XL runs large/);
  assert.equal(fitNote([sz('S', 'normal'), sz('M', 'normal')]), 'True to size — order your usual size.');
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
  assert.equal(s.text, 'M：Chest +2cm（96 → 98）');
  const [n] = chartSuggestions('Other', [{ size: sizeFromVariant('M'), verdict: 'large' }], []);
  assert.match(n.text, /缩小约半个码/);
});
