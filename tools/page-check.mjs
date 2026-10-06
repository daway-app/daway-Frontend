/**
 * Load a URL in headless Chrome and report what actually happened.
 *
 * Written because `screens.mjs` aborted with "login form never rendered" — a
 * symptom, not a cause. This dumps the console, uncaught exceptions, failed
 * requests and the DOM, so the real error is visible.
 *
 * Usage: node tools/page-check.mjs [url] [selector]
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
const url = process.argv[2] || 'http://127.0.0.1:5173/login';
const selector = process.argv[3] || '#loginForm';

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-pagecheck-'));
const port = 9500 + Math.floor(Math.random() * 300);

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
const logs = [];
const exceptions = [];
const failed = [];
const statuses = [];

socket.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`${msg.params.type}: ${String(text).slice(0, 300)}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    exceptions.push(String(d.exception?.description || d.text).slice(0, 600));
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') logs.push(`log-error: ${String(e.text).slice(0, 300)}`);
  }
  if (msg.method === 'Network.responseReceived') {
    const r = msg.params.response;
    if (r.url.includes('5173') || r.url.includes('/src/')) {
      statuses.push(`${r.status} ${r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 100)}`);
    }
    if (r.status >= 400) failed.push(`${r.status} ${r.url.slice(0, 160)}`);
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
await send('Log.enable', {}, sessionId);

const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

console.log(`→ ${url}`);
await send('Page.navigate', { url }, sessionId);
await sleep(6000);

const dom = await evaluate(`(() => {
  const root = document.querySelector('#root');
  return {
    title: document.title,
    rootExists: !!root,
    rootChildren: root ? root.children.length : -1,
    rootHtmlLen: root ? root.innerHTML.length : -1,
    rootHtmlHead: root ? root.innerHTML.slice(0, 400) : '',
    hasSelector: !!document.querySelector(${JSON.stringify(selector)}),
    bodyTextHead: (document.body.innerText || '').slice(0, 300),
    scripts: [...document.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).slice(0, 6),
  };
})()`);

console.log('\n--- DOM ---');
console.log('title:        ', dom.title);
console.log('#root exists: ', dom.rootExists, ' children:', dom.rootChildren, ' htmlLen:', dom.rootHtmlLen);
console.log('selector', selector, '→', dom.hasSelector);
console.log('scripts:', dom.scripts.join(', '));
console.log('\nroot.innerHTML (first 400):');
console.log(dom.rootHtmlHead || '(empty)');
console.log('\nbody innerText (first 300):');
console.log(dom.bodyTextHead || '(empty)');

console.log('\n--- module responses (last 12) ---');
for (const s of statuses.slice(-12)) console.log('  ' + s);

console.log('\n--- failed requests ---');
if (failed.length === 0) console.log('  (none)');
for (const f of [...new Set(failed)].slice(0, 15)) console.log('  ' + f);

console.log('\n--- uncaught exceptions ---');
if (exceptions.length === 0) console.log('  (none)');
for (const e of [...new Set(exceptions)].slice(0, 6)) console.log('  ' + e);

console.log('\n--- console (errors/warnings, last 15) ---');
const interesting = [...new Set(logs)].filter((l) => /error|warn/i.test(l));
if (interesting.length === 0) console.log('  (none)');
for (const l of interesting.slice(0, 15)) console.log('  ' + l);

socket.close();
process.exit(0);
