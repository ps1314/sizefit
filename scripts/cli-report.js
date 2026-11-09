// Command-line report: node scripts/cli-report.js [--chart size_chart.csv] [--out report.html] file.csv [...]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadFile } from '../src/formats.js';
import { analyze } from '../src/analyze.js';
import { renderReportDocument } from '../src/report.js';

const args = process.argv.slice(2);
let chartText = '';
let out = 'report.html';
const inputs = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--chart') chartText = readFileSync(args[++i], 'utf8');
  else if (args[i] === '--out') out = args[++i];
  else inputs.push(args[i]);
}
if (!inputs.length) {
  console.error('usage: node scripts/cli-report.js [--chart chart.csv] [--out report.html] export.csv [...]');
  process.exit(1);
}
const files = inputs.map(p => loadFile(basename(p), readFileSync(p, 'utf8')));
for (const f of files) console.log(`${f.name}: ${f.formatLabel} · ${f.rows.length} rows · dropped ${f.droppedColumns.length} PII columns`);
const a = analyze(files, { chartText });
writeFileSync(out, renderReportDocument(a));
for (const p of a.products) {
  console.log(`- ${p.product}: ${p.sizes.map(c => `${c.size.size}=${c.verdict}`).join(' ')}${p.fitNote ? ` | ${p.fitNote}` : ''}`);
}
console.log(`report written to ${out}`);
