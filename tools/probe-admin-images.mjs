/**
 * Verify the React admin CATEGORIES + MEDICINES pages render real images,
 * against the LOCAL Laravel backend, in headless Chrome.
 *
 * WHY A REAL BACKEND INSTEAD OF A STUB
 * ------------------------------------
 * The earlier probes stubbed `/api/admin/*` because the DB was remote (5-36s a
 * call). This run has a LOCAL backend on 127.0.0.1:8000 with real Cloudinary
 * images already stored, so no stub is needed: the page is exercised exactly as
 * a user would see it. That is a strictly stronger check than a canned payload.
 *
 * WHAT IT PROVES
 *   · the `image` field survives the API round-trip into the component;
 *   · a real <img> with a real src (Cloudinary, transformed) is in the DOM;
 *   · the unset-image fallback (tile / pills icon) is used where image is null.
 *
 * Seeds `localStorage['daway.admin.token']` — `isAuthenticated()` is
 * `token !== null` and does NOT verify with the server (auth/session.ts).
 *
 * Usage:
 *   node tools/probe-admin-images.mjs
 *   node tools/probe-admin-images.mjs --dark
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const API = process.env.PROBE_API ?? 'http://127.0.0.1:8000';
const dark = process.argv.includes('--dark');

const token = readFileSync(new URL('./__token.txt', import.meta.url), 'utf8').trim();
if (!token) throw new Error('tools/__token.txt is empty — mint an admin token first.');

const profile = mkdtempSync(join(process.env.TEMP ?? tmpdir(), 'cdp-adminimg-'));
const port = 9500 + Math.floor(Math.random() * 300);

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1600,1300',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      // `/json/list` gives TARGETS (pages); `/json/version` gives the BROWSER
      // endpoint, which does not expose the `Page` domain. Connecting to the
      // browser endpoint fails with "'Page.enable' wasn't found".
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error('CDP page target never came up');
}

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const socket = new WebSocketImpl(await wsUrl(), { perMessageDeflate: false });
await new Promise((res, rej) => { socket.once('open', res); socket.once('error', rej); });

let id = 1;
const pending = new Map();
socket.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = id++;
    pending.set(mid, { resolve, reject });
    socket.send(JSON.stringify({ id: mid, method, params }));
  });

const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 120));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1600, height: 1300, deviceScaleFactor: 1, mobile: false,
});

/* Seed the admin token BEFORE the app boots, so RequireAdmin lets the page in.
   The token also goes to the real API (VITE_API_BASE_URL → 127.0.0.1:8000). */
await send('Page.navigate', { url: `${BASE}/` });
await sleep(1500);
await evaluate(`localStorage.setItem('daway.admin.token', ${JSON.stringify(token)}); true;`);

if (dark) {
  await evaluate(`document.documentElement.setAttribute('data-theme','dark'); true;`);
}

const shot = async (name) => {
  mkdirSync(new URL('../.probe-out', import.meta.url), { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const { writeFileSync } = await import('node:fs');
  const out = new URL(`../.probe-out/${name}.png`, import.meta.url).pathname.replace(/^\//, '');
  writeFileSync(out, Buffer.from(data, 'base64'));
  return out;
};

/** Wait until a predicate is true, polling the page.
 *
 *  The DB behind the LOCAL `php artisan serve` is REMOTE, and a cold
 *  `/api/admin/categories` call has been measured at ~23s. `php artisan serve`
 *  is also single-threaded, so two overlapping calls queue. Hence a generous
 *  ceiling: waiting on a CONDITION, never a fixed sleep. */
const waitFor = async (expr, label, ms = 150000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evaluate(expr)) return true;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${label}`);
};

const report = {};

/* ── Categories ─────────────────────────────────────────────────────────── */
await send('Page.navigate', { url: `${BASE}/admin/categories` });
await waitFor(
  `location.pathname === '/admin/categories' && !!document.querySelector('.admin-page .custom-table')`,
  'categories table',
);
/* Let the Cloudinary thumbnails finish loading, so `naturalWidth` is real. */
await waitFor(
  `(() => { const i = [...document.querySelectorAll('.admin-page .cat-cell__img')];
            return i.length > 0 && i.every(x => x.complete); })()`,
  'category images loaded',
  60000,
);

report.categories = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('.admin-page .cat-cell__img')];
  const tiles = [...document.querySelectorAll('.admin-page .ac-thumb .pill-icon-wrapper')];
  const rows = document.querySelectorAll('.admin-page .custom-table tbody tr').length;
  const first = imgs[0];
  const table = document.querySelector('.admin-page .custom-table');
  const th = table ? table.querySelector('thead th') : null;
  return {
    rows,
    imageCount: imgs.length,
    tileFallbackCount: tiles.length,
    firstSrc: first ? first.getAttribute('src') : null,
    firstNatural: first ? (first.naturalWidth + 'x' + first.naturalHeight) : null,
    firstCss: first ? (() => {
      const s = getComputedStyle(first);
      return { w: s.width, h: s.height, radius: s.borderRadius, fit: s.objectFit };
    })() : null,
    brokenImgs: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
    tableBorderCollapse: table ? getComputedStyle(table).borderCollapse : null,
    thPadding: th ? getComputedStyle(th).padding : null,
    thBg: th ? getComputedStyle(th).backgroundColor : null,
    hasCheckboxes: document.querySelectorAll('.admin-page .custom-table input[type=checkbox]').length,
  };
})()`);
report.categoriesShot = await shot(dark ? 'categories-dark' : 'categories');

/* ── Medicines ──────────────────────────────────────────────────────────── */
await send('Page.navigate', { url: `${BASE}/admin/medicines` });
await waitFor(
  `location.pathname === '/admin/medicines' && !!document.querySelector('table .ac-thumb .ph-med-thumb')`,
  'medicines table',
);
/* Let the Cloudinary thumbnails finish so `naturalWidth` is meaningful. */
await waitFor(
  `(() => { const i = [...document.querySelectorAll('table img')];
            return i.length > 0 && i.every(x => x.complete); })()`,
  'medicine images loaded',
  60000,
);

report.medicines = await evaluate(`(() => {
  const imgs = [...document.querySelectorAll('img')].filter(i => i.closest('table'));
  const thumbCells = [...document.querySelectorAll('table td.ac-thumb')];
  const pills = [...document.querySelectorAll('table .ph-med-thumb i.fa-pills')];
  const first = imgs[0];
  const cols = document.querySelectorAll('table thead th').length;
  return {
    columns: cols,
    thumbCells: thumbCells.length,
    tableImageCount: imgs.length,
    pillsIconFallback: pills.length,
    firstSrc: first ? first.getAttribute('src') : null,
    firstNatural: first ? (first.naturalWidth + 'x' + first.naturalHeight) : null,
    brokenImgs: imgs.filter(i => i.complete && i.naturalWidth === 0).length,
  };
})()`);
report.medicinesShot = await shot(dark ? 'medicines-dark' : 'medicines');

console.log(JSON.stringify(report, null, 2));
socket.close();
chrome.kill();
process.exit(0);
