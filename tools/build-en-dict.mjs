import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocale } from './lang-parse.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const i18nPath = join(root, 'src', 'lib', 'i18n.ts');
export function loadArObject() {
  const src = readFileSync(i18nPath, 'utf8');
  const start = src.indexOf('export const AR = {');
  const open = src.indexOf('{', start);
  let depth = 0;
  let j = open;
  let q = null;
  while (j < src.length) {
    const c = src[j];
    if (q) {
      if (c === '\\') { j += 2; continue; }
      if (c === q) q = null;
      j++;
      continue;
    }
    if (c === "'" || c === '"') { q = c; j++; continue; }
    if (c === '/' && src[j + 1] === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '/' && src[j + 1] === '*') {
      j += 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j += 2;
      continue;
    }
    if (c === '{') depth++;
    if (c === '}') { depth--; if (depth === 0) break; }
    j++;
  }
  const literal = src.slice(open, j + 1);
  return new Function('return (' + literal + ');')();
}
export function walkLeaves(obj, path, cb) {
  for (const e of Object.entries(obj)) {
    const p = path.concat([e[0]]);
    if (typeof e[1] === 'string') cb(p, e[1]);
    else if (e[1] && typeof e[1] === 'object') walkLeaves(e[1], p, cb);
  }
}

export function renderTs(v, indent) {
  const pad = ' '.repeat(indent);
  const padIn = ' '.repeat(indent + 2);
  if (typeof v === 'string') {
    return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  }
  const entries = Object.entries(v);
  if (entries.length === 0) return '{}';
  const lines = entries.map(function (e) {
    const k = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(e[0]) ? e[0] : "'" + e[0] + "'";
    return padIn + k + ': ' + renderTs(e[1], indent + 2) + ',';
  });
  return '{\n' + lines.join('\n') + '\n' + pad + '}';
}
export function enFor(enFiles, dottedFileKey) {
  const dot = dottedFileKey.indexOf('.');
  const file = dottedFileKey.slice(0, dot);
  const dotted = dottedFileKey.slice(dot + 1);
  const flat = enFiles[file];
  return flat ? flat[dotted] : undefined;
}
import { writeFileSync, mkdirSync } from 'node:fs';
const outPath = join(root, 'src', 'lib', 'lang', 'en.ts');
const arFiles = loadLocale('ar');
const enFiles = loadLocale('en');
const arValueToKeys = new Map();
for (const fe of Object.entries(arFiles)) {
  for (const kv of Object.entries(fe[1])) {
    const list = arValueToKeys.get(kv[1]) || [];
    list.push(fe[0] + '.' + kv[0]);
    arValueToKeys.set(kv[1], list);
  }
}
const AR = loadArObject();
const enMirror = JSON.parse(JSON.stringify(AR));
const okCount = { n: 0 };
const fbCount = { n: 0 };
const ambiguous = [];
const missing = [];
const consumed = new Set();
function setAtPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
}
function norm(s) {
  return s.replace(/\s+/g, ' ').replace(/[«»""]/g, '"').trim();
}
const arNormToKeys = new Map();
for (const fe of Object.entries(arFiles)) {
  for (const kv of Object.entries(fe[1])) {
    const nk = norm(kv[1]);
    const list = arNormToKeys.get(nk) || [];
    list.push(fe[0] + '.' + kv[0]);
    arNormToKeys.set(nk, list);
  }
}
/** Score a backend candidate key against the frontend path (higher = better). */
function scoreCandidate(frontPath, candKey) {
  const dot = candKey.indexOf('.');
  const file = candKey.slice(0, dot);
  const dotted = candKey.slice(dot + 1);
  const leaf = frontPath[frontPath.length - 1];
  const backLeaf = dotted.split('.').pop();
  const parents = frontPath.slice(0, -1).join('.');
  let s = 0;
  if (backLeaf === leaf) s += 3;
  if (dotted.toLowerCase().includes(leaf.toLowerCase())) s += 1;
  const top = frontPath[0];
  const fileMap = { layout: ['layout', 'topbar', 'sidebar'], pharmacy: ['pharmacy'], accounting: ['accounting'], users: ['users'], admin: ['dashboard', 'pharmacies', 'medicines', 'users', 'logs', 'settings', 'categories'], pharmacyImport: ['pharmacy_import'], register: [] };
  const want = fileMap[top] || [top];
  if (want.includes(file)) s += 2;
  for (const seg of frontPath.slice(1, -1)) {
    if (dotted.toLowerCase().includes(seg.toLowerCase())) { s += 1; break; }
  }
  if (parents && dotted.toLowerCase().includes(parents.split('.').pop().toLowerCase())) s += 1;
  return s;
}
const MANUAL_OVERRIDES = {
  'pharmacy.currency': '₪',
  'register.confirm_label': 'Confirm Password',
  'admin.nav.logout': 'Logout',
  'admin.login.email_label': 'Email Address',
  'admin.medicines.breadcrumb_main': 'Main',
  'admin.users.breadcrumb_main': 'Main',
  'admin.users.form.email_label': 'User Email',
  'admin.inventory.title': 'Inventory',
  'admin.categories.breadcrumb_main': 'Main',
};
walkLeaves(AR, [], function (path, arValue) {
  const joined = path.join('.');
  if (MANUAL_OVERRIDES[joined] !== undefined) {
    setAtPath(enMirror, path, MANUAL_OVERRIDES[joined]);
    okCount.n++;
    return;
  }
  const cands = arValueToKeys.get(arValue) || arNormToKeys.get(norm(arValue)) || [];
  if (cands.length === 0) {
    missing.push(path.join('.') + " = '" + arValue + "'");
    setAtPath(enMirror, path, 'TODO(EN): ' + arValue);
    fbCount.n++;
    return;
  }
  const scored = cands.map(function (c) { return { c: c, s: scoreCandidate(path, c) }; });
  scored.sort(function (a, b) { return b.s - a.s; });
  const best = scored[0];
  const bestEn = enFor(enFiles, best.c);
  const rivals = scored.filter(function (x) {
    const e = enFor(enFiles, x.c);
    return x.s === best.s && e !== undefined && e !== bestEn;
  });
  if (bestEn !== undefined && rivals.length === 0) {
    setAtPath(enMirror, path, bestEn);
    for (const c of cands) consumed.add(c);
    okCount.n++;
  } else if (bestEn === undefined) {
    missing.push(path.join('.') + " = '" + arValue + "'");
    setAtPath(enMirror, path, 'TODO(EN): ' + arValue);
    fbCount.n++;
  } else {
    ambiguous.push(path.join('.') + " = '" + arValue + "' best=" + best.c);
    setAtPath(enMirror, path, 'TODO(EN-AMBIGUOUS): ' + arValue);
    fbCount.n++;
  }
});
console.log('AR leaves: ' + (okCount.n + fbCount.n) + ' | OK: ' + okCount.n + ' | TODO: ' + fbCount.n);
console.log('AMBIGUOUS(' + ambiguous.length + '):');
for (const a of ambiguous.slice(0, 30)) console.log('  ' + a);
console.log('MISSING(' + missing.length + '):');
for (const m of missing) console.log('  ' + m);
if (process.argv.includes('--emit')) {
  mkdirSync(join(root, 'src', 'lib', 'lang'), { recursive: true });
  const head = '/** EN strings - generated. See tools/build-en-dict.mjs. */\n';
  writeFileSync(outPath, head + 'export const EN = ' + renderTs(enMirror, 0) + ' as const;\n', 'utf8');
  console.log('wrote ' + outPath);
}

