// Browser UI: load files, edit column mapping, render the report, export HTML / print to PDF.
// Nothing is sent over the network except fetching the bundled sample files.

import { loadFile, ROLES, FORMATS, guessKind } from './formats.js';
import { analyze } from './analyze.js';
import { renderReport, renderReportDocument, REPORT_CSS, formatMoney } from './report.js';
import { HERO_EXAMPLE } from './hero.js';
import { CONFIG } from './config.js';
import { track, trackingEnabled, rowBucket } from './track.js';
import { t, initialLang, saveLang } from './i18n.js';

const $ = sel => document.querySelector(sel);
const state = { files: [], chartText: '', chartName: '', analysis: null, lang: initialLang() };
const T = (key, params) => t(state.lang, key, params);

if (trackingEnabled) $('#analyticsNote').hidden = false;
const waitlistUrl = (CONFIG.waitlistUrl || '').trim();
const waitlistOn = /^https:\/\//.test(waitlistUrl);

const style = document.createElement('style');
style.textContent = REPORT_CSS;
document.head.appendChild(style);

const readText = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsText(file);
});

async function addFiles(list) {
  // Own data replaces any sample that was loaded earlier — mixing them would corrupt the report.
  state.files = state.files.filter(f => !f.sample);
  let added = 0;
  for (const f of list) {
    try {
      const loaded = loadFile(f.name, await readText(f));
      state.files.push(loaded);
      added++;
      track('upload');
      track(`format/${loaded.format}`);
      track(`rows/${rowBucket(loaded.rows.length)}`);
    } catch (e) {
      alert(T('app.readFailed', { name: f.name, error: e.message }));
    }
  }
  refresh();
  if (added) {
    track('report');
    $('#filesPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function loadSample(names) {
  state.files = [];
  for (const n of names) {
    const text = await (await fetch(`fixtures/${n}`)).text();
    state.files.push({ ...loadFile(n, text), sample: true });
  }
  track(`sample/${names.map(n => n.replace(/\.csv$/, '')).join('+')}`);
  refresh();
  track('report');
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderFiles() {
  $('#filesPanel').hidden = !state.files.length;
  $('#chosen').innerHTML = state.files.map((f, i) => `
    <span class="chip"><span class="chip-name">${esc(f.name)}</span>${f.sample ? `<span class="chip-tag">${esc(T('file.sampleTag'))}</span>` : ''}
      <button type="button" class="chip-x" data-remove="${i}" aria-label="${esc(T('file.remove'))} ${esc(f.name)}" title="${esc(T('file.remove'))}">×</button></span>`).join('');
  $('#files').innerHTML = state.files.map((f, i) => {
    const opts = sel => [`<option value="">${esc(T('file.unused'))}</option>`, ...f.headers.map(h =>
      `<option value="${esc(h)}"${h === sel ? ' selected' : ''}>${esc(h)}</option>`)].join('');
    const roles = ROLES
      .filter(role => f.kind === 'orders' || !['financialStatus', 'refundedAmount'].includes(role))
      .map(role => `<label>${esc(T(`role.${role}`))}<select data-file="${i}" data-role="${role}">${opts(f.mapping[role])}</select></label>`)
      .join('');
    const missing = !(f.mapping.product || f.mapping.lineName || f.mapping.sku);
    return `
      <div class="file">
        <div class="row">
          <span class="name">${esc(f.name)}</span>
          <span class="tag">${esc(T(`format.${f.format}`))}</span>
          <select data-file="${i}" data-kind>
            <option value="orders"${f.kind === 'orders' ? ' selected' : ''}>${esc(T('file.asOrders'))}</option>
            <option value="returns"${f.kind === 'returns' ? ' selected' : ''}>${esc(T('file.asReturns'))}</option>
          </select>
          <button type="button" class="link" data-remove="${i}" >${esc(T('file.remove'))}</button>
        </div>
        <div class="fmt">${esc(T('file.meta', { rows: f.rows.length }))}${f.droppedColumns.length ? ` · <details class="removed">
          <summary>${esc(T('file.removed', { n: f.droppedColumns.length }))}</summary>
          <div>${esc(f.droppedColumns.join(T('file.listSep')))}</div></details>` : ''}</div>
        ${missing ? `<div class="err">${esc(T('file.missing'))}</div>` : ''}
        <details${f.format === 'generic' || missing ? ' open' : ''}>
          <summary>${esc(T('file.mapping'))}${f.format === 'generic' ? esc(T('file.mappingGuessed')) : ''}</summary>
          <div class="map">${roles}</div>
        </details>
      </div>`;
  }).join('');
}

function renderOutput() {
  const ready = state.files.length > 0;
  $('#exportbar').classList.toggle('show', ready);
  $('#empty').hidden = ready;
  $('#waitlist').hidden = !(ready && waitlistOn);
  if (!ready) { $('#report').innerHTML = ''; state.analysis = null; return; }
  state.analysis = analyze(state.files, { chartText: state.chartText });
  $('#report').innerHTML = renderReport(state.analysis, { lang: state.lang });
}

function refresh() {
  renderFiles();
  renderOutput();
}

function renderHero() {
  const h = HERO_EXAMPLE;
  $('#heroCard').innerHTML = `
    <div class="label">${esc(T('hero.cardLabel'))}</div>
    <div class="what">${esc(h.product)} · ${esc(h.size)} <span class="badge">${esc(T(`verdict.${h.verdict}`))}</span></div>
    <div class="stat">${esc(T('hero.cardStat', { returns: h.returns, n: h.n, ex: h.ex }))}</div>
    <div class="money">${esc(T('hero.cardMoney', { amount: formatMoney(state.lang, h.amountPerMonth, h.currency) }))}</div>
    <div class="note">${esc(T('hero.cardNote'))}<q lang="en">${esc(h.fitNote)}</q></div>`;
}

function renderChartInfo() {
  $('#chartInfo').textContent = state.chartName ? T('app.chartLoaded', { name: state.chartName }) : '';
}

/** Apply the current language to static page text, then re-render dynamic parts. */
function applyLang() {
  document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
  document.title = T('doc.title');
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-label]')) el.setAttribute('aria-label', T(el.dataset.i18nLabel));
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang));
  renderHero();
  renderChartInfo();
  refresh();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---- events
$('#pick').addEventListener('click', () => $('#fileInput').click());
$('#tryMine').addEventListener('click', () => {
  track('cta/try');
  $('#upload').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#seeSample').addEventListener('click', async () => {
  track('cta/sample');
  await loadSample(HERO_EXAMPLE.sample);
  $('#exportbar').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('#guide').addEventListener('toggle', e => { if (e.target.open) track('guide/open'); });
$('#fileInput').addEventListener('change', e => { addFiles([...e.target.files]); e.target.value = ''; });
const drop = $('#drop');
drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', e => {
  e.preventDefault();
  drop.classList.remove('over');
  addFiles([...e.dataTransfer.files].filter(f => /\.csv$/i.test(f.name) || f.type === 'text/csv'));
});

document.addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.dataset.lang) {
    if (btn.dataset.lang !== state.lang) {
      state.lang = btn.dataset.lang;
      saveLang(state.lang);
      applyLang();
    }
  } else if (btn.dataset.sample) await loadSample(btn.dataset.sample.split(','));
  else if (btn.dataset.sampleChart) {
    state.chartText = await (await fetch(`fixtures/${btn.dataset.sampleChart}`)).text();
    state.chartName = btn.dataset.sampleChart;
    renderChartInfo();
    renderOutput();
  } else if (btn.dataset.remove) {
    state.files.splice(Number(btn.dataset.remove), 1);
    refresh();
  } else if (btn.dataset.copy) {
    if (!(await copyText(btn.dataset.copy))) return;
    const label = btn.textContent;
    btn.textContent = T('report.copied');
    btn.classList.add('done');
    setTimeout(() => { btn.textContent = label; btn.classList.remove('done'); }, 1500);
  }
});

document.addEventListener('change', e => {
  const s = e.target;
  if (s.dataset.role) {
    const f = state.files[Number(s.dataset.file)];
    if (s.value) f.mapping[s.dataset.role] = s.value;
    else delete f.mapping[s.dataset.role];
    if (!FORMATS[f.format]) f.kind = guessKind(f.format, f.mapping);
    refresh();
  } else if ('kind' in s.dataset) {
    state.files[Number(s.dataset.file)].kind = s.value;
    refresh();
  }
});

$('#pickChart').addEventListener('click', () => $('#chartInput').click());
$('#chartInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  state.chartText = await readText(f);
  state.chartName = f.name;
  renderChartInfo();
  e.target.value = '';
  renderOutput();
});

$('#dlHtml').addEventListener('click', () => {
  if (!state.analysis) return;
  const blob = new Blob([renderReportDocument(state.analysis, { lang: state.lang })], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sizefit-report-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  track('export/html');
});
$('#print').addEventListener('click', () => {
  track('export/pdf');
  window.print();
});
$('#waitlistBtn').addEventListener('click', () => {
  if (!waitlistOn) return;
  track('waitlist');
  // Tally hidden field "lang" records which UI language the visitor used.
  const url = new URL(waitlistUrl);
  url.searchParams.set('lang', state.lang);
  window.open(url.href, '_blank', 'noopener');
});

applyLang();
