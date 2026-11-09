// Renders an analysis result as HTML. Pure string output, so the same code runs in the
// browser and in Node (tests / CLI). Free-text customer notes are never rendered.

import { VERDICT, RULES } from './analyze.js';

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
.sf-report .product table{min-width:820px}
.sf-report table.rank{min-width:520px}
.sf-report td.why{min-width:200px}
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
.sf-report .fitnote button{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:2px 10px;cursor:pointer}
.sf-report ul.sugg{margin:6px 0 0;padding-left:20px}
.sf-report .why{font-size:12px;color:var(--muted)}
.sf-report .rank td:first-child{color:var(--muted)}
.sf-report footer{margin-top:28px;font-size:12px;color:var(--muted)}
.sf-report footer li{margin:2px 0}
@media print{.sf-report{--card:#fff;--soft:#f5f6f8;color:#000}.sf-report button{display:none}.sf-report .product{border-color:#ccc}}
@media (max-width:640px){.sf-report .kpi b{font-size:18px}.sf-report th,.sf-report td{padding:6px 5px}}
`;

const badge = v => `<span class="badge v-${v}">${VERDICT[v]}</span>`;

function evidenceCell(e) {
  const total = e.exchange + e.reason;
  if (!total) return '<span class="muted">0</span>';
  const parts = [];
  if (e.exchange) parts.push(`换货 ${e.exchange}`);
  if (e.reason) parts.push(`原因 ${e.reason}`);
  return `<b>${total}</b> <span class="why">${parts.join(' · ')}</span>`;
}

function summaryBadges(p) {
  const groups = {};
  for (const c of p.sizes) {
    if (c.verdict === 'normal' || c.verdict === 'insufficient') continue;
    (groups[c.verdict] ||= []).push(c.size.size);
  }
  const out = Object.entries(groups).map(([v, list]) => `${esc(list.join('/'))} ${badge(v)}`);
  if (!out.length) {
    const allInsufficient = p.sizes.every(c => c.verdict === 'insufficient');
    return allInsufficient ? badge('insufficient') : badge('normal');
  }
  return out.join(' ');
}

function productSection(p, i, sales) {
  const rows = p.sizes.map(c => `
      <tr>
        <td><b>${esc(c.size.size)}</b></td>
        ${sales ? `<td class="n">${c.sold}</td>` : ''}
        <td class="n">${c.returns}</td>
        <td>${evidenceCell(c.small)}</td>
        <td>${evidenceCell(c.large)}</td>
        <td class="n">${c.fit || '<span class="muted">0</span>'}</td>
        <td class="n">${c.other}/${c.unknown}</td>
        <td>${badge(c.verdict)}</td>
        <td class="n">${c.evidence}</td>
        <td class="why">${esc(c.why)}</td>
      </tr>`).join('');
  const note = p.fitNote
    ? `<div class="fitnote"><span class="muted">商品页 fit note：</span><q>${esc(p.fitNote)}</q><button type="button" data-copy="${esc(p.fitNote)}">复制</button></div>`
    : `<div class="fitnote muted">${p.sizes.some(c => c.verdict === 'unconfirmed')
      ? '有尺码需要先确认（看下面「待确认」的说明），暂不建议写 fit note。'
      : '数据不足，暂不建议写 fit note。'}</div>`;
  const sugg = p.suggestions.length
    ? `<div><b>尺码表修改建议</b>${p.hasChart ? '' : ' <span class="muted">（未上传该款尺码表，只给方向）</span>'}
        <ul class="sugg">${p.suggestions.map(s => `<li>${esc(s.text)}</li>`).join('')}</ul></div>`
    : '';
  return `
  <section class="product" id="p${i}">
    <div class="phead"><h3>${i + 1}. ${esc(p.product)}</h3>
      <span class="muted">退货 ${p.returns} 件${p.sold ? ` · 售出 ${p.sold} 件 · 退货率 ${pct(p.returnRate)}` : ''} · 尺码相关 ${p.sizeIssueUnits} 件</span>
    </div>
    <div class="scroll"><table>
      <thead><tr><th>尺码</th>${sales ? '<th class="n">售出</th>' : ''}<th class="n">退货</th><th>偏小依据</th><th>偏大依据</th>
        <th class="n">尺码不明</th><th class="n">其他/无原因</th><th>结论</th><th class="n">依据条数</th><th>说明</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    ${note}
    ${sugg}
  </section>`;
}

/** Report body (inside a .sf-report wrapper). */
export function renderReport(a, { generatedAt = new Date() } = {}) {
  const t = a.totals;
  const flaggedSizes = a.products.reduce((n, p) => n + p.flagged, 0);
  const unconfirmedSizes = a.products.reduce((n, p) => n + p.unconfirmed, 0);
  const notes = [];
  if (a.refundsInferred) {
    notes.push('只上传了订单导出：退货是从退款状态推断的，没有退货原因，所以只能判断「待确认」，给不出偏大偏小。再上传一份退货工具导出（带原因或换货记录）效果会好很多。');
  }
  if (!a.hasSales) notes.push('没有上传订单导出，缺少销量，无法计算退货率；结论只基于退货记录本身。');
  if (a.skipped.noSize) notes.push(`${a.skipped.noSize} 件退货/销售没有识别出尺码，已跳过（可在列映射里指定变体或 SKU 列）。`);
  if (a.skipped.ambiguousRefund) notes.push(`${a.skipped.ambiguousRefund} 个部分退款订单无法确定退的是哪一行，已跳过。`);

  const ranked = a.products.filter(p => p.flagged || p.unconfirmed || p.sizeIssueUnits);
  const rankRows = ranked.map((p, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><a href="#p${a.products.indexOf(p)}">${esc(p.product)}</a></td>
        <td>${summaryBadges(p)}</td>
        <td class="n">${p.sizeIssueUnits}</td>
        <td class="n">${p.returns}</td>
        ${a.hasSales ? `<td class="n">${pct(p.returnRate)}</td>` : ''}
      </tr>`).join('');

  return `
<div class="sf-report">
  <h1>尺码偏差报告</h1>
  <div class="meta">生成于 ${esc(generatedAt.toISOString().slice(0, 16).replace('T', ' '))} UTC ·
    数据：${a.files.map(f => `${esc(f.name)}（${esc(f.format)}，${f.rows} 行，已丢弃 ${f.droppedColumns} 个个人信息列）`).join('；')}
    ${a.chartRows ? ` · 尺码表 ${a.chartRows} 行` : ''}</div>
  ${notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}
  <div class="kpis">
    <div class="kpi"><b>${t.returns}</b><span>退货件数</span></div>
    ${a.hasSales ? `<div class="kpi"><b>${t.sold}</b><span>售出件数</span></div>` : ''}
    <div class="kpi"><b>${t.small} / ${t.large}</b><span>说偏小 / 偏大（其中换货 ${t.exchange}）</span></div>
    <div class="kpi"><b>${t.fit}</b><span>尺码不合适但方向不明</span></div>
    <div class="kpi"><b>${t.returns ? pct((t.small + t.large) / t.returns) : '—'}</b><span>退货能归到具体偏大/偏小</span></div>
    <div class="kpi"><b>${flaggedSizes} / ${unconfirmedSizes}</b><span>判定偏差 / 待确认的尺码</span></div>
  </div>

  <h2>问题款排行</h2>
  ${ranked.length ? `<div class="scroll"><table class="rank">
    <thead><tr><th>#</th><th>商品</th><th>结论</th><th class="n">尺码相关退货</th><th class="n">退货</th>${a.hasSales ? '<th class="n">退货率</th>' : ''}</tr></thead>
    <tbody>${rankRows}</tbody></table></div>` : '<p class="muted">没有发现尺码问题。</p>'}

  <h2>每款每个尺码</h2>
  ${a.products.map((p, i) => productSection(p, i, a.hasSales)).join('')}

  <footer>
    <b>判断规则</b>
    <ul>
      <li>信号从强到弱：换货方向（S 换 M = 偏小）＞ 退货原因文字（too small / 偏小 等）＞ 只有退货率高。</li>
      <li>某尺码至少有 ${RULES.MIN_DIRECTIONAL} 件说明了偏大或偏小，且多数方向的比例在约 90% 置信下仍超过一半，才判「偏小 / 偏大」。</li>
      <li>只有退货率高（≥ 该款平均 ${RULES.HIGH_RATE_MULT} 倍且高出 ${RULES.HIGH_RATE_MIN_GAP * 100} 个百分点）、或有 ${RULES.FIT_UNCLEAR_MIN} 件以上「尺码不合适」但没说方向时，判「待确认」。</li>
      <li>「正常」需要售出 ≥ ${RULES.MIN_SOLD_FOR_NORMAL} 件且尺码反馈 &lt; ${RULES.MAX_DIR_RATE_NORMAL * 100}%；没有销量时需要 ≥ ${RULES.MIN_RETURNS_NORMAL_NO_SALES} 件有原因的退货且尺码相关 &lt; ${RULES.MAX_SIZE_SHARE_NORMAL_NO_SALES * 100}%。其余为「样本不足」。</li>
      <li>报告只含商品名、尺码和计数。买家姓名、邮箱、地址、电话等列在读取时已丢弃，顾客备注只用于分类，不出现在报告里。</li>
    </ul>
  </footer>
</div>`;
}

/** Standalone HTML document for "download HTML". */
export function renderReportDocument(a, opts) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>尺码偏差报告</title>
<style>body{margin:0;padding:24px 16px;background:#fff}@media (prefers-color-scheme: dark){body{background:#0f1217}}
.wrap{max-width:1080px;margin:0 auto}${REPORT_CSS}</style></head>
<body><div class="wrap">${renderReport(a, opts)}</div>
<script>document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;navigator.clipboard&&navigator.clipboard.writeText(b.dataset.copy).then(()=>{b.textContent='已复制'})})</script>
</body></html>`;
}
