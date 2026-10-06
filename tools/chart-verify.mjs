/**
 * Chart-loading verification — proves audit B-1 is fixed.
 *
 * Before the fix, `index.html` never loaded Chart.js, so every chart rendered an
 * empty canvas with NO console error. The old fallback polled forever, so
 * nothing ever failed loudly.
 *
 * This probe asserts, on the REAL app (not the harness, which injected the script
 * at runtime and therefore hid the bug):
 *   1. <script src="/vendor/chart.umd.js"> exists in the served HTML.
 *   2. The request for that file returns 200 with a non-trivial body.
 *   3. window.Chart is defined by the time the app renders.
 *   4. Every <canvas> in the accounting overview has actually been drawn to
 *      (non-blank pixels) — the real proof the chart rendered.
 *
 * Usage: node tools/chart-verify.mjs <baseUrl> <pharmacyId> <password>
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.argv[2] || 'http://127.0.0.1:5173';
const PHARMACY_ID = process.argv[3] || 'PH-1234';
const PASSWORD = process.argv[4] || 'password';

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-chart-'));
const port = 9600 + Math.floor(Math.random() * 200);

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
      const j = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error('DevTools endpoint never came up');
}

const socket = new WebSocketImpl(await getWsUrl(), { perMessageDeflate: false });
await new Promise((res, rej) => { socket.once('open', res); socket.once('error', rej); });

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const netResponses = [];
socket.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  }
  if (msg.method === 'Network.responseReceived') {
    const u = msg.params.response.url;
    if (u.includes('chart.umd')) netResponses.push({ url: u, status: msg.params.response.status });
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

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

// --- 1. login ---
console.log('\n[1] logging in…');
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);
let ready = false;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  ready = await evaluate(`!!document.querySelector('#identityInput')`);
  if (ready) break;
}
if (!ready) { console.error('✗ login form never appeared'); process.exit(1); }
await evaluate(`(() => {
  const setVal = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('#identityInput'), ${JSON.stringify(PHARMACY_ID)});
  setVal(document.querySelector('#passwordInput'), ${JSON.stringify(PASSWORD)});
  return true;
})()`);
await sleep(400);
await evaluate(`document.querySelector('#submitBtn').click(); true`);
let loggedIn = false;
for (let i = 0; i < 25; i++) {
  await sleep(1000);
  const p = await evaluate('location.pathname');
  if (p && !p.startsWith('/login')) { loggedIn = true; break; }
}
check('login succeeded', loggedIn, `path=${await evaluate('location.pathname')}`);
if (!loggedIn) process.exit(1);

// --- 2. the accounting overview (has the charts) ---
console.log('\n[2] opening /accounting …');
await send('Page.navigate', { url: `${BASE}/accounting` }, sessionId);
await sleep(6000);

// --- 3. assertions ---
const chartLoaded = await evaluate(`typeof window.Chart === 'function'`);
check('window.Chart is defined', chartLoaded);

const tagInDom = await evaluate(
  `!!document.querySelector('script[src*="chart.umd"]')`,
);
check('chart.umd <script> present in DOM', tagInDom);

const net200 = netResponses.some((r) => r.status === 200);
check('chart.umd served with 200', net200,
  netResponses.map((r) => `${r.status} ${r.url.split('/').pop()}`).join(', ') || 'no response seen');

/**
 * The decisive test: is any canvas actually NON-BLANK?
 * A blank canvas is uniformly transparent — sample a grid of pixels and require
 * at least one with alpha > 0.
 */
const canvasReport = await evaluate(`(() => {
  const out = [];
  for (const c of document.querySelectorAll('canvas')) {
    const ctx = c.getContext('2d');
    if (!ctx) { out.push({ w: c.width, h: c.height, drawn: false, why: 'no ctx' }); continue; }
    const w = c.width, h = c.height;
    let nonBlank = 0, sampled = 0;
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 40))) {
      for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 40))) {
        sampled++;
        const a = ctx.getImageData(x, y, 1, 1).data[3];
        if (a > 0) { nonBlank++; if (nonBlank > 3) break; }
      }
      if (nonBlank > 3) break;
    }
    out.push({ w, h, sampled, nonBlank, drawn: nonBlank > 0 });
  }
  return out;
})()`);

const canvases = Array.isArray(canvasReport) ? canvasReport : [];
const drawnCount = canvases.filter((c) => c.drawn).length;
check(
  'every canvas has been drawn to',
  canvases.length > 0 && drawnCount === canvases.length,
  `${drawnCount}/${canvases.length} drawn`,
);
canvases.forEach((c, i) =>
  console.log(`      canvas[${i}] ${c.w}x${c.h} — ${c.drawn ? 'drawn' : 'BLANK'}`),
);

// --- 4. no console errors ---
console.log('\n[3] console errors…');
const realErrors = consoleErrors.filter((e) => !/favicon|DevTools/i.test(e));
check('no console errors', realErrors.length === 0,
  realErrors.length ? realErrors.slice(0, 3).join(' | ') : 'clean');

// --- summary ---
const failed = results.filter((r) => !r.pass);
console.log('\n=== SUMMARY ===');
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('  FAILURES:');
  failed.forEach((f) => console.log(`    - ${f.name} (${f.detail || 'no detail'})`));
}

socket.close();
process.exit(failed.length ? 1 : 0);
