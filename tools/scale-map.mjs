/**
 * Pins the value → token mapping for font-size and border-radius, and audits
 * the codebase for values the automated run orphaned.
 *
 * 🔴 WHY THIS FILE EXISTS — the `.form-title` incident:
 *   `apply-scales.mjs` decides what to tokenise using a LIVE count of how many
 *   times each raw value appears across src/styles, and skips anything used
 *   once (`count ≤ 1`). That count changes as files are edited, so re-running
 *   the script after other edits silently DROPPED `.form-title { font-size:
 *   25px }` — it had become the only 25px left, so it was skipped, even though
 *   batch-1 had tokenised it to `var(--fs-2xl)`.
 *
 *   ⇒ **NEVER re-run `apply-scales.mjs`.** The mapping is pinned below; apply
 *     any new value by hand, citing this map.
 *
 * Usage:
 *   node tools/scale-map.mjs            # print the pinned map + the orphan audit
 *   node tools/scale-map.mjs --json     # machine-readable
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/styles';

/* ---------- the pinned scale (matches ui-system.css :root) ---------- */
const FONT_TOKENS = [
  { token: '--fs-2xs', px: 11 },
  { token: '--fs-xs', px: 12 },
  { token: '--fs-sm', px: 13 },
  { token: '--fs-md', px: 14 },
  { token: '--fs-lg', px: 16 },
  { token: '--fs-lg2', px: 18 },
  { token: '--fs-xl', px: 20 },
  { token: '--fs-2xl', px: 24 },
];
const RADIUS_TOKENS = [
  { token: '--ph-r-sm', px: 8 },
  { token: '--ph-r-md', px: 12 },
  { token: '--ph-r-lg', px: 16 },
  { token: '--ph-r-xl', px: 20 },
];
/* The phase allowed ≤2px of movement. Ties resolve DOWN (the smaller step). */
const MAX_DELTA = 2;
/* Values the phase brief excluded from the radius scale entirely. */
const RADIUS_EXCLUDED = new Set([2, 4, 7]); // too small / deliberate hairlines

const toPx = (raw) => {
  const v = raw.trim();
  if (/^\d*\.?\d+px$/.test(v)) return parseFloat(v);
  if (/^\d*\.?\d+rem$/.test(v)) return parseFloat(v) * 16; // nominal; renders ×15
  return null;
};

const nearest = (tokens, px) => {
  let best = tokens[0];
  let bestD = Infinity;
  for (const t of tokens) {
    const d = Math.abs(t.px - px);
    if (d < bestD) { bestD = d; best = t; }
  }
  return { token: best.token, delta: +(px - best.px).toFixed(2) };
};

/* ---------- pin the map ---------- */
const map = {
  _meta: {
    generated: 'pinned — do not regenerate from a live count',
    rootFontSizePx: 15,
    note: 'rem values below are nominal (16px base); at the 15px root they render 6.25% smaller. See ui-system.css for the rendered px.',
    maxDeltaPx: MAX_DELTA,
    rule: 'A raw value maps to the nearest token ONLY if |delta| ≤ 2px. Apply new values by hand — never re-run apply-scales.mjs.',
  },
  'font-size': {},
  'border-radius': {},
};
for (const px of [...new Set([...Array(61).keys()].map((n) => n),)]) { /* no-op guard */ }

for (let px = 1; px <= 60; px++) {
  const { token, delta } = nearest(FONT_TOKENS, px);
  map['font-size'][`${px}px`] = Math.abs(delta) <= MAX_DELTA ? token : `(leave raw — delta ${delta}px)`;
}
for (let px = 1; px <= 60; px++) {
  if (RADIUS_EXCLUDED.has(px)) { map['border-radius'][`${px}px`] = '(excluded by the phase brief)'; continue; }
  const { token, delta } = nearest(RADIUS_TOKENS, px);
  map['border-radius'][`${px}px`] = Math.abs(delta) <= MAX_DELTA ? token : `(leave raw — delta ${delta}px)`;
}

/* ---------- audit the codebase for orphans ---------- */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}
const files = walk(ROOT);

const isIconSelector = (sel) =>
  /(^|[\s,>+~])(i|svg|em)(\.|:|\s|$)/.test(sel) || /::?(before|after)/.test(sel);
const isBaseRule = (sel) => sel.trim() === 'body' || sel.trim() === 'html' || sel.trim() === ':root';
const isHeading = (sel) => /(^|[\s,>+~])h1(\b|$)/.test(sel);

const orphans = [];   // within threshold, should be a token, is not
const excluded = [];  // deliberately raw — listed so the next person doesn't re-litigate

for (const file of files) {
  const css = readFileSync(file, 'utf8');
  const src = css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const stack = [];
  let buf = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { stack.push(buf.trim()); buf = ''; }
    else if (ch === '}') {
      const sel = (stack.pop() ?? '').trim();
      const body = buf; buf = '';
      if (!sel || sel.startsWith('@')) continue;
      for (const m of body.matchAll(/(font-size|border-radius)\s*:\s*([^;{}]+)/g)) {
        const prop = m[1];
        const raw = m[2].trim();
        const px = toPx(raw);
        if (px == null) continue; // var() / 50% / 999px / 0 — fine
        const line = css.slice(0, css.indexOf(raw, i - body.length - 1)).split('\n').length;
        const reason = { file: file.replace(/\\/g, '/'), line, sel: sel.replace(/\s+/g, ' '), prop, raw, px };
        if (px === 999 || px === 0 || raw.includes('%')) { excluded.push({ ...reason, why: 'circle/pill/shorthand %' }); continue; }
        if (isIconSelector(sel)) { excluded.push({ ...reason, why: 'icon glyph (i/svg/::before)' }); continue; }
        if (isHeading(sel)) { excluded.push({ ...reason, why: 'h1 — display size pinned at 1.6rem' }); continue; }
        if (isBaseRule(sel)) { excluded.push({ ...reason, why: 'base/document rule' }); continue; }
        if (prop === 'border-radius' && RADIUS_EXCLUDED.has(Math.round(px))) { excluded.push({ ...reason, why: 'radius excluded by the brief (2/4/7px)' }); continue; }
        const { token, delta } = nearest(prop === 'font-size' ? FONT_TOKENS : RADIUS_TOKENS, px);
        if (Math.abs(delta) <= MAX_DELTA) orphans.push({ ...reason, token, delta });
        else excluded.push({ ...reason, why: `outside threshold (nearest ${token}, ${delta}px)` });
      }
    } else buf += ch;
  }
}

orphans.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
excluded.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

if (process.argv.includes('--json')) {
  writeFileSync('tools/scale-map.json', JSON.stringify(map, null, 2));
  console.log(JSON.stringify({ orphans, excluded }, null, 2));
  process.exit(0);
}

writeFileSync('tools/scale-map.json', JSON.stringify(map, null, 2));
console.log(`pinned map written: tools/scale-map.json`);
console.log(`\n### ORPHANS — within threshold, should be a token (${orphans.length})`);
for (const o of orphans) console.log(`  ${o.file}:${o.line}  ${o.sel} { ${o.prop}: ${o.raw} }  →  var(${o.token})  (Δ ${o.delta}px)`);
console.log(`\n### DELIBERATELY RAW (${excluded.length})`);
const byWhy = new Map();
for (const e of excluded) { const k = e.why; byWhy.set(k, (byWhy.get(k) ?? 0) + 1); }
for (const [k, n] of [...byWhy.entries()].sort()) console.log(`  ${n}× ${k}`);
for (const e of excluded) console.log(`    ${e.file}:${e.line}  ${e.sel.slice(0, 48)} { ${e.prop}: ${e.raw} }`);
