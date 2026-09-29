#!/usr/bin/env node
//
// Render the app's test coverage as Markdown for the CI job summary: the
// totals, then the least-covered files. Reads the json-summary report that
// `npm run test:coverage` writes; the floors themselves are enforced by
// Vitest (`coverage.thresholds` in vite.config.ts), not here.
//
//   node scripts/coverage-summary.mjs [coverage-summary.json] [file-count]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = process.argv[2] ?? path.join(root, 'coverage', 'coverage-summary.json');
const fileCount = Number.parseInt(process.argv[3] ?? '10', 10);

if (!fs.existsSync(reportPath)) {
  console.error(`coverage report not found: ${reportPath}`);
  console.error('Run `npm run test:coverage` first.');
  process.exit(1);
}

const { total, ...files } = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const metrics = ['lines', 'statements', 'functions', 'branches'];

// Istanbul reports `pct` as "Unknown" when a file has nothing of that kind to
// cover, such as a module with no branches. Nothing to miss counts as covered.
const pct = (m) => (m.total === 0 ? 100 : m.pct);
const fmt = (m) => `${pct(m).toFixed(2)}%`;

const out = [];
out.push('### App test coverage', '');
out.push('| metric | covered | total | coverage |', '| --- | ---: | ---: | ---: |');
for (const name of metrics) {
  const m = total[name];
  out.push(`| ${name} | ${m.covered} | ${m.total} | ${fmt(m)} |`);
}

// Lowest line coverage first; among equals, the file with more uncovered
// lines first, since that is the bigger gap.
const ranked = Object.entries(files)
  .map(([file, m]) => ({ file: path.relative(root, file), ...m }))
  .sort(
    (a, b) =>
      pct(a.lines) - pct(b.lines) ||
      b.lines.total - b.lines.covered - (a.lines.total - a.lines.covered) ||
      a.file.localeCompare(b.file),
  )
  .slice(0, fileCount);

out.push('', `#### Lowest-covered files (${ranked.length} of ${Object.keys(files).length})`, '');
out.push(
  '| file | lines | statements | functions | branches | uncovered lines |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
);
for (const f of ranked) {
  out.push(
    `| \`${f.file}\` | ${fmt(f.lines)} | ${fmt(f.statements)} | ${fmt(f.functions)} | ${fmt(f.branches)} | ${f.lines.total - f.lines.covered} |`,
  );
}

console.log(out.join('\n'));
