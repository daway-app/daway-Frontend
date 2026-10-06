/**
 * Interaction probe: does the medicines search actually FILTER?
 *
 * Written to verify a specific fix. `MedicinesPage` used to send `?q=` to
 * `/api/pharmacy/inventory`, which ignores that parameter — so the search box
 * looked functional but every row always came back. The fix filters the loaded
 * rows client-side, and this proves it by counting rows before and after
 * typing a term that exists in the seeded data.
 *
 * Usage: node tools/interact-search.mjs [baseUrl] [term]
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
const BASE = (process.argv[2] || 'http://127.0.0.1:5173').replace(/\/+$/, '');
const TERM = process.argv[3] || 'panadol';

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-interact-'));
const port = 9100 + Math.floor(Math.random() * 300);

const chrome = spawn(CHROME, [
  '--headless=new',
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
socket.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
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
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

// ── login (poll for the form) ────────────────────────────────────────
// Generous cap: the app shows a session-check loader first, and on a slow
// backend that can take far longer than a fixed sleep would allow.
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);
let ready = false;
for (let i = 0; i < 180; i++) {
  await sleep(500);
  ready = await evaluate(`!!document.querySelector('#loginForm')`);
  if (ready) break;
}
if (!ready) { console.error('✗ login form never rendered'); process.exit(1); }

await evaluate(`(() => {
  const setVal = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  setVal(document.querySelector('#identityInput'), 'PH-1234');
  setVal(document.querySelector('#passwordInput'), 'password');
  return true;
})()`);
await sleep(300);
await evaluate(`document.querySelector('#submitBtn').click(); true`);
for (let i = 0; i < 30; i++) {
  await sleep(900);
  const p = await evaluate('location.pathname');
  if (p && !p.startsWith('/login')) break;
}
console.log('✓ logged in');

// ── /medicines ───────────────────────────────────────────────────────
await send('Page.navigate', { url: `${BASE}/medicines` }, sessionId);
await sleep(700);
await send('Page.reload', {}, sessionId);

// Wait for the table to leave the skeleton.
for (let i = 0; i < 90; i++) {
  await sleep(500);
  const done = await evaluate(
    `document.querySelectorAll('.ph-skel-row').length === 0 &&
     document.querySelectorAll('tbody tr').length > 0`,
  );
  if (done) break;
}

/**
 * Count DATA rows only.
 *
 * A "no results" state renders as a single `<tr>` containing `.ph-empty`, so a
 * naive `tbody tr` count reports 1 even when nothing matched — which made an
 * earlier run look like a pass when the term simply did not exist.
 */
const countRows = () =>
  evaluate(
    `[...document.querySelectorAll('tbody tr')].filter(r => !r.querySelector('.ph-empty')).length`,
  );
const isEmptyState = () =>
  evaluate(`document.querySelectorAll('tbody tr .ph-empty').length > 0`);
const names = () =>
  evaluate(
    `[...document.querySelectorAll('tbody tr')].filter(r => !r.querySelector('.ph-empty')).map(r => (r.querySelector('strong')?.textContent||'').trim()).slice(0,20)`,
  );

const before = await countRows();
const beforeNames = await names();
console.log(`\nقبل البحث: ${before} صف`);
console.log(`  ${beforeNames.slice(0, 4).join(' | ')}`);

// Type into the search box and submit with Enter.
const typed = await evaluate(`(() => {
  const input = document.querySelector('.ph-search input[type="search"], .ph-search input');
  if (!input) return false;
  const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
  s.call(input, ${JSON.stringify(TERM)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  const form = input.closest('form');
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return true;
})()`);
console.log(`\nكتبت "${TERM}" → ${typed ? 'تم' : 'فشل إيجاد الحقل'}`);
await sleep(1200);

const after = await countRows();
const afterNames = await names();
console.log(`بعد البحث: ${after} صف`);
console.log(`  ${afterNames.slice(0, 6).join(' | ')}`);

const filtered = after < before;
const allMatch =
  after === 0 || afterNames.every((n) => n.toLowerCase().includes(TERM.toLowerCase()));
const empty = await isEmptyState();
console.log('');
console.log(filtered ? `✅ البحث يفلتر (${before} → ${after} صف مطابق)` : `❌ البحث ما بيفلتر (${before} → ${after})`);
if (after > 0) {
  console.log(allMatch ? '✅ كل النتائج تطابق البحث' : '⚠️ في نتائج ما تطابق البحث');
} else if (empty) {
  console.log('ℹ️ صفر مطابق ⇒ ظهرت حالة «لا نتائج»');
}
console.log(empty ? '   (حالة «لا نتائج» ظاهرة)' : '   (لا حالة فراغ)');

socket.close();
process.exit(filtered ? 0 : 1);
