/**
 * End-to-end login smoke test for Daway Pharmacy Web.
 *
 * Drives the REAL login form against the REAL local Laravel API:
 *   fill PH-1234 / password → submit → wait → assert we left /login.
 *
 * Usage: node tools/login-smoke.mjs <baseUrl>
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
const BASE = process.argv[2] || 'http://localhost:5173';
const PHARMACY_ID = process.argv[3] || 'PH-1234';
const PASSWORD = process.argv[4] || 'password';

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-smoke-'));
const port = 9600 + Math.floor(Math.random() * 300);

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
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

const wsUrl = await getWsUrl();
const socket = new WebSocketImpl(wsUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  socket.once('open', res);
  socket.once('error', rej);
});

let nextId = 1;
const pending = new Map();
socket.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
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
if (!targetId) {
  const created = await send('Target.createTarget', { url: 'about:blank' });
  targetId = created.targetId;
}
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

async function evaluate(expression) {
  const r = await send('Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  }
  return r.result.value;
}

console.log(`→ opening ${BASE}/login`);
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);
await sleep(4000);

// 1. Confirm the login form is present.
const formReady = await evaluate(
  `!!document.querySelector('#loginForm') && !!document.querySelector('#identityInput')`
);
console.log(`  form present: ${formReady}`);
if (!formReady) {
  console.error('✗ login form never rendered');
  process.exit(1);
}

// 2. Fill the fields through the native setter so React's onChange fires.
await evaluate(`(() => {
  const setVal = (el, val) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('#identityInput'), ${JSON.stringify(PHARMACY_ID)});
  setVal(document.querySelector('#passwordInput'), ${JSON.stringify(PASSWORD)});
  return true;
})()`);
await sleep(600);

const filled = await evaluate(
  `document.querySelector('#identityInput').value + ' / ' + document.querySelector('#passwordInput').value.length`
);
console.log(`  filled: ${filled}`);

// 3. Submit.
await evaluate(`document.querySelector('#submitBtn').click(); true`);
console.log('  submitted, waiting for navigation…');

// 4. Poll until the URL leaves /login (or we time out).
let finalUrl = '';
let ok = false;
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  finalUrl = await evaluate('location.pathname + location.search');
  if (finalUrl && !finalUrl.startsWith('/login')) { ok = true; break; }
}

const errText = await evaluate(
  `(document.querySelector('.error-message')?.textContent || '').trim()`
);

console.log(`  final path: ${finalUrl}`);
if (errText) console.log(`  error shown: ${errText}`);

if (ok) {
  console.log('✅ LOGIN OK — left /login');
} else {
  console.log('❌ LOGIN FAILED — still on /login');
}

// Capture a screenshot of whatever we ended on.
try {
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  const { writeFileSync } = await import('node:fs');
  writeFileSync('C:/Users/MSI/daway-web/qa/login-smoke-result.png',
    Buffer.from(shot.data, 'base64'));
  console.log('  screenshot: qa/login-smoke-result.png');
} catch (e) {
  console.log(`  screenshot failed: ${e.message}`);
}

socket.close();
process.exit(ok ? 0 : 1);
