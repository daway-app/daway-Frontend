import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Report HOW AR is used per file: module-level aliases vs in-component use,
 * hook presence, component names. Guides the conversion order.
 * Usage: node tools/survey-ar.mjs
 */
function walk(d, out) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      if (p.includes('lib/lang') || p.endsWith('lib/i18n.ts')) return;
      const s = readFileSync(p, 'utf8');
      if (s.includes('AR.')) out.push(p);
    }
  }
}
const out = [];
walk('src', out);
for (const f of out.sort()) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const aliases = lines
    .map((l, i) => ({ l: l.trim(), i: i + 1 }))
    .filter((x) => /^const [A-Z][A-Za-z0-9_]* = AR\./.test(x.l))
    .map((x) => x.i + ':' + x.l.slice(0, 60));
  const hasHook = /useLang\(\)/.test(src);
  const arCount = (src.match(/\bAR\./g) || []).length;
  console.log(f + ' | ARuses=' + arCount + ' | useLang=' + hasHook + ' | alias@[' + aliases.join(' ; ') + ']');
}
