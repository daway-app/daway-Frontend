import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
function walk(d, out) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else if (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) {
      if (p.includes('lib/lang')) continue;
      if (p.endsWith('lib/i18n.ts')) continue;
      const s = readFileSync(p, 'utf8');
      if (s.includes('AR.')) out.push(p);
    }
  }
}
const out = [];
walk('src', out);
console.log('count=' + out.length);
for (const f of out) console.log(f);
