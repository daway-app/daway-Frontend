import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
/**
 * Bulk codemod for the dominant pattern:
 *
 *   const X = AR.<path>;          (module level, possibly several per file)
 *   ...
 *   export function Page() {
 *     ...hooks...
 *     ... X.foo ...               (component body uses the alias)
 *   }
 *
 * Transforms to:
 *
 *   import { useLang } ...        (added if missing)
 *   const X = AR.<path>;          → kept + `void X;` (reference snapshot)
 *   export function Page() {
 *     const { STR } = useLang();  (inserted as first statement)
 *     const X = STR.<path>;       (fresh alias, shadows module one)
 *     ...hooks...
 *   }
 *
 * SAFE ONLY WHEN: the alias path resolves identically under STR (same shape —
 * guaranteed: parity-checked) AND the alias is used ONLY inside component
 * bodies (not in other module-level constants). Files violating this are
 * reported and skipped. Multi-component files get the alias in EVERY
 * `export function` that uses it.
 *
 * Usage: node tools/codemod-alias.mjs [--write] [file...]
 * Default file set: all survey files with module aliases, minus SKIP.
 */
const WRITE = process.argv.includes('--write');
const onlyFiles = process.argv.slice(2).filter((a) => !a.startsWith('--'));

const SKIP = new Set([
  'src/lib/i18n.ts',
  'src/lib/lang/LanguageContext.tsx',
  'src/features/auth/RegisterPage.tsx',
  'src/features/auth/ForgotPasswordPage.tsx',
  'src/features/auth/PasswordChangePage.tsx',
]);

function collectTargets() {
  if (onlyFiles.length > 0) return onlyFiles.map((f) => f.replace(/\\/g, '/'));
  const out = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name).replace(/\\/g, '/');
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        walk(p);
      } else if (/\.tsx?$/.test(e.name)) {
        if (p.includes('lib/lang') || p.endsWith('lib/i18n.ts')) continue;
        const s = readFileSync(p, 'utf8');
        if (/^const [A-Z][A-Za-z0-9_]* = AR\./m.test(s)) out.push(p);
      }
    }
  })('src');
  return out.filter((f) => !SKIP.has(f));
}

let done = 0;
const skipped = [];
for (const f of collectTargets()) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  // 1. module aliases
  const aliasDecls = [];
  lines.forEach((l, i) => {
    const m = l.match(/^const ([A-Z][A-Za-z0-9_]*) = (AR\.[A-Za-z0-9_.]+);/);
    if (m) aliasDecls.push({ name: m[1], path: m[2], line: i });
  });
  if (aliasDecls.length === 0) continue;
  // 2. reject if alias used in ANOTHER module-level const (non-component)
  let bad = null;
  const compStarts = [];
  lines.forEach((l, i) => {
    if (/^export function [A-Z]/.test(l)) compStarts.push(i);
  });
  if (compStarts.length === 0) { skipped.push(f + ' (no exported component)'); continue; }
  const firstComp = compStarts[0];
  for (const a of aliasDecls) {
    for (let i = 0; i < firstComp; i++) {
      if (i === a.line) continue;
      if (new RegExp('\\b' + a.name + '\\b').test(lines[i]) && !/^\s*\/\//.test(lines[i]) && !/^\s*\*/.test(lines[i])) {
        // allow the alias's own declaration line and void lines only
        if (!lines[i].includes('void ' + a.name)) { bad = a.name + ' used at module line ' + (i + 1); break; }
      }
    }
    if (bad) break;
  }
  if (bad) { skipped.push(f + ' (' + bad + ')'); continue; }
  if (!WRITE) { done++; continue; }
  // 3. apply
  const out = [...lines];
  // 3a. keep module alias + void marker
  for (const a of aliasDecls) {
    out[a.line] = out[a.line] + '\nvoid ' + a.name + '; // module AR snapshot — component uses STR below';
  }
  // 3b. ensure useLang import
  let li = out.findIndex((l) => /from '@\/lib\/i18n'/.test(l));
  if (!out.some((l) => l.includes('@/lib/lang/LanguageContext'))) {
    out.splice(li + 1, 0, "import { useLang } from '@/lib/lang/LanguageContext';");
    // recompute component starts (+1 shift)
    for (let k = 0; k < compStarts.length; k++) compStarts[k]++;
  }
  // 3c. insert into each exported component that uses any alias
  const fresh = aliasDecls.map((a) => '  const ' + a.name + ' = ' + a.path.replace(/^AR\./, 'STR.') + ';').join('\n');
  // find component ranges: from compStarts[k] to next compStarts or EOF; check alias use inside
  const inserts = [];
  for (let k = 0; k < compStarts.length; k++) {
    const start = compStarts[k] + (out.length - lines.length); // adjust for added lines is messy; recompute instead
  }
  // simpler: rescan out for export functions
  const starts = [];
  out.forEach((l, i) => { if (/^export function [A-Z]/.test(l)) starts.push(i); });
  // process from LAST to FIRST so indices stay valid
  for (let k = starts.length - 1; k >= 0; k--) {
    const sIdx = starts[k];
    const eIdx = k + 1 < starts.length ? starts[k + 1] : out.length;
    const body = out.slice(sIdx, eIdx).join('\n');
    const uses = aliasDecls.some((a) => new RegExp('\\b' + a.name + '\\.').test(body));
    if (!uses) continue;
    // insert after the opening brace line of the component
    let braceLine = sIdx;
    while (braceLine < eIdx && !out[braceLine].includes('{')) braceLine++;
    const block = '  const { STR } = useLang();\n' + fresh;
    // avoid double-insert if already has useLang
    if (/const \{ STR \} = useLang\(\);/.test(body)) {
      // just add fresh aliases after existing hook
      const hookIdx = out.findIndex((l, i) => i > sIdx && i < eIdx && /const \{ STR \} = useLang\(\);/.test(l));
      out.splice(hookIdx + 1, 0, fresh);
    } else {
      out.splice(braceLine + 1, 0, block);
    }
  }
  writeFileSync(f, out.join('\n'), 'utf8');
  done++;
}
console.log((WRITE ? 'converted: ' : '[dry-run] would convert: ') + done);
console.log('SKIPPED(' + skipped.length + '):');
for (const s of skipped) console.log('  ' + s);
