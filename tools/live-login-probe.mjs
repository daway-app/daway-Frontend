/**
 * End-to-end login probe against a DEPLOYED frontend.
 *
 * Why this exists: the login form can render fine while the actual POST is
 * blocked by CORS — the server answers 200, but the browser refuses to hand the
 * response to the page, so the UI just "does nothing". Nothing in tsc / eslint /
 * the unit suite can see that; only a real browser on the real origin can.
 *
 * It runs three layers, so a failure can be localised instead of guessed at:
 *   1. does the form render?
 *   2. does a raw fetch from the page reach the API? (isolates CORS / network)
 *   3. does filling + submitting the real form navigate away? (the actual flow)
 *
 * Usage:
 *   node tools/live-login-probe.mjs <baseUrl> [identity] [password]
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

const [, , BASE, IDENTITY = 'PH-1234', PASSWORD = 'password'] = process.argv;
if (!BASE) {
  console.error('usage: node tools/live-login-probe.mjs <baseUrl> [identity] [password]');
  process.exit(2);
}

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-live-'));
const port = 9600 + Math.floor(Math.random() * 300);

const chrome = spawn(CHROME, [
  '--no-proxy-server',
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => {
  try { chrome.kill(); } catch { /* gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked */ }
};
process.on('exit', cleanup);

const consoleLines = [];
const requests = [];
const failed = [];

try {
  let wsUrl = null;
  for (let i = 0; i < 80; i++) {
    try {
      const j = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      if (j.webSocketDebuggerUrl) { wsUrl = j.webSocketDebuggerUrl; break; }
    } catch { /* not up */ }
    await sleep(200);
  }
  if (!wsUrl) throw new Error('Chrome DevTools endpoint never came up');

  const socket = new WebSocketImpl(wsUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { socket.once('open', res); socket.once('error', rej); });

  let nextId = 1;
  const pending = new Map();
  const events = [];
  socket.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        // "Inspected target navigated or closed" fires when the app does a full
        // reload — which is exactly what a SUCCESSFUL login does here. Treat it
        // as an empty result instead of crashing the whole probe.
        if (msg.error.code === -32000) resolve(undefined);
        else reject(new Error(JSON.stringify(msg.error)));
      } else resolve(msg.result);
      return;
    }
    if (msg.method) events.push(msg);
  });

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
    });

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p = {}) => send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Network.enable');
  await S('Log.enable');
  await S('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const reqByCdpId = new Map();

  const drain = () => {
    for (const e of events.splice(0)) {
      if (e.method === 'Runtime.consoleAPICalled') {
        const text = (e.params.args || [])
          .map((a) => a.value ?? a.description ?? a.unserializableValue ?? '')
          .join(' ');
        consoleLines.push(`[${e.params.type}] ${text}`);
      }
      if (e.method === 'Log.entryAdded') {
        consoleLines.push(`[log:${e.params.entry.level}] ${e.params.entry.text}`);
      }
      if (e.method === 'Network.requestWillBeSent') {
        const { requestId, request } = e.params;
        reqByCdpId.set(requestId, `${request.method} ${request.url}`);
        if (/onrender\.com/.test(request.url)) {
          requests.push(`-> ${request.method} ${request.url}`);
        }
      }
      if (e.method === 'Network.responseReceived') {
        const { requestId, response } = e.params;
        const key = reqByCdpId.get(requestId);
        if (key && /onrender\.com/.test(response.url)) {
          requests.push(`<- ${response.status} ${response.url}`);
        }
      }
      if (e.method === 'Network.loadingFailed') {
        const { requestId, errorText, corsErrorStatus } = e.params;
        const key = reqByCdpId.get(requestId) ?? '(unknown)';
        if (key.includes('onrender') || corsErrorStatus) {
          failed.push(`${key} :: ${errorText}${corsErrorStatus ? ` [CORS ${corsErrorStatus.corsError}]` : ''}`);
        }
      }
    }
  };

  const evalJs = async (expression, awaitPromise = false) => {
    const res = await S('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    return res?.result?.value;
  };

  const waitFor = async (expr, tries = 60, step = 400) => {
    for (let i = 0; i < tries; i++) {
      if (await evalJs(expr)) return true;
      await sleep(step);
    }
    return false;
  };

  console.log(`=== probing ${BASE} ===`);
  await S('Page.navigate', { url: `${BASE}/login` });

  const formAppeared = await waitFor(`!!document.querySelector('#identityInput')`, 75);
  const origin = await evalJs('location.origin');
  console.log(`origin        : ${origin}`);
  console.log(`form appeared : ${formAppeared}`);
  if (!formAppeared) {
    drain();
    console.log('\nRESULT: login form never rendered');
    console.log('--- console ---');
    consoleLines.slice(0, 20).forEach((l) => console.log('  ' + l));
    socket.close();
    process.exit(0);
  }

  // ── Layer 2: raw fetch from the page (isolates CORS / network) ──────
  const rawFetch = await evalJs(
    `(async () => {
      try {
        const r = await fetch('https://daway-backend-zlh2.onrender.com/api/login/pharmacy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ pharmacy_id: ${JSON.stringify(IDENTITY)}, password: ${JSON.stringify(PASSWORD)} }),
        });
        const t = await r.text();
        return JSON.stringify({ ok: true, status: r.status, body: t.slice(0, 200) });
      } catch (e) {
        return JSON.stringify({ ok: false, error: String(e) });
      }
    })()`,
    true,
  );
  console.log(`raw fetch     : ${rawFetch}`);

  // ── Layer 3: drive the real form ────────────────────────────────────
  const filled = await evalJs(`(() => {
    const set = (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set(document.querySelector('#identityInput'), ${JSON.stringify(IDENTITY)});
    set(document.querySelector('#passwordInput'), ${JSON.stringify(PASSWORD)});
    return JSON.stringify({
      identity: document.querySelector('#identityInput')?.value,
      passwordLen: (document.querySelector('#passwordInput')?.value || '').length,
      btnDisabled: document.querySelector('#submitBtn')?.disabled ?? null,
    });
  })()`);
  console.log(`filled        : ${filled}`);
  await sleep(300);

  const beforePath = await evalJs('location.pathname');
  await evalJs(`document.querySelector('#submitBtn')?.click(); true`);
  await sleep(1200);

  let afterPath = beforePath;
  for (let i = 0; i < 100; i++) {
    afterPath = await evalJs('location.pathname');
    if (afterPath !== beforePath) break;
    await sleep(500);
  }

  // Let the post-login screen settle so its own API calls are captured too —
  // "I log in and nothing happens" is often a dashboard that failed to load.
  if (afterPath !== beforePath) await sleep(20000);

  drain();
  const pageState = await evalJs(`JSON.stringify({
    path: location.pathname,
    h1: (document.querySelector('h1')?.innerText || '').trim().slice(0, 60),
    hasSidebar: !!document.querySelector('aside, .sidebar, nav'),
    visibleError: (document.querySelector('.error-state, .error-message, [role="alert"]')?.innerText || '').trim().slice(0, 120),
    bodyHead: (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 120),
  })`);
  console.log(`page state    : ${pageState}`);
  const errText = await evalJs(
    `(document.querySelector('.error-message')?.innerText || '').trim().slice(0, 200)`,
  );
  const token = await evalJs(`window.localStorage.getItem('daway.token') ? 'present' : 'absent'`);

  console.log(`path before   : ${beforePath}`);
  console.log(`path after    : ${afterPath}`);
  console.log(`token         : ${token}`);
  if (errText) console.log(`form error    : ${errText}`);

  console.log('\n--- requests to the API ---');
  if (requests.length === 0) console.log('  (none)');
  [...new Set(requests)].slice(0, 20).forEach((l) => console.log('  ' + l));

  console.log('\n--- failed requests ---');
  if (failed.length === 0) console.log('  (none)');
  [...new Set(failed)].slice(0, 15).forEach((l) => console.log('  ' + l));

  console.log('\n--- console (first 25) ---');
  if (consoleLines.length === 0) console.log('  (nothing)');
  consoleLines.slice(0, 25).forEach((l) => console.log('  ' + l));

  const ok = afterPath !== beforePath && afterPath !== '/login';
  console.log(`\nRESULT: ${ok ? 'LOGIN SUCCEEDED' : 'LOGIN FAILED'}`);
  socket.close();
} finally {
  cleanup();
}

process.exit(0);
