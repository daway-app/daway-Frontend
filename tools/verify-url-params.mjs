/**
 * Verifies the Phase 3 URL-state contract in a real browser, after a real login.
 *
 * What it proves (each is a PASS/FAIL line):
 *   1. A DEEP LINK with filters renders and is reflected in the UI — the state
 *      is read from the URL, not from component state.
 *   2. Changing a filter WRITES the URL.
 *   3. A filter whose value equals its default is OMITTED from the URL
 *      (the canonical view has a clean query string).
 *   4. Filter changes use `replace` — they do NOT grow the history stack.
 *   5. A reload with params in the URL keeps them.
 *
 * Usage: node tools/verify-url-params.mjs [baseUrl]
 * Requires: the dev server AND the local Laravel API both running.
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
const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/+$/, '');

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-urlparams-'));
const port = 9400 + Math.floor(Math.random() * 300);

const chrome = spawn(CHROME, [
  '--headless=new',
  // Chrome otherwise honours the SYSTEM proxy, which routes 127.0.0.1 through
  // the sandbox proxy and refuses the connection.
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
await send(
  'Emulation.setDeviceMetricsOverride',
  { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
  sessionId,
);

const evaluate = async (expression) => {
  const r = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  return r.result.value;
};

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const goto = async (url) => {
  await send('Page.navigate', { url }, sessionId);
  await sleep(900);
};

const waitFor = async (expr, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    await sleep(400);
    if (await evaluate(expr)) return true;
  }
  return false;
};

/**
 * Wait for the list screen to leave its skeleton.
 *
 * The filters block (tabs + search) renders INSIDE `AsyncBoundary`, so it does
 * not exist until the request resolves. The local API reads a REMOTE MySQL
 * (measured 17–62s per call), so this needs a generous cap — an earlier run
 * probed during loading, found no tabs, and reported a vacuous pass.
 */
const READY = `document.querySelectorAll('.ph-tab').length > 0 &&
               document.querySelectorAll('.ph-skel-row').length === 0`;
const waitForList = () => waitFor(READY, 220); // ~88s

const activeTabIndex = () =>
  evaluate(`[...document.querySelectorAll('.ph-tab')].findIndex(b => b.classList.contains('active'))`);

// ── login ────────────────────────────────────────────────────────────
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);
const loginReady = await waitFor(`!!document.querySelector('#loginForm')`, 180);
if (!loginReady) { console.error('✗ login form never rendered'); process.exit(1); }

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
let loggedIn = false;
for (let i = 0; i < 40; i++) {
  await sleep(900);
  const p = await evaluate('location.pathname');
  if (p && !p.startsWith('/login')) { loggedIn = true; break; }
}
if (!loggedIn) { console.error('✗ login failed (is the local API running on :8000?)'); process.exit(1); }
console.log('✓ logged in\n');

// ── 1. deep link is read from the URL ────────────────────────────────
await goto(`${BASE}/medicines?tab=low&q=panadol`);
const listReady = await waitForList();
check('medicines list left its skeleton', listReady);
const deep = await evaluate(`JSON.stringify({
  search: location.search,
  inputValue: document.querySelector('.ph-search input')?.value ?? null,
  activeTab: document.querySelector('.ph-tab.active')?.textContent?.trim() ?? null,
})`);
const d = JSON.parse(deep);
check('deep link keeps its params', d.search.includes('tab=low') && d.search.includes('q=panadol'), d.search);
check('deep link fills the search input from the URL', d.inputValue === 'panadol', `input=${JSON.stringify(d.inputValue)}`);
check('deep link selects the matching tab', (await activeTabIndex()) === 2, `activeIndex=${await activeTabIndex()}`);

// ── 2. clicking a tab writes the URL ─────────────────────────────────
await evaluate(`document.querySelectorAll('.ph-tab')[3]?.click(); true`); // "ok"
await sleep(700);
const afterTab = await evaluate('location.search');
const afterTabIndex = await activeTabIndex();
check('tab click writes ?tab=ok', afterTab.includes('tab=ok'), afterTab);
check('tab click moves the active state', afterTabIndex === 3, `activeIndex=${afterTabIndex}`);

// ── 3. a default value is omitted ────────────────────────────────────
const historyBefore = await evaluate('history.length');
await evaluate(`document.querySelectorAll('.ph-tab')[0]?.click(); true`); // "all" = default
await sleep(700);
const afterDefault = await evaluate('location.search');
const defaultIndex = await activeTabIndex();
check('default tab is omitted from the URL', !afterDefault.includes('tab='), afterDefault || '(empty)');
check('default tab is still the active tab', defaultIndex === 0, `activeIndex=${defaultIndex}`);

// ── 4. filter writes use replace (history does not grow) ─────────────
const historyAfter = await evaluate('history.length');
check('filter changes do not grow history (replace)', historyAfter === historyBefore, `${historyBefore} → ${historyAfter}`);

// ── 5. params survive a reload ───────────────────────────────────────
await goto(`${BASE}/medicines?tab=low`);
await waitForList();
await send('Page.reload', {}, sessionId);
await waitForList();
const afterReload = await evaluate('location.search');
const reloadIndex = await activeTabIndex();
check('params survive a reload', afterReload.includes('tab=low') && reloadIndex === 2, `${afterReload} · activeIndex=${reloadIndex}`);

// ── 6. a second screen with a different schema ───────────────────────
await goto(`${BASE}/inventory?tab=out`);
await waitForList();
const inv = await evaluate(`JSON.stringify({
  search: location.search,
  h1: document.querySelector('h1')?.textContent?.trim() ?? null,
  activeIndex: [...document.querySelectorAll('.ph-tab')].findIndex(b => b.classList.contains('active')),
})`);
const iv = JSON.parse(inv);
check('inventory deep link renders with its params', iv.search.includes('tab=out') && !!iv.h1, `${iv.search} · h1=${iv.h1}`);
// InventoryPage's tab order is ['all','ok','low','out'] → "out" is index 3.
check('inventory deep link selects the matching tab', iv.activeIndex === 3, `activeIndex=${iv.activeIndex}`);

// ── 7. accounting sales (typed params) ───────────────────────────────
await goto(`${BASE}/accounting/sales?status=paid`);
await waitFor(`!!document.querySelector('h1')`);
const sales = await evaluate('location.search');
check('sales deep link keeps ?status=paid', sales.includes('status=paid'), sales);

// ── summary ──────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n=== ${results.length - failed.length}/${results.length} checks passed ===`);
process.exit(failed.length === 0 ? 0 : 1);
