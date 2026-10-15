import { readFileSync, writeFileSync } from 'node:fs';
const src = readFileSync('src/lib/lang/en.ts', 'utf8');
const open = src.indexOf('{');
let depth = 0; let j = open; let q = null;
while (j < src.length) {
  const c = src[j];
  if (q) { if (c === '\\') { j += 2; continue; } if (c === q) q = null; j++; continue; }
  if (c === "'" || c === '"') { q = c; j++; continue; }
  if (c === '{') depth++;
  if (c === '}') { depth--; if (depth === 0) break; }
  j++;
}
const EN = new Function('return (' + src.slice(open, j + 1) + ');')();
const rows = [];
function walk(o, p) {
  for (const e of Object.entries(o)) {
    const np = p.concat([e[0]]);
    if (typeof e[1] === 'string') { if (e[1].startsWith('TODO(EN)')) rows.push({ path: np.join('.'), ar: e[1].replace(/^TODO\(EN[^)]*\):\s*/, '') }); }
    else if (e[1] && typeof e[1] === 'object') walk(e[1], np);
  }
}
walk(EN, []);
writeFileSync('outputs/en-todo-paths.json', JSON.stringify(rows, null, 1), 'utf8');
console.log('todos: ' + rows.length);
