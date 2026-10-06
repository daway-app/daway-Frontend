/**
 * Authenticated navigation smoke test.
 *
 * Logs in once, then visits a list of routes and reports, for each:
 *   · the final path (did a guard bounce us?)
 *   · whether an <h1> rendered
 *   · document scrollWidth vs viewport (horizontal overflow)
 *   · console errors
 *
 * Usage: node tools/nav-smoke.mjs <baseUrl> <pharmacyId> <password> <path,path,...>
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://localhost:5173';
const PHARMACY_ID = process.argv[3] || 'PH-1234';
const PASSWORD = process.argv[4] || 'password';

/**
 * FIX (2026-10-01): Git Bash (MSYS) rewrites any CLI argument that looks like a
 * POSIX path into a Windows path before Node ever sees it. Passing
 * "/,/accounting,/accounting/sales" therefore arrived as
 * "C:/Users/.../PortableGit/versions/1.2.0/,..." → "Cannot navigate to invalid URL".
 *
 * Two defences:
 *   1. Accept the list via the NAV_PATHS env var (immune to MSYS mangling).
 *   2. Sanitise the CLI arg: force every entry to start with a single "/".
 */
function parsePaths(raw) {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      // If MSYS mangled it into "C:/foo/bar", keep only the tail after the last drive-ish segment.
      const stripped = s.replace(/^[A-Za-z]:[\\/].*?PortableGit[\\/][^\\/]*[\\/]?/, '');
      const withSlash = stripped.startsWith('/') ? stripped : '/' + stripped.replace(/^\.?\//, '');
      return withSlash === '/' ? '/' : withSlash.replace(/\/+$/, '');
    });
}

const RAW_PATHS = process.env.NAV_PATHS || process.argv[5] || '/,/accounting,/accounting/sales,/accounting/cash';
const PATHS = parsePaths(RAW_PATHS);
if (!PATHS.length || PATHS.some((p) => !p.startsWith('/'))) {
  console.error('✗ could not parse paths from:', JSON.stringify(RAW_PATHS));
  process.exit(1);
}

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-nav-'));
const port = 9800 + Math.floor(Math.random() * 200);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${port}`, 'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cleanup() {
  try { chrome.kill(); } catch { /* gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked */ }
}
process.on('exit', cleanup);

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

const socket = new WebSocketImpl(await getWsUrl(), { perMessageDeflate: false });
await new Promise((res, rej) => { socket.once('open', res); socket.once('error', rej); });

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
socket.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push('EXC: ' + (msg.params.exceptionDetails?.exception?.description || ''));
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});

function send(method, params = {}, sessionId) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { targetInfos } = await send('Target.getTargets');
let targetId = targetInfos.find((t) => t.type === 'page')?.targetId;
if (!targetId) targetId = (await send('Target.createTarget', { url: 'about:blank' })).targetId;
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

async function evaluate(expression) {
  const r = await send('Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
}

// --- Login ---
console.log('→ logging in…');
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);

// انتظر حتى يظهر الحقل فعلًا (التحميل قد يتأخر مع Vite cold start).
let ready = false;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  ready = await evaluate(`!!document.querySelector('#identityInput')`);
  if (ready) break;
}
if (!ready) {
  console.error('✗ login form never appeared');
  process.exit(1);
}
await sleep(500);

await evaluate(`(() => {
  const setVal = (el, val) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('#identityInput'), ${JSON.stringify(PHARMACY_ID)});
  setVal(document.querySelector('#passwordInput'), ${JSON.stringify(PASSWORD)});
  return true;
})()`);
await sleep(400);
await evaluate(`document.querySelector('#submitBtn').click(); true`);
for (let i = 0; i < 25; i++) {
  await sleep(1000);
  const p = await evaluate('location.pathname');
  if (p && !p.startsWith('/login')) break;
}
const afterLogin = await evaluate('location.pathname');
console.log(`  logged in, at: ${afterLogin}`);
if (afterLogin.startsWith('/login')) {
  console.error('✗ login failed, aborting');
  process.exit(1);
}

// --- Visit each path ---
const results = [];
for (const p of PATHS) {
  consoleErrors.length = 0;
  console.log(`\n→ ${p}`);
  await send('Page.navigate', { url: `${BASE}${p}` }, sessionId);
  await sleep(4500);

  const info = await evaluate(`(() => {
    const h1 = document.querySelector('h1');
    return JSON.stringify({
      path: location.pathname,
      h1: h1 ? h1.textContent.trim() : '',
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      cards: document.querySelectorAll('.ph-card').length,
      rows: document.querySelectorAll('tbody tr').length,
    });
  })()`);
  const parsed = JSON.parse(info);
  const overflow = parsed.docW > parsed.winW;
  results.push({ path: p, ...parsed, overflow, errs: [...consoleErrors] });

  console.log(`  final path : ${parsed.path}${parsed.path !== p ? '  ⚠️ bounced' : ''}`);
  console.log(`  h1         : ${parsed.h1 || '(none)'}`);
  console.log(`  cards=${parsed.cards} rows=${parsed.rows}`);
  console.log(`  docW=${parsed.docW} winW=${parsed.winW} ${overflow ? '⚠️ OVERFLOW' : '✓'}`);
  if (consoleErrors.length) {
    console.log(`  console errors (${consoleErrors.length}):`);
    consoleErrors.slice(0, 5).forEach((e) => console.log('    - ' + e.slice(0, 160)));
  }
}

console.log('\n=== SUMMARY ===');
const bad = results.filter((r) => r.overflow || r.path !== r.path || r.errs.length);
results.forEach((r) => {
  const flag = r.overflow ? 'OVERFLOW' : (r.errs.length ? 'ERR' : 'ok');
  console.log(`  ${flag.padEnd(9)} ${r.path}`);
});

socket.close();
process.exit(0);
