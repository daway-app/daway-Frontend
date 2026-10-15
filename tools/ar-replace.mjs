import { readFileSync, writeFileSync } from 'node:fs';
/**
 * Replace whole-word `R.` → `Rt.` and `BRAND` → `brandTag` inside the
 * component body of the given files (skips import lines, comments, and the
 * module-level `const R =` / `const BRAND =` declarations).
 * Usage: node tools/ar-replace.mjs <file...>
 */
const files = process.argv.slice(2);
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const out = lines.map((l) => {
    if (/^\s*import\b/.test(l)) return l;
    if (/^\s*\*/.test(l)) return l;
    if (/const (R|BRAND) = AR\./.test(l)) return l;
    if (/^\s*void (R|BRAND);/.test(l)) return l;
    return l.replace(/\bR\./g, 'Rt.').replace(/\bBRAND\b/g, 'brandTag');
  });
  writeFileSync(f, out.join('\n'), 'utf8');
  console.log('patched ' + f);
}
