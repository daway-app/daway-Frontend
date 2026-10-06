import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WS = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const [url, widthArg, expr] = process.argv.slice(2);
const width = Number(widthArg) || 390;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const userDataDir = mkdtempSync(join(tmpdir(), 'daway-measure-'));
const port = 9700 + Math.floor(Math.random() * 200);

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${userDataDir}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const j = await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json());
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error('no devtools');
}
const cleanup = () => {
  try { chrome.kill(); } catch { /* gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked */ }
};
process.on('exit', cleanup);

const wsUrl = await getWsUrl();
const ws = new WS(wsUrl, { perMessageDeflate: false });
let id = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  return new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    const payload = { id: mid, method, params };
    if (sessionId) payload.sessionId = sessionId;
    ws.send(JSON.stringify(payload));
  });
}
ws.on('message', (buf) => {
  const msg = JSON.parse(buf.toString());
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
});
await new Promise((r) => ws.on('open', r));

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p = {}) => send(m, p, sessionId);

await S('Page.enable');
await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', {
  width,
  height: 900,
  deviceScaleFactor: 1,
  mobile: width <= 480,
});
await S('Page.navigate', { url });
for (let i = 0; i < 60; i++) {
  const { result } = await S('Runtime.evaluate', { expression: 'document.readyState' });
  if (result.value === 'complete') break;
  await sleep(150);
}
await S('Runtime.evaluate', { expression: 'document.fonts && document.fonts.ready', awaitPromise: true });
await sleep(800);
const out = await S('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(JSON.stringify(out.result?.value, null, 1));
ws.close();

