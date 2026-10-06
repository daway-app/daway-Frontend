/**
 * One-shot: repair double-encoded (mojibake) Arabic comments in a CSS file.
 *
 * The file was originally written in Windows-1256 and later re-saved as UTF-8
 * without a transcoding step, so every non-ASCII comment byte was reinterpreted
 * twice. The damage is confined to COMMENTS (no selectors or values), so the
 * safe repair is to substitute readable English section labels that describe the
 * rule that follows — the original text is unrecoverable without loss.
 *
 * Only lines that are pure `/* ... *\/` comments are touched.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/styles/pages/users-create.css';

/** line number (1-based) → replacement comment */
const REPLACEMENTS = {
  2: '   Modern Card & Grid Layout',
  35: '/* Coloured, prominent card header */',
  71: '/* Form card body */',
  76: '/* Field grid layout */',
  127: '/* Password field wrapper + eye toggle */',
  158: '/* Password-strength indicator (animation + bar) */',
  188: '/* Dropdown list */',
  198: '/* Action buttons */',
  242: '/* Error box */',
  253: '/* Success message */',
};

const lines = readFileSync(FILE, 'utf8').split('\n');

let changed = 0;
for (const [n, text] of Object.entries(REPLACEMENTS)) {
  const i = Number(n) - 1;
  const before = lines[i];
  // Only replace a genuine comment line containing non-ASCII mojibake.
  if (!/^\s*\/\*/.test(before) || !/[\u0080-\uFFFF]/.test(before)) {
    console.warn(`skip line ${n} (not a mojibake comment): ${JSON.stringify(before)}`);
    continue;
  }
  lines[i] = text;
  changed++;
}

writeFileSync(FILE, lines.join('\n'));
console.log(`repaired ${changed} comment line(s) in ${FILE}`);
