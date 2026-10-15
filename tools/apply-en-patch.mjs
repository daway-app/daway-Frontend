import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { renderTs } = require('./render-helper.cjs');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const p = join(root, 'src', 'lib', 'lang', 'en.ts');
const src = readFileSync(p, 'utf8');
const open = src.indexOf('export const EN = ');
const brace = src.indexOf('{', open);
let depth = 0; let j = brace; let q = null;
while (j < src.length) {
  const c = src[j];
  if (q) { if (c === '\\') { j += 2; continue; } if (c === q) q = null; j++; continue; }
  if (c === "'" || c === '"') { q = c; j++; continue; }
  if (c === '{') depth++;
  if (c === '}') { depth--; if (depth === 0) break; }
  j++;
}
const EN = new Function('return (' + src.slice(brace, j + 1) + ');')();
function getPath(o, path) {
  let cur = o;
  for (const k of path) { if (cur == null || !(k in cur)) return undefined; cur = cur[k]; }
  return cur;
}
function setPath(o, path, v) {
  let cur = o;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = v;
}
const files = readdirSync(join(root, 'tools')).filter((f) => /^en-patch-\d+\.json$/.test(f)).sort();
let applied = 0;
const unmatched = [];
for (const f of files) {
  const patch = JSON.parse(readFileSync(join(root, 'tools', f), 'utf8'));
  for (const e of Object.entries(patch)) {
    const path = e[0].split('.');
    const cur = getPath(EN, path);
    if (typeof cur !== 'string') { unmatched.push(e[0] + ' (not a string leaf)'); continue; }
    if (!cur.startsWith('TODO(EN)')) { unmatched.push(e[0] + ' (already translated)'); continue; }
    setPath(EN, path, e[1]);
    applied++;
  }
}
let left = 0;
(function count(o) { for (const v of Object.values(o)) { if (typeof v === 'string') { if (v.startsWith('TODO(EN)')) left++; } else if (v && typeof v === 'object') count(v); } })(EN);
const head = '/** EN strings - generated + hand-translated TODOs. See tools/build-en-dict.mjs. */\n';
writeFileSync(p, head + 'export const EN = ' + renderTs(EN, 0) + ' as const;\n\nexport type Strings = typeof EN;\n', 'utf8');
console.log('applied: ' + applied + ' | remaining TODO: ' + left);
console.log('UNMATCHED(' + unmatched.length + '):');
for (const u of unmatched) console.log('  ' + u);
