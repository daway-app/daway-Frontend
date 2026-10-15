import { readFileSync, writeFileSync } from 'node:fs';
/**
 * Convert in-component `const X = AR.<path>;` → STR version.
 * Only touches files where the alias sits INSIDE an exported component
 * (after `export function`), adds `useLang` import + hook call.
 * Usage: node tools/codemod-incomp.mjs [--write] [file...]
 */
const WRITE = process.argv.includes('--write');
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
let done = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const expIdx = lines.findIndex((l) => /^export function [A-Z]/.test(l));
  if (expIdx < 0) { console.log('SKIP(no component) ' + f); continue; }
  // find alias decls inside component
  const aliasIdx = [];
  lines.forEach((l, i) => {
    if (i > expIdx && /^\s{2}const [A-Z][A-Za-z0-9_]* = AR\./.test(l)) aliasIdx.push(i);
  });
  if (aliasIdx.length === 0) { console.log('SKIP(no in-comp alias) ' + f); continue; }
  if (!WRITE) { done++; continue; }
  const out = [...lines];
  // add import after i18n import
  if (!out.some((l) => l.includes('@/lib/lang/LanguageContext'))) {
    const li = out.findIndex((l) => /from '@\/lib\/i18n'/.test(l));
    out.splice(li + 1, 0, "import { useLang } from '@/lib/lang/LanguageContext';");
  }
  // convert aliases AR. → STR. and collect for hook insert
  for (const i of aliasIdx) out[i] = out[i].replace(/= AR\./, '= STR.');
  // insert hook: after component opening brace line
  const starts = [];
  out.forEach((l, i) => { if (/^export function [A-Z]/.test(l)) starts.push(i); });
  for (let k = starts.length - 1; k >= 0; k--) {
    const sIdx = starts[k];
    const eIdx = k + 1 < starts.length ? starts[k + 1] : out.length;
    const body = out.slice(sIdx, eIdx).join('\n');
    if (!/STR\./.test(body)) continue;
    if (/const \{ STR \} = useLang\(\);/.test(body)) continue;
    let brace = sIdx;
    while (brace < eIdx && !out[brace].includes('{')) brace++;
    out.splice(brace + 1, 0, '  const { STR } = useLang();');
  }
  // drop AR from import if no AR. remains
  const joined = out.join('\n');
  let final = joined;
  if (!/\bAR\./.test(joined)) {
    final = joined
      .replace(/import\s*\{\s*AR\s*,\s*([^}]+)\}\s*from\s*'@\/lib\/i18n';/, "import { $1 } from '@/lib/i18n';")
      .replace(/import\s*\{\s*AR\s*\}\s*from\s*'@\/lib\/i18n';\n/, '');
  }
  writeFileSync(f, final, 'utf8');
  done++;
  console.log('converted ' + f);
}
console.log((WRITE ? 'converted: ' : '[dry-run] would convert: ') + done);
