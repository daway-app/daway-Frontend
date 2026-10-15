import { readFileSync } from 'node:fs';
function keysOf(o, p, out) {
  for (const e of Object.entries(o)) {
    const np = p ? p + '.' + e[0] : e[0];
    if (typeof e[1] === 'string') out.push(np);
    else keysOf(e[1], np, out);
  }
  return out;
}
function loadObj(f, marker) {
  const s = readFileSync(f, 'utf8');
  const b = s.indexOf('{', s.indexOf(marker));
  let d = 0; let j = b; let q = null;
  while (j < s.length) {
    const c = s[j];
    if (q) { if (c === '\\') { j += 2; continue; } if (c === q) q = null; j++; continue; }
    if (c === "'" || c === '"') { q = c; j++; continue; }
    if (c === '{') d++;
    if (c === '}') { d--; if (d === 0) break; }
    j++;
  }
  return new Function('return (' + s.slice(b, j + 1) + ');')();
}
const ar = keysOf(loadObj('src/lib/i18n.ts', 'export const AR'), '', []);
const en = keysOf(loadObj('src/lib/lang/en.ts', 'export const EN'), '', []);
const a = new Set(ar); const e = new Set(en);
console.log('AR:' + ar.length + ' EN:' + en.length);
console.log('missing-in-EN: ' + JSON.stringify(ar.filter((k) => !e.has(k))));
console.log('extra-in-EN: ' + JSON.stringify(en.filter((k) => !a.has(k))));
let todo = 0;
(function count(o) { for (const v of Object.values(o)) { if (typeof v === 'string') { if (v.indexOf('TODO(EN') === 0) todo++; } else if (v && typeof v === 'object') count(v); } })(loadObj('src/lib/lang/en.ts', 'export const EN'));
console.log('TODO-left: ' + todo);
