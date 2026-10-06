/**
 * One-shot: quarantine the verified-dead CSS block from
 * src/styles/pages/pharmacy-accounting.css into src/styles/legacy/.
 *
 * Audit B-7 / B-8. Safe by construction: validates the block boundaries before
 * touching anything, and is idempotent (re-running finds the file already moved).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SRC = 'src/styles/pages/pharmacy-accounting.css';
const OUT = 'src/styles/legacy/accounting-unported-screens.css';
const A = 944;
const B = 1197;

if (existsSync(OUT)) {
  console.log('already quarantined — nothing to do');
  process.exit(0);
}

const lines = readFileSync(SRC, 'utf8').split('\n');
const first = lines[A - 1].trim();
const last = lines[B - 1].trim();

if (!first.startsWith('/*') || last !== '}') {
  console.error(`BOUNDARY MISMATCH at ${A}..${B}:`);
  console.error(`  first = ${JSON.stringify(first)}`);
  console.error(`  last  = ${JSON.stringify(last)}`);
  process.exit(1);
}

const moved = lines.slice(A - 1, B).join('\n');
const rest = lines.slice(0, A - 1).concat(lines.slice(B));

const header = [
  '/* ==========================================================',
  '   QUARANTINED — dead CSS from pharmacy-accounting.css (audit B-7/B-8).',
  '   ==========================================================',
  '   These rules have ZERO references anywhere in src/**/*.ts(x) — verified',
  '   with tools/dead-css.mjs, which is deliberately CONSERVATIVE (a class',
  '   counts as used if its token appears anywhere, including inside template',
  '   literals and props).',
  '',
  '   Kept rather than deleted because they are the ported half of Blade',
  '   screens that are NOT in this phase\'s scope (barcode link-results dialog,',
  '   conflict comparison, coverage card, activity card, inline-empty state).',
  '   Preserved verbatim so re-porting those screens is a move, not a rewrite.',
  '',
  '   THIS FILE IS NOT IMPORTED. If you port one of those screens, move the',
  '   rules you need back into pharmacy-accounting.css (or a feature file) and',
  '   re-run "node tools/dead-css.mjs". Do not @import this file wholesale.',
  '',
  '   Extracted from pharmacy-accounting.css lines ' + A + '-' + B + ' on 2026-10-06.',
  '   ========================================================== */',
  '',
].join('\n');

writeFileSync(OUT, header + moved + '\n');
writeFileSync(SRC, rest.join('\n'));

console.log(`quarantined ${B - A + 1} lines -> ${OUT}`);
console.log(`${SRC} is now ${rest.length} lines (was ${lines.length})`);
