import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DICT, LANGS, OPTIONAL_EMPTY, MISSING, t, detectLang } from '../src/i18n.js';
import { loadFile, ROLES, FORMATS } from '../src/formats.js';
import { analyze, VERDICTS } from '../src/analyze.js';
import { renderReportDocument } from '../src/report.js';

const src = n => readFileSync(new URL(`../${n}`, import.meta.url), 'utf8');
const fixture = n => src(`fixtures/${n}`);

test('both languages have exactly the same keys, none empty unless allowed', () => {
  const [zh, en] = LANGS.map(l => Object.keys(DICT[l]).sort());
  assert.deepEqual(en, zh);
  for (const l of LANGS) {
    for (const [k, v] of Object.entries(DICT[l])) {
      if (!(l === 'en' && OPTIONAL_EMPTY.has(k))) assert.ok(v.trim(), `${l}:${k} is empty`);
    }
  }
});

test('placeholders match between languages', () => {
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(DICT.zh)) {
    if (OPTIONAL_EMPTY.has(k)) continue;
    assert.equal(ph(DICT.en[k]), ph(DICT.zh[k]), k);
  }
});

test('every key used in the code exists in the dictionary', () => {
  const files = ['index.html', ...readdirSync(new URL('../src/', import.meta.url)).map(f => `src/${f}`)];
  const used = new Set();
  for (const f of files) {
    const s = src(f);
    for (const m of s.matchAll(/data-i18n(?:-label)?="([\w.]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/\bT\('([\w.]+)'/g)) used.add(m[1]);
    for (const m of s.matchAll(/\bt\((?:lang|'en'|'zh'), '([\w.]+)'/g)) used.add(m[1]);
  }
  // dynamic keys
  for (const r of ROLES) used.add(`role.${r}`);
  for (const f of [...Object.keys(FORMATS), 'generic']) used.add(`format.${f}`);
  for (const v of VERDICTS) used.add(`verdict.${v}`);
  assert.ok(used.size > 80, `found ${used.size} keys`);
  for (const k of used) assert.ok(k in DICT.zh, `missing key ${k}`);
});

test('language detection: any zh* preference → zh, everything else → en', () => {
  assert.equal(detectLang(['zh-CN', 'en']), 'zh');
  assert.equal(detectLang(['en-US', 'zh-TW']), 'zh');
  assert.equal(detectLang(['en-US', 'fr']), 'en');
  assert.equal(detectLang(['ja']), 'en');
  assert.equal(detectLang([]), 'en');
  assert.equal(detectLang([undefined]), 'en');
});

test('t() fills placeholders and flags missing keys', () => {
  assert.equal(t('en', 'app.chartLoaded', { name: 'x.csv' }), 'Loaded x.csv');
  assert.ok(t('en', 'nope').startsWith(MISSING));
});

const SETS = [
  ['shopify_orders_export.csv'],
  ['aftership_returns_export.csv'],
  ['shopify_orders_export.csv', 'loop_returns.csv'],
  ['dirty_returns.csv'],
];

for (const set of SETS) {
  test(`complete report in both languages: ${set.join(' + ')}`, () => {
    const a = analyze(set.map(n => loadFile(n, fixture(n))), { chartText: fixture('size_chart.csv') });
    for (const lang of LANGS) {
      const html = renderReportDocument(a, { lang });
      assert.ok(!html.includes(MISSING), `${lang}: missing translation in report`);
      assert.doesNotMatch(html, /\{\w+\}/, `${lang}: unfilled placeholder`);
      for (const p of a.products) assert.ok(html.includes(p.product), `${lang}: ${p.product} missing`);
    }
    const en = renderReportDocument(a, { lang: 'en' });
    assert.doesNotMatch(en, /[一-鿿]/, 'English report contains Chinese text');
    const zh = renderReportDocument(a, { lang: 'zh' });
    assert.match(zh, /尺码偏差报告/);
  });
}

test('fit note stays English in the Chinese report, with a Chinese explanation', () => {
  const a = analyze([loadFile('a.csv', fixture('aftership_returns_export.csv'))]);
  const zh = renderReportDocument(a, { lang: 'zh' });
  const en = renderReportDocument(a, { lang: 'en' });
  assert.match(zh, /<q lang="en">Runs small — we recommend sizing up\.<\/q>/);
  assert.match(zh, /意思：整体偏小/);
  assert.match(en, /<q lang="en">Runs small — we recommend sizing up\.<\/q>/);
  assert.doesNotMatch(en, /class="meaning"/);
});

test('no prices in the page or dictionary', () => {
  for (const s of [src('index.html'), JSON.stringify(DICT), src('try/posts.md')]) {
    assert.doesNotMatch(s, /\$\s?\d|\d+\s?\/\s?(?:mo|month|月)|美元/);
  }
});
