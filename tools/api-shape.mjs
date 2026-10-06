/**
 * Dump the shape of a pharmacy API endpoint, using the REAL login flow.
 *
 * Why a script instead of curl+inline-node: on this machine `HTTP_PROXY` is set
 * to a local proxy that intermittently fails for `127.0.0.1` ("upstream connect
 * failed"), and shell-quoting a JS one-liner inside a `curl |` pipeline kept
 * swallowing the token. Node's fetch honours `NO_PROXY`, so setting it here
 * removes both problems.
 *
 * Usage:
 *   node tools/api-shape.mjs <path> [rangeOrQuery]
 *   node tools/api-shape.mjs /api/pharmacy/accounting/overview range=7d
 *
 * Prints the top-level keys, then a compact summary tailored to whichever
 * payload it recognises. Read-only.
 */

// Must be set before the first fetch — Node reads it lazily but consistently.
process.env.NO_PROXY = '127.0.0.1,localhost';
process.env.no_proxy = '127.0.0.1,localhost';

import { sanitizeRoute } from './lib/paths.mjs';

const BASE = 'http://127.0.0.1:8000';
const PHARMACY_ID = process.env.PHARMACY_ID || 'PH-1234';
const PASSWORD = process.env.PHARMACY_PASSWORD || 'password';

// MSYS rewrites a `/`-leading arg into a Windows path before Node sees it —
// `/api/...` arrives as `C:/…/PortableGit/versions/x/api/...`. Repair it.
const path = sanitizeRoute(process.env.SHAPE_PATH || process.argv[2] || '/api/pharmacy/accounting/overview');
const queryArg = process.argv[3] || '';

async function login() {
  const res = await fetch(`${BASE}/api/login/pharmacy`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ pharmacy_id: PHARMACY_ID, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json?.data?.token) throw new Error(`login failed: ${JSON.stringify(json).slice(0, 300)}`);
  return json.data.token;
}

const token = await login();
console.log(`✓ logged in (token ${token.length} chars)`);

const url = queryArg ? `${BASE}${path}?${queryArg}` : `${BASE}${path}`;
const res = await fetch(url, {
  headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
});
const text = await res.text();

console.log(`→ ${path}${queryArg ? `?${queryArg}` : ''}`);
console.log(`HTTP ${res.status}  (${text.length} bytes)`);

let json;
try {
  json = JSON.parse(text);
} catch {
  console.log('not JSON:', text.slice(0, 300));
  process.exit(1);
}

if (!json.success) {
  console.log('success=false:', JSON.stringify(json).slice(0, 400));
  process.exit(1);
}

const d = json.data;
if (d === undefined) {
  console.log('no data key. top-level keys:', Object.keys(json).join(', '));
  process.exit(0);
}

console.log('top-level data keys:', Array.isArray(d) ? `[array of ${d.length}]` : Object.keys(d).join(', '));

// List endpoints put `pagination`/`stats`/`counts` NEXT TO `data`, not inside it.
// Print them here or they are invisible for array payloads.
const envelope = Object.keys(json).filter((k) => k !== 'data' && k !== 'success');
if (envelope.length) {
  console.log('sibling envelope keys:', envelope.join(', '));
  for (const k of envelope) {
    console.log(`  ${k}: ${JSON.stringify(json[k])}`);
  }
}

/** Recursively describe an object's shape (types only, 2 levels deep). */
function shape(value, depth = 0, maxDepth = 2) {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (depth >= maxDepth) return `[${value.length} items]`;
    return `[${shape(value[0], depth + 1, maxDepth)}]`;
  }
  if (value && typeof value === 'object') {
    if (depth >= maxDepth) return '{…}';
    const inner = Object.entries(value)
      .map(([k, v]) => `${k}: ${shape(v, depth + 1, maxDepth)}`)
      .join(', ');
    return `{${inner}}`;
  }
  if (value === null) return 'null';
  return typeof value;
}

console.log('\nshape:', shape(d));

// Payload-specific detail that matters for wiring decisions.
if (d.kpis) {
  console.log('\nKPIs:');
  for (const k of d.kpis) {
    console.log(`  ${k.key} | "${k.label}" | value=${k.value} | ${k.format} | ${k.tone} | href=${k.href}`);
  }
}
if (d.alerts) {
  console.log('\nalerts:');
  for (const a of d.alerts) console.log(`  ${a.severity} | "${a.title}" | href=${a.href}`);
}
if (d.recent_transactions) {
  const t = d.recent_transactions;
  console.log(`\nrecent_transactions (${t.length}):`);
  console.log('  types:', [...new Set(t.map((x) => x.type))].join(','));
  console.log('  methods:', [...new Set(t.map((x) => x.method))].join(','));
  console.log('  statuses:', [...new Set(t.map((x) => x.status))].join(','));
  if (t[0]) console.log('  sample:', JSON.stringify(t[0]));
}
if (d.expense_breakdown) {
  console.log('\nexpense_breakdown:');
  for (const e of d.expense_breakdown) {
    console.log(`  "${e.label}" = ${e.amount} (${e.percentage}%)`);
  }
}
if (d.series) {
  console.log('\nseries keys:', Object.keys(d.series).join(','));
  for (const [k, v] of Object.entries(d.series)) {
    console.log(`  ${k}: ${v.labels?.length ?? 0} labels, ${v.data?.length ?? 0} points`, JSON.stringify(v).slice(0, 140));
  }
}
for (const key of ['barcode_coverage', 'profit_indicator', 'comparison', 'receivables', 'stats', 'counts', 'pagination']) {
  if (d[key] !== undefined) console.log(`\n${key}: ${JSON.stringify(d[key])}`);
}
if (Array.isArray(d) && d.length > 0) {
  console.log('\nfirst row:', JSON.stringify(d[0], null, 1).slice(0, 700));
}
