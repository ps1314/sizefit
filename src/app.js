// Browser UI: load files, edit column mapping, render the report, export HTML / print to PDF.
// Nothing is sent over the network except fetching the bundled sample files.

import { loadFile, ROLES, FORMATS, guessKind } from './formats.js';
import { analyze } from './analyze.js';
import { renderReport, renderReportDocument, REPORT_CSS } from './report.js';

const $ = sel => document.querySelector(sel);
const state = { files: [], chartText: '', chartName: '', analysis: null };

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
  for (const f of list) {
    try {
      state.files.push(loadFile(f.name, await readText(f)));
    } catch (e) {
      alert(`${f.name} 读取失败：${e.message}`);
    }
  }
  refresh();
}

async function loadSample(names) {
  state.files = [];
  for (const n of names) {
    const text = await (await fetch(`fixtures/${n}`)).text();
    state.files.push(loadFile(n, text));
  }
  refresh();
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function renderFiles() {
  $('#filesPanel').hidden = !state.files.length;
  $('#files').innerHTML = state.files.map((f, i) => {
    const opts = sel => ['<option value="">（不使用）</option>', ...f.headers.map(h =>
      `<option value="${esc(h)}"${h === sel ? ' selected' : ''}>${esc(h)}</option>`)].join('');
    const roles = Object.entries(ROLES)
      .filter(([role]) => f.kind === 'orders' || !['financialStatus', 'refundedAmount', 'price'].includes(role))
      .map(([role, label]) => `<label>${esc(label)}<select data-file="${i}" data-role="${role}">${opts(f.mapping[role])}</select></label>`)
      .join('');
    const missing = !(f.mapping.product || f.mapping.lineName || f.mapping.sku);
    return `
      <div class="file">
        <div class="row">
          <span class="name">${esc(f.name)}</span>
          <span class="tag">${esc(f.formatLabel)}</span>
          <select data-file="${i}" data-kind>
            <option value="orders"${f.kind === 'orders' ? ' selected' : ''}>当作订单（销量）</option>
            <option value="returns"${f.kind === 'returns' ? ' selected' : ''}>当作退货记录</option>
          </select>
          <button type="button" class="link" data-remove="${i}" aria-label="移除">移除</button>
        </div>
        <div class="fmt">${f.rows.length} 行 · 已丢弃 ${f.droppedColumns.length} 个个人信息列${f.droppedColumns.length ? `（${esc(f.droppedColumns.join('、'))}）` : ''}</div>
        ${missing ? '<div class="err">没有找到商品名或 SKU 列，请在下面手动指定。</div>' : ''}
        <details${f.format === 'generic' || missing ? ' open' : ''}>
          <summary>列映射${f.format === 'generic' ? '（未识别格式，已按列名猜测，请检查）' : ''}</summary>
          <div class="map">${roles}</div>
        </details>
      </div>`;
  }).join('');
}

function renderOutput() {
  const ready = state.files.length > 0;
  $('#exportbar').classList.toggle('show', ready);
  $('#empty').hidden = ready;
  if (!ready) { $('#report').innerHTML = ''; state.analysis = null; return; }
  state.analysis = analyze(state.files, { chartText: state.chartText });
  $('#report').innerHTML = renderReport(state.analysis);
}

function refresh() {
  renderFiles();
  renderOutput();
}

// ---- events
$('#pick').addEventListener('click', () => $('#fileInput').click());
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
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.sample) await loadSample(t.dataset.sample.split(','));
  else if (t.dataset.sampleChart) {
    state.chartText = await (await fetch(`fixtures/${t.dataset.sampleChart}`)).text();
    state.chartName = t.dataset.sampleChart;
    $('#chartInfo').textContent = `已载入 ${state.chartName}`;
    renderOutput();
  } else if (t.dataset.remove) {
    state.files.splice(Number(t.dataset.remove), 1);
    refresh();
  } else if (t.dataset.copy) {
    await navigator.clipboard?.writeText(t.dataset.copy);
    t.textContent = '已复制';
    setTimeout(() => { t.textContent = '复制'; }, 1500);
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
  $('#chartInfo').textContent = `已载入 ${f.name}`;
  e.target.value = '';
  renderOutput();
});

$('#dlHtml').addEventListener('click', () => {
  if (!state.analysis) return;
  const blob = new Blob([renderReportDocument(state.analysis)], { type: 'text/html;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sizefit-report-${new Date().toISOString().slice(0, 10)}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#print').addEventListener('click', () => window.print());
