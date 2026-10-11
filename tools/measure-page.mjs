/**
 * Measure the Blade categories harness in headless Chrome.
 *
 * Uses the CDP raw-WebSocket approach proven earlier in this project — no
 * Puppeteer, which is not a dependency here.
 *
 * Reads the same selector set from a URL, so the identical geometry can be
 * pulled from the React app by pointing it at the dev server.
 *
 * Usage:
 *   node tools/measure-page.mjs <file-or-url> [--dark]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const target = process.argv[2];
const dark = process.argv.includes('--dark');
if (!target) {
  console.error('usage: node tools/measure-page.mjs <file-or-url> [--dark]');
  process.exit(1);
}

const url = target.startsWith('http') ? target : `file:///${target.replace(/\\/g, '/')}`;

/* A headless Chrome profile MUST live on a native Windows path — an MSYS
   `/tmp` path is not understood by the Windows binary. */
const profile = mkdtempSync(join(process.env.TEMP ?? tmpdir(), 'cdp-cat-'));

const port = 9222 + Math.floor(Math.random() * 200);
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  /* 🔴 REQUIRED for a file:// harness: without this Chrome refuses to load
     `file://` stylesheets from a `file://` document, so the page renders with
     browser-default fonts and every measurement is a lie that still looks
     plausible. This is the harness equivalent of the "suspect the measurement"
     rule — an unstyled page is not an obviously broken page. */
  '--allow-file-access-from-files',
  '--window-size=1440,1200',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('chrome did not expose a debugger');
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const myId = ++id;
      pending.set(myId, { resolve, reject });
      ws.send(JSON.stringify({ id: myId, method, params, sessionId }));
    });
}

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (s) => {
    const el = q(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: +r.width.toFixed(1),
      h: +r.height.toFixed(1),
      font: cs.fontSize,
      lh: cs.lineHeight,
      radius: cs.borderRadius,
      pad: cs.padding,
      bg: cs.backgroundImage !== 'none' ? 'gradient' : cs.backgroundColor,
      color: cs.color,
    };
  };
  const shell = q('.admin-page') || q('.animated-page');
  const sr = shell ? shell.getBoundingClientRect() : null;
  return {
    contentWidth: sr ? +sr.width.toFixed(1) : null,
    h1: box('.header-title-section h1'),
    subtitle: box('.header-title-section p'),
    breadcrumb: box('.breadcrumb-trail'),
    statsGrid: box('.stats-grid'),
    statsCols: (() => {
      const g = q('.stats-grid');
      return g ? getComputedStyle(g).gridTemplateColumns : null;
    })(),
    statCard: box('.stat-card'),
    statTitle: box('.stat-title'),
    statValue: box('.stat-value'),
    statValueDanger: box('.stat-value.danger'),
    dangerBg: (() => { const e = q('.stat-card-danger'); return e ? getComputedStyle(e).backgroundColor : null; })(),
    filterCard: box('.filter-card'),
    filterInput: box('.filter-input'),
    mainCard: box('.main-card'),
    cardTopBar: box('.card-top-bar'),
    table: box('.custom-table'),
    th: box('.custom-table th'),
    td: box('.custom-table td'),
    iconWrap: box('.pill-icon-wrapper'),
    statusPill: box('.status-badge'),
    countLink: box('.cell-count'),
    actionBtn: box('.action-btn'),
    actionGroup: box('.action-btn-group'),
    actionBtns: document.querySelectorAll('.action-btn').length,
    statCards: document.querySelectorAll('.stat-card').length,
    rows: document.querySelectorAll('.custom-table tbody tr').length,
    chips: document.querySelectorAll('.cat-chip').length,
    dark: document.body.classList.contains('dark-mode')
      || document.documentElement.dataset.theme === 'dark',
  };
})()`;

(async () => {
  const wsUrl = await connect();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const send = makeClient(ws);

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);

  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);

  if (dark) {
    await send('Runtime.evaluate', {
      expression: `document.body.classList.add('dark-mode');
                   document.documentElement.classList.add('dark-mode');
                   document.documentElement.dataset.theme='dark';`,
    }, sessionId);
    await sleep(400);
  }

  const res = await send('Runtime.evaluate',
    { expression: MEASURE, returnByValue: true, awaitPromise: false }, sessionId);

  console.log(JSON.stringify(res.result.value, null, 2));

  await send('Target.closeTarget', { targetId });
  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((err) => {
  console.error('MEASURE FAILED:', err.message);
  chrome.kill();
  process.exit(1);
});
