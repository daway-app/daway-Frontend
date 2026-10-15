/**
 * Measure rendered element boxes on a live page.
 *
 * Why this exists: "the button is wider/narrower than the field" is a claim
 * about LAYOUT, and layout cannot be read out of the CSS source — it depends on
 * flex/grid min-sizing, font metrics and the container. The only honest answer
 * is getBoundingClientRect() in a real browser.
 *
 * It waits for the page to stop navigating first. The app's service worker calls
 * skipWaiting()+clients.claim() on a fresh profile and src/pwa.ts reloads on
 * `controllerchange`, which kills any in-flight Runtime.evaluate — measuring too
 * early returns nothing and looks like a failure.
 *
 * Usage:
 *   node tools/measure-elements.mjs <url> <selector> [selector...]
 *   node tools/measure-elements.mjs <url> --box
 *
 * Prints, per selector: width, height, display, and the computed font-size.
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

const [, , url, ...selectors] = process.argv;
if (!url || selectors.length === 0) {
  console.error('usage: node tools/measure-elements.mjs <url> <selector> [selector...]');
  process.exit(2);
}

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-measure-'));
const port = 9800 + Math.floor(Math.random() * 150);

const chrome = spawn(CHROME, [
  '--no-proxy-server',
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
const cleanup = () => {
  try { chrome.kill(); } catch { /* gone */ }
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* locked */ }
};
process.on('exit', cleanup);

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
  let navCount = 0;

  socket.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) {
        if (msg.error.code === -32000) resolve(undefined); // reload in flight
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
  await S('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const drainNavs = () => {
    for (const e of events.splice(0)) {
      if (e.method === 'Page.frameNavigated' && !e.params.frame.parentId) navCount++;
    }
  };

  const evalJs = async (expression) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await S('Runtime.evaluate', { expression, returnByValue: true });
      if (res !== undefined) return res?.result?.value;
      await sleep(600);
    }
    return undefined;
  };

  await S('Page.navigate', { url });

  for (let i = 0; i < 60; i++) {
    if ((await evalJs('document.readyState')) === 'complete') break;
    await sleep(250);
  }
  await evalJs('document.fonts && document.fonts.ready');

  // Wait until navigations stop (the one-time service-worker reload).
  const start = Date.now();
  let last = -1;
  let quietSince = Date.now();
  while (Date.now() - start < 30_000) {
    drainNavs();
    if (navCount !== last) { last = navCount; quietSince = Date.now(); }
    if (Date.now() - quietSince > 3500) break;
    await sleep(300);
  }

  const payload = JSON.stringify(selectors);
  const out = await evalJs(`(() => {
    const sels = ${payload};
    const rows = sels.map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return { selector: sel, found: false };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        selector: sel,
        found: true,
        width: Math.round(r.width),
        height: Math.round(r.height),
        left: Math.round(r.left),
        display: cs.display,
        boxSizing: cs.boxSizing,
        minWidth: cs.minWidth,
        fontSize: cs.fontSize,
        text: (el.innerText || el.value || '').trim().slice(0, 28),
      };
    });
    return JSON.stringify({
      navs: ${navCount},
      winW: window.innerWidth,
      docW: document.documentElement.scrollWidth,
      rows,
    });
  })()`);

  const data = JSON.parse(out);
  console.log(`url      : ${url}`);
  console.log(`reloads  : ${data.navs}`);
  console.log(`viewport : ${data.winW}   document.scrollWidth: ${data.docW}${data.docW > data.winW + 1 ? '  <-- HORIZONTAL OVERFLOW' : ''}`);
  console.log('');
  const w = Math.max(...data.rows.map((r) => (r.selector || '').length), 10);
  for (const r of data.rows) {
    if (!r.found) { console.log(`${r.selector.padEnd(w)}  NOT FOUND`); continue; }
    console.log(
      `${r.selector.padEnd(w)}  w=${String(r.width).padStart(5)}  h=${String(r.height).padStart(4)}` +
      `  left=${String(r.left).padStart(4)}  ${r.display.padEnd(11)} min-w=${String(r.minWidth).padStart(5)}  "${r.text}"`,
    );
  }

  socket.close();
} finally {
  cleanup();
}

process.exit(0);
