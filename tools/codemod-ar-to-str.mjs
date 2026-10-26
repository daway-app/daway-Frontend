import { readFileSync, writeFileSync } from 'node:fs';
/**
 * Codemod: convert `AR.` usages to `STR.` inside React components.
 *
 * RULES (conservative — only touches what it understands):
 * 1. File must import AR from '@/lib/i18n' AND be a .tsx component file,
 *    OR a .ts file that already imports a hook context (shared.ts handled
 *    manually — skipped here).
 * 2. If the file's default-exported / named component function body can host
 *    `const { STR } = useLang();`, insert it after the first existing hook
 *    call line (`useXxx(...)`) inside the component, else after the opening
 *    brace of the first `export function Component(`.
 * 3. Replace `AR.` → `STR.` ONLY in JSX expression / TS expression positions
 *    (simple textual replace is safe: `AR` identifier is only the import).
 * 4. Update the import: remove `AR` from the i18n import (keep roleLabel /
 *    labelOf if present), add `import { useLang } from
 *    '@/lib/lang/LanguageContext';` after the i18n import line.
 * 5. Files where AR is used at MODULE level (outside any component — e.g.
 *    const X = { label: AR... }) are REPORTED, not converted.
 *
 * Run: node tools/codemod-ar-to-str.mjs [--write]
 * Default (no flag): dry-run report.
 */
const DRY = !process.argv.includes('--write');

const raw = readFileSync('outputs/ar-files.txt', 'utf16le');
const cleaned = raw.replace(/^\uFEFF/, '');
const files = cleaned
  .split('\n')
  .map((l) => l.trim().replace(/\\/g, '/'))
  .filter((l) => l.startsWith('src/') && (l.endsWith('.tsx') || l.endsWith('.ts')));

const SKIP = new Set([
  'src/lib/i18n.ts',
  'src/lib/lang/LanguageContext.tsx',
  'src/features/admin/shared.ts',
  'src/layouts/AdminLayout.tsx',
]);

function findModuleLevelAR(src, importLine) {
  return null;
}

let converted = 0;
const needsManual = [];

for (const f of files) {
  if (SKIP.has(f)) continue;
  const src = readFileSync(f, 'utf8');
  if (!src.includes('AR.')) continue;
  // module-level usage detection: AR. appears before the first `export function` or `export const X = (` etc.
  const firstExport = src.search(/export\s+(function|const)/);
  const firstAR = src.indexOf('AR.');
  if (firstAR >= 0 && firstAR < firstExport) {
    // Could still be inside a non-component helper above the component —
    // check whether the AR usage sits inside a function body by brace-depth.
    needsManual.push(f + ' (AR used before first export — verify)');
    continue;
  }
  if (DRY) {
    converted++;
    continue;
  }
  let out = src;
  // 1. fix import
  out = out.replace(
    /import\s*\{\s*AR\s*,\s*([^}]+)\}\s*from\s*'@\/lib\/i18n';/,
    "import { $1 } from '@/lib/i18n';\nimport { useLang } from '@/lib/lang/useLang';",
  );
  out = out.replace(
    /import\s*\{\s*AR\s*\}\s*from\s*'@\/lib\/i18n';/,
    "import { useLang } from '@/lib/lang/useLang';",
  );
  // 2. insert hook: after first line inside component that starts with 2-space hook call
  const lines = out.split('\n');
  let inserted = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s{2}(const|let)\s+\S+\s*=\s*use[A-Z]/.test(lines[i])) {
      const indent = lines[i].match(/^\s*/)[0];
      lines.splice(i + 1, 0, indent + 'const { STR } = useLang();');
      inserted = true;
      break;
    }
  }
  if (!inserted) {
    needsManual.push(f + ' (no hook anchor found — insert manually)');
    continue;
  }
  out = lines.join('\n');
  // 3. replace AR. → STR.
  out = out.replace(/\bAR\./g, 'STR.');
  writeFileSync(f, out, 'utf8');
  converted++;
}
console.log((DRY ? '[dry-run] would convert: ' : 'converted: ') + converted);
console.log('NEEDS-MANUAL(' + needsManual.length + '):');
for (const m of needsManual) console.log('  ' + m);

