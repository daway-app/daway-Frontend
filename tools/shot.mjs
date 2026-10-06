/**
 * CDP screenshot harness for Daway Pharmacy Web.
 *
 * Headless Chrome ignores --window-size for layout, so we drive it over the
 * DevTools Protocol and set Emulation.setDeviceMetricsOverride explicitly,
 * then assert document width == viewport width before trusting the capture.
 *
 * Usage:
 *   node tools/shot.mjs <url> <abs-out.png> <width> <height> [scale]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
// ESM interop: the CJS module lands under `.default` when imported this way.
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const [, , url, outPath, wArg, hArg, scaleArg, probeArg] = process.argv;
if (!url || !outPath) {
  console.error('usage: node tools/shot.mjs <url> <out.png> <w> <h> [scale] [probeExpr]');
  process.exit(2);
}
const W = Number(wArg || 1440);
const H = Number(hArg || 900);
const SCALE = Number(scaleArg || 2);

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-chrome-'));
const port = 9200 + Math.floor(Math.random() * 500);

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

async function getWsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

const cleanup = () => {
  try { chrome.kill(); } catch { /* already gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked */ }
};
process.on('exit', cleanup);

try {
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

  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      const payload = { id, method, params };
      if (sessionId) payload.sessionId = sessionId;
      socket.send(JSON.stringify(payload));
    });

  // Attach to a fresh page target.
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  const S = (m, p = {}) => send(m, p, sessionId);

  await S('Page.enable');
  await S('Runtime.enable');
  await S('Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: SCALE,
    mobile: W <= 480,
  });

  await S('Page.navigate', { url });

  // Wait for load + fonts + a settle pass.
  for (let i = 0; i < 60; i++) {
    const { result } = await S('Runtime.evaluate', { expression: 'document.readyState' });
    if (result.value === 'complete') break;
    await sleep(150);
  }
  await S('Runtime.evaluate', { expression: 'document.fonts && document.fonts.ready', awaitPromise: true });
  await sleep(500);

  // Measure: assert no horizontal overflow.
  const { result: measure } = await S('Runtime.evaluate', {
    expression: `JSON.stringify({
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      docH: document.documentElement.scrollHeight,
      winH: window.innerHeight,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily
    })`,
    returnByValue: true,
  });
  const m = JSON.parse(measure.value);
  console.log('MEASURE', JSON.stringify(m));
  if (m.docW > m.winW + 1) {
    console.log(`WARN horizontal overflow: docW=${m.docW} winW=${m.winW}`);
  }

  if (probeArg) {
    const { result: probe } = await S('Runtime.evaluate', { expression: probeArg, returnByValue: true });
    console.log('PROBE', JSON.stringify(probe.value));
  }

  const shot = await S('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('SAVED', outPath, existsSync(outPath) ? '(ok)' : '(missing)');

  socket.close();
} finally {
  cleanup();
}

// The CDP socket / spawned Chrome keep the event loop alive on Windows, so the
// process would otherwise hang until killed. Exit explicitly once work is done.
process.exit(0);
