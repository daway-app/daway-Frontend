import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
/**
 * Finish AR → STR migration for page/component files.
 *
 * Per file:
 *  1. Drop module-level `const X = AR.<path>;` (record for re-insertion).
 *  2. Replace remaining `AR.` with `STR.` (skips //- and *-comment lines).
 *  3. `roleLabel(<one arg>)` gains `, STR`.
 *  4. In every `export function` whose body uses STR.: ensure
 *     `const { STR } = useLang();` + re-insert moved aliases after it.
 *  5. Add `useLang` import; drop `AR` from the i18n import when unused.
 *  6. SAFETY: if `STR.` remains at module level (outside components),
 *     the file is REPORTED and NOT written.
 *
 * Usage: node tools/codemod-str-finish.mjs [--write] [file...]
 */
const WRITE = process.argv.includes('--write');
let files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (process.argv.includes('--survey')) {
  const survey = execSync('node tools/survey-ar.mjs', { encoding: 'utf8' });
  files = survey.split('\n').map((l) => l.split(' | ')[0].trim()).filter((f) => f && f.endsWith('.tsx') && !f.includes('CommandPalette') && !f.includes('i18n.ts') && !f.includes('LanguageContext'));
}
let done = 0;
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const lines = src.split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    if (/^export (function|const) [A-Za-z0-9_]+/.test(l)) starts.push(i);
    // Non-exported `function Foo(` declarations are components/helpers
    // rendered during render (e.g. StatusPill) — they need the hook too.
    else if (/^function [A-Z][A-Za-z0-9_]*\(/.test(l)) starts.push(i);
  });
  if (starts.length === 0) { console.log('SKIP(no component) ' + f); continue; }
  const inComp = (i) => {
    for (let k = 0; k < starts.length; k++) {
      const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
      if (i > starts[k] && i < end) return true;
    }
    return false;
  };
  // 1. module-level aliases
  const moved = [];
  const kept = [];
  lines.forEach((l, i) => {
    const m = l.match(/^const ([A-Za-z][A-Za-z0-9_]*) = (AR\.[A-Za-z0-9_.]+);/);
    if (m && !inComp(i)) moved.push({ name: m[1], path: m[2].replace(/^AR\./, 'STR.') });
    else kept.push(l);
  });
  if (moved.length === 0 && !/\bAR\./.test(kept.filter((l) => !/^\s*(\/\/|\*)/.test(l.trim())).join('\n'))) {
    console.log('SKIP(nothing to do) ' + f); continue;
  }
  // 2. AR. → STR. (skip comment lines)
  let out = kept.map((l) => {
    if (/^\s*(\/\/|\*)/.test(l)) return l;
    return l.replace(/\bAR\./g, 'STR.');
  });
  // 3. roleLabel single-arg → add STR
  out = out.map((l) => l.replace(/\broleLabel\(([^(),]+)\)/g, 'roleLabel($1, STR)'));
  const text = out.join('\n');
  // 6. safety: module-level STR.?
  const joined = text.split('\n');
  const cstarts = [];
  joined.forEach((l, i) => {
    if (/^export (function|const) [A-Za-z0-9_]+/.test(l)) cstarts.push(i);
    else if (/^function [A-Z][A-Za-z0-9_]*\(/.test(l)) cstarts.push(i);
  });
  const inC = (i) => {
    for (let k = 0; k < cstarts.length; k++) {
      const end = k + 1 < cstarts.length ? cstarts[k + 1] : joined.length;
      if (i > cstarts[k] && i < end) return true;
    }
    return false;
  };
  const leak = joined.some((l, i) => !inC(i) && /\bSTR\./.test(l) && !/^\s*(\/\/|\*)/.test(l.trim()));
  if (leak) { console.log('NEEDS-MANUAL(module-level STR) ' + f); continue; }
  if (!WRITE) { done++; console.log('would convert ' + f); continue; }
  // 4. hook + moved aliases per component using STR.
  const res = [...joined];
  const comps = [];
  res.forEach((l, i) => {
    if (/^export (function|const) [A-Za-z0-9_]+/.test(l)) comps.push(i);
    else if (/^function [A-Z][A-Za-z0-9_]*\(/.test(l)) comps.push(i);
  });
  for (let k = comps.length - 1; k >= 0; k--) {
    const sIdx = comps[k];
    const eIdx = k + 1 < comps.length ? comps[k + 1] : res.length;
    const body = res.slice(sIdx, eIdx).join('\n');
    if (!/\bSTR\./.test(body)) continue;
    if (/const \{ STR \} = useLang\(\);/.test(body)) {
      // hook exists — still need moved aliases?
      if (moved.length) {
        const hIdx = res.findIndex((l, ii) => ii >= sIdx && ii < eIdx && /const \{ STR \} = useLang\(\);/.test(l));
        const names = moved.filter((m) => new RegExp('\\b' + m.name + '\\b').test(body));
        if (names.length) {
          res.splice(hIdx + 1, 0, ...names.map((m) => '  const ' + m.name + ' = ' + m.path + ';'));
        }
      }
      continue;
    }
    let brace = sIdx;
    while (brace < eIdx && !/\)\s*\{\s*$/.test(res[brace])) brace++;
    if (brace >= eIdx) { console.log('NEEDS-MANUAL(brace) ' + f); continue; }
    const insert = ['  const { STR } = useLang();', ...moved.map((m) => '  const ' + m.name + ' = ' + m.path + ';')];
    res.splice(brace + 1, 0, ...insert);
  }
  let final = res.join('\n');
  // 5. useLang import
  if (!final.includes('@/lib/lang/LanguageContext')) {
    const li = final.split('\n').findIndex((l) => /from '@\/lib\/i18n'/.test(l));
    if (li >= 0) {
      const tmp = final.split('\n');
      tmp.splice(li + 1, 0, "import { useLang } from '@/lib/lang/useLang';");
      final = tmp.join('\n');
    }
  }
  // 5b. drop AR from i18n import when unused
  if (!/\bAR\b/.test(final.replace(/['"`][^'"`]*['"`]/g, ''))) {
    final = final.replace(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/i18n';/s, (m, names) => {
      const rest = names.split(',').map((s) => s.trim()).filter((s) => s && s !== 'AR');
      if (rest.length === 0) return '';
      return 'import { ' + rest.join(', ') + " } from '@/lib/i18n';";
    });
    final = final.replace(/^\n(import|export|\})/m, '$1');
  }
  writeFileSync(f, final, 'utf8');
  done++;
  console.log('converted ' + f);
}
console.log((WRITE ? 'converted: ' : '[dry-run] would convert: ') + done);

