/**
 * One-off DOM probe for a single authenticated route.
 *
 * `screens.mjs` gave a suspicious result: `/inventory` reported the DASHBOARD's
 * `<h1>` and zero API calls. This probe answers three specific questions that
 * the summary report cannot:
 *   1. What is actually in the main content area right now?
 *   2. Which API requests were issued, and what did they return?
 *   3. Is React re-mounting the page repeatedly (a remount/abort loop)?
 *
 * It counts mounts by tagging the DOM and sampling over time, and it records
 * every request/response pair for /api/ traffic.
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
const BASE = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/+$/, '');

/**
 * Repair the route argument.
 *
 * Git Bash (MSYS) rewrites a `/`-leading argument into a Windows path before
 * Node sees it — `/inventory` arrives as
 * `C:/Users/…/PortableGit/versions/1.2.0/inventory`, which Chrome rejects as an
 * invalid URL. This tool only ever navigates to routes on our own dev server,
 * so strip any drive prefix and Git/PortableGit install dir. `PROBE_ROUTE` is
 * the escape hatch.
 */
function parseRoute(raw) {
  if (raw.startsWith('/') && !/^\/[A-Za-z]:/.test(raw)) return raw;
  let s = raw.replace(/^[A-Za-z]:[\\/]/, '');
  s = s.replace(/^.*?(?:PortableGit|Git)(?:[\\/]versions[\\/][^\\/]+)?[\\/]?/i, '');
  s = s.replace(/\\/g, '/').replace(/^\/+/, '');
  return '/' + s;
}

const ROUTE = parseRoute(process.env.PROBE_ROUTE || process.argv[3] || '/inventory');

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-probe-'));
const port = 9700 + Math.floor(Math.random() * 200);

const chrome = spawn(CHROME, [
  '--headless=new',
  // Chrome otherwise honours the SYSTEM proxy, which routes 127.0.0.1
  // through it and makes localhost calls crawl or time out.
  '--no-proxy-server',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.on('exit', () => {
  try { chrome.kill(); } catch { /* gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked */ }
});

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error('Chrome never came up');
}

const socket = new WebSocketImpl(await getWsUrl(), { perMessageDeflate: false });
await new Promise((res, rej) => { socket.once('open', res); socket.once('error', rej); });

let nextId = 1;
const pending = new Map();
const traffic = [];
const reqs = new Map();
const consoleMsgs = [];

socket.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
  if (msg.method === 'Network.requestWillBeSent') {
    const r = msg.params.request;
    if (r.url.includes('/api/')) reqs.set(msg.params.requestId, { url: r.url, method: r.method, t: Date.now() });
  }
  if (msg.method === 'Network.responseReceived') {
    const rid = msg.params.requestId;
    const req = reqs.get(rid);
    if (req) {
      traffic.push({
        method: req.method,
        path: req.url.replace(/^https?:\/\/[^/]+/, ''),
        status: msg.params.response.status,
        ms: Date.now() - req.t,
      });
      reqs.delete(rid);
    }
  }
  if (msg.method === 'Network.loadingFailed') {
    const req = reqs.get(msg.params.requestId);
    if (req) {
      traffic.push({
        method: req.method,
        path: req.url.replace(/^https?:\/\/[^/]+/, ''),
        status: `FAILED:${msg.params.errorText}`,
        ms: Date.now() - req.t,
      });
      reqs.delete(msg.params.requestId);
    }
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const type = msg.params.type;
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    if (type === 'error' || type === 'warning') consoleMsgs.push(`${type}: ${String(text).slice(0, 200)}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleMsgs.push(`uncaught: ${String(d.exception?.description || d.text).slice(0, 300)}`);
  }
});

const send = (method, params = {}, sessionId) => {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
};

const { targetInfos } = await send('Target.getTargets');
const targetId = targetInfos.find((t) => t.type === 'page')?.targetId;
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

// ── login ────────────────────────────────────────────────────────────
console.log(`→ login ${BASE}/login`);
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);

// POLL for the form — the app shows a session-check loader first, so a fixed
// sleep produces a false "form missing" abort on a slow backend.
let formReady = false;
for (let i = 0; i < 180; i++) {
  await sleep(500);
  try {
    formReady = await evaluate(`!!document.querySelector('#loginForm')`);
  } catch {
    formReady = false;
  }
  if (formReady) break;
}
if (!formReady) {
  console.error('✗ login form never rendered');
  process.exit(1);
}

await evaluate(`(() => {
  const setVal = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('#identityInput'), 'PH-1234');
  setVal(document.querySelector('#passwordInput'), 'password');
  return true;
})()`);
await sleep(400);
await evaluate(`document.querySelector('#submitBtn').click(); true`);
for (let i = 0; i < 30; i++) {
  await sleep(900);
  const p = await evaluate('location.pathname');
  if (p && !p.startsWith('/login')) break;
}
console.log('✓ logged in');

// ── navigate to the route under test ─────────────────────────────────
traffic.length = 0;
consoleMsgs.length = 0;
console.log(`→ ${ROUTE}\n`);

await send('Page.navigate', { url: `${BASE}${ROUTE}` }, sessionId);
await sleep(800);
await send('Page.reload', {}, sessionId);
await sleep(4000);

// Sample the DOM 4× over 8s.
//
// NOTE on selectors: `document.querySelector('h1')` is NOT a reliable page
// heading here — the app shell (topbar) can contribute an earlier `<h1>` for
// its own page-title region, so a naive query reports the SHELL's title and
// makes every route look like the dashboard. Scope the lookup to the routed
// content area (`.ph-page`) instead, and fall back to `main`.
const samples = [];
for (let i = 0; i < 4; i++) {
  const s = await evaluate(`(() => {
    const page = document.querySelector('.ph-page');
    const scope = page || document.querySelector('main') || document.body;
    return {
      h1: (scope.querySelector('h1')?.textContent || '').trim().slice(0, 60),
      anyH1: (document.querySelector('h1')?.textContent || '').trim().slice(0, 60),
      hasPage: !!page,
      path: location.pathname,
      skel: document.querySelectorAll('.ph-skel-row').length,
      stats: document.querySelectorAll('.ph-stat').length,
      rows: document.querySelectorAll('tbody tr').length,
      cards: document.querySelectorAll('.ph-card').length,
      errEl: document.querySelectorAll('.ph-error').length,
      errText: (document.querySelector('.ph-error h3')?.textContent || '').trim(),
      emptyEl: document.querySelectorAll('.ph-empty').length,
      bodyLen: document.body.innerText.length,
    };
  })()`);
  samples.push(s);
  await sleep(2000);
}

console.log('DOM samples (t=0,2,4,6s):');
for (const [i, s] of samples.entries()) {
  console.log(`  [${i}] path=${s.path} page=${s.hasPage} h1(page)="${s.h1}" h1(first)="${s.anyH1}" skel=${s.skel} stats=${s.stats} rows=${s.rows} cards=${s.cards} empty=${s.emptyEl} err=${s.errEl} bodyLen=${s.bodyLen}`);
}

console.log('\nAPI traffic:');
if (traffic.length === 0) console.log('  (none)');
for (const t of traffic) console.log(`  ${t.method} ${t.path} → ${t.status} (${t.ms}ms)`);

console.log('\nconsole:');
if (consoleMsgs.length === 0) console.log('  (clean)');
for (const c of [...new Set(consoleMsgs)].slice(0, 12)) console.log(`  ${c}`);

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, sessionId);
const out = join('C:/Users/MSI/daway-web/qa', `probe-${ROUTE.replace(/\//g, '_') || 'root'}.png`);
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`\nshot: ${out}`);

socket.close();
process.exit(0);
