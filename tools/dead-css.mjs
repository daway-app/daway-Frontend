/**
 * Dead-CSS detector — audit B-7 / B-8.
 *
 * Finds CSS class selectors in src/styles/** that no source file references.
 *
 * Deliberately CONSERVATIVE — a selector is only reported as unused when NO
 * evidence of use exists. Evidence sources, in order of strength:
 *
 *   1. Literal `className="... a b c"` strings in .tsx/.ts.
 *   2. `className={` templates, scanned for every bare word (so
 *      `` `ac-badge ${tone}` `` marks `ac-badge`).
 *   3. Any string literal appearing anywhere in src/ (covers class names passed
 *      as props: `bodyClassName="ph-card-body ph-table-wrap"`).
 *   4. Runtime-composed fragments: a class built by concatenation such as
 *      `` `ph-badge ${variant}` `` where `variant` comes from a union type
 *      (`'ok' | 'low' | ...`). To avoid false positives the detector also
 *      accepts an exact match against ANY token that appears inside a CSS
 *      selector's own compounds — e.g. `.ph-badge.low` implies `ph-badge`.
 *   5. A hand-maintained ALLOWLIST for classes set by JS outside .tsx
 *      (state toggles like `.ac-hidden`, theme classes).
 *
 * Usage: node tools/dead-css.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = 'src';
const STYLE_DIR = join(ROOT, 'styles');

/** Classes toggled from JS/Blade parity rather than written in JSX. */
const ALLOWLIST = new Set([
  'dark-mode',          // toggled by lib/theme.ts + pre-paint snippet
  'ac-hidden',          // utility toggled at runtime
  'pi-hidden',          // utility toggled at runtime
  'is-open',            // generic runtime state
  'is-active',
  'is-loading',
  'is-collapsed',
  'is-visible',
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const allFiles = walk(ROOT);
/**
 * `src/styles/legacy/` is the QUARANTINE (audit B-7/B-8): rules kept on disk but
 * never imported. Measuring them would count deliberate dead code as debt and
 * defeat the ratchet, so they are excluded from both sides of the comparison.
 */
const cssFiles = allFiles
  .filter((f) => extname(f) === '.css')
  .filter((f) => !f.replace(/\\/g, '/').includes('/styles/legacy/'));
const srcFiles = allFiles.filter((f) => ['.ts', '.tsx'].includes(extname(f)));

/* ---------- 1. harvest every identifier-like token from source ---------- */
const srcText = srcFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

/** Every `word-like` token anywhere in the source (conservative). */
const srcTokens = new Set();
for (const m of srcText.matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)) srcTokens.add(m[0]);

/* ---------- 2. harvest class selectors from CSS ---------- */
/** class → list of {file, line} */
const cssClasses = new Map();
for (const file of cssFiles) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Skip pure comment lines to avoid harvesting prose.
    const trimmed = line.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) return;
    for (const m of line.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) {
      const cls = m[1];
      if (!cssClasses.has(cls)) cssClasses.set(cls, []);
      cssClasses.get(cls).push({ file, line: i + 1 });
    }
  });
}

/* ---------- 3. classify ---------- */
const used = new Set();
const unused = new Set();

for (const cls of cssClasses.keys()) {
  if (ALLOWLIST.has(cls)) { used.add(cls); continue; }
  // Direct token presence anywhere in src TS/TSX.
  if (srcTokens.has(cls)) { used.add(cls); continue; }
  // Compound variants: CSS `.ph-badge.low` implies the JSX writes `ph-badge`
  // and composes the variant; if the *base* part is used we keep the whole.
  const parts = cls.split('-');
  let partial = false;
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i++) {
      const prefix = parts.slice(0, i).join('-');
      if (srcTokens.has(prefix)) { partial = true; break; }
    }
  }
  if (partial) used.add(cls);
  else unused.add(cls);
}

/* ---------- 4. report ---------- */
const total = cssClasses.size;
const result = {
  total,
  used: used.size,
  unused: unused.size,
  unusedPercent: Math.round((unused.size / total) * 100),
  unusedClasses: [...unused].sort(),
};

/**
 * Reusable entry point so the budget guard can measure in-process.
 * (Spawning a second node.exe fails with EBUSY in the sandboxed Windows env.)
 */
export function measureDeadCss() {
  return { total: result.total, unused: result.unused };
}

/** True when this module is the CLI entry point, not an import. */
const isMain = process.argv[1] && !process.argv[1].endsWith('dead-css-budget.mjs');

if (isMain) {
  if (process.argv.includes('--json')) {
    writeFileSync('qa/dead-css.json', JSON.stringify(result, null, 2));
    console.log(`wrote qa/dead-css.json — ${result.unused}/${result.total} unused (${result.unusedPercent}%)`);
  } else {
    console.log(`CSS classes: ${total}`);
    console.log(`  used   : ${used.size}`);
    console.log(`  unused : ${unused.size} (${result.unusedPercent}%)`);
    console.log('\nUNUSED (first 200):');
    result.unusedClasses.slice(0, 200).forEach((c) => {
      const where = cssClasses.get(c)[0];
      console.log(`  ${c.padEnd(38)} ${where.file}:${where.line}`);
    });
  }
}
