/**
 * Authenticated screen capture + evidence collector for Daway Pharmacy Web.
 *
 * Logs in against the REAL Laravel API through the REAL login form (so the token
 * lands in localStorage exactly as in normal use), then visits each requested
 * path, waits for the network to settle, and records:
 *   - the final path (did routing keep us, or bounce to /login?)
 *   - console errors / warnings
 *   - failed network requests
 *   - a DOM signature (headings, counts of key elements, error/empty markers)
 *   - a full-page screenshot
 *
 * Usage:
 *   node tools/screens.mjs <baseUrl> <outDir> [path1,path2,...]
 *
 * Written as an evidence tool for API wiring: a screen that silently shows the
 * error boundary, or a 401 that bounces to /login, must be VISIBLE in the report.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/+$/, '');
const OUT_DIR = process.argv[3] || 'C:/Users/MSI/daway-web/qa/screens';

/**
 * Parse the comma-separated path list.
 *
 * Git Bash (MSYS) rewrites a lone `/` or a `/`-leading argument into a Windows
 * path before Node ever sees it. Two manglings were observed in practice:
 *
 *   "/"               → "C:/Program Files/Git/"
 *   "/inventory"      → "C:/Program Files/Git/inventory"
 *   "/" (PortableGit) → "C:/Users/…/binaries/PortableGit/versions/1.2.0/"
 *
 * This tool only ever navigates to routes on our own dev server, so anything
 * that does not start with a real route is chopped back to the segment after the
 * git/base prefix. `NAV_PATHS` (env) is the escape hatch when even that fails.
 */
function parsePaths(raw) {
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // Already a clean route.
      if (p.startsWith('/') && !/^\/[A-Za-z]:/.test(p)) return p;

      // Strip a Windows drive prefix.
      let s = p.replace(/^[A-Za-z]:[\\/]/, '');

      // Strip everything up to and including a Git/PortableGit install dir,
      // with or without a version segment.
      s = s.replace(
        /^.*?(?:PortableGit|Git)(?:[\\/]versions[\\/][^\\/]+)?[\\/]?/i,
        '',
      );

      s = s.replace(/\\/g, '/').replace(/^\/+/, '');
      return '/' + s;
    });
}

const PATHS = parsePaths(
  process.env.NAV_PATHS ||
    process.argv[4] ||
    '/,/inventory,/medicines,/inquiries,/alternatives,/ratings,/profile,/accounting,/accounting/sales,/accounting/cash,/accounting/refunds',
);

const PHARMACY_ID = process.env.PHARMACY_ID || 'PH-1234';
const PASSWORD = process.env.PHARMACY_PASSWORD || 'password';

/**
 * Theme to capture in. `THEME=dark` sets `localStorage.theme` before the first
 * paint of every screen, which is what the app's pre-paint snippet reads.
 * Needed because a UI change has to be checked in BOTH themes — a rule that
 * looks fine on white can be invisible on a dark surface.
 */
const THEME = process.env.THEME === 'dark' ? 'dark' : 'light';

mkdirSync(OUT_DIR, { recursive: true });

const userDataDir = mkdtempSync(join(tmpdir(), 'daway-screens-'));
const port = 9300 + Math.floor(Math.random() * 400);

const chrome = spawn(CHROME, [
  '--headless=new',
  // Chrome otherwise honours the SYSTEM proxy, which routes 127.0.0.1
  // through it and makes localhost calls crawl or time out.
  '--no-proxy-server',
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
  try {
    chrome.kill();
  } catch {
    /* gone */
  }
  try {
    rmSync(userDataDir, { recursive: true, force: true });
  } catch {
    /* locked */
  }
}
process.on('exit', cleanup);

async function getWsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const j = await res.json();
      if (j.webSocketDebuggerUrl) return j.webSocketDebuggerUrl;
    } catch {
      /* not up */
    }
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
  // Collect console output + failed requests for the current screen.
  if (msg.method === 'Runtime.consoleAPICalled') {
    const type = msg.params.type;
    if (type === 'error' || type === 'warning') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      currentConsole.push({ type, text: String(text).slice(0, 300) });
    }
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') {
      currentConsole.push({ type: 'log', text: String(e.text).slice(0, 300) });
    }
  }
  if (msg.method === 'Network.requestWillBeSent') {
    const r = msg.params.request;
    if (/\/api\//.test(r.url) && r.url.includes('127.0.0.1:8000')) {
      apiReqs.set(msg.params.requestId, r.method);
    }
  }
  if (msg.method === 'Network.responseReceived') {
    const r = msg.params.response;
    if (r.status >= 400) {
      currentFailed.push({ status: r.status, url: r.url.slice(0, 160) });
    }
    // Count API traffic so a hung/never-resolving request is visible evidence
    // rather than something inferred from a stuck skeleton. The METHOD matters:
    // an OPTIONS 204 is a CORS preflight, not the data response.
    if (/\/api\//.test(r.url) && r.url.includes('127.0.0.1:8000')) {
      const method = apiReqs.get(msg.params.requestId) || '?';
      apiReqs.delete(msg.params.requestId);
      // Only count the real verbs, so `api=N` means N data requests landed.
      if (method !== 'OPTIONS') {
        currentApi.push({
          method,
          status: r.status,
          url: r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90),
        });
      }
    }
  }
});

let currentConsole = [];
let currentFailed = [];
let currentApi = [];
/** requestId → HTTP method, so OPTIONS preflights can be filtered out. */
const apiReqs = new Map();

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
await send('Network.enable', {}, sessionId);
await send('Log.enable', {}, sessionId);
/**
 * Viewport. Overridable so the same harness can do responsive QA — a layout can
 * be correct at 1440 and broken at 390, and a desktop-only capture never says so.
 *   VIEWPORT=390  → phone      VIEWPORT=768  → tablet
 */
const VIEWPORT_W = Number(process.env.VIEWPORT) || 1440;
const VIEWPORT_H = Number(process.env.VIEWPORT_H) || 1000;

await send(
  'Emulation.setDeviceMetricsOverride',
  {
    width: VIEWPORT_W,
    height: VIEWPORT_H,
    deviceScaleFactor: 1,
    mobile: VIEWPORT_W < 768,
  },
  sessionId,
);

async function evaluate(expression) {
  const r = await send(
    'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise: true },
    sessionId,
  );
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  }
  return r.result.value;
}

/** Wait until no in-flight requests for `quietMs`, or `maxMs` elapses. */
async function settle(maxMs = 20000, quietMs = 1200) {
  const start = Date.now();
  let lastCount = -1;
  let lastChange = Date.now();
  while (Date.now() - start < maxMs) {
    const count = currentFailed.length + currentConsole.length;
    if (count !== lastCount) {
      lastCount = count;
      lastChange = Date.now();
    } else if (Date.now() - lastChange >= quietMs) {
      break;
    }
    await sleep(200);
  }
  await sleep(400);
}

// ── Log in through the real form ──────────────────────────────────────
console.log(`→ logging in at ${BASE}/login as ${PHARMACY_ID}`);
await send('Page.navigate', { url: `${BASE}/login` }, sessionId);

// POLL for the form instead of a fixed sleep.
//
// The app renders a session-check loader ("جاري التحقق والدخول...") before the
// form, and on a cold start that check can exceed a fixed 3.5s wait — which
// produced a false "login form never rendered" abort while the page was in fact
// healthy. Polling removes that flake.
let formReady = false;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  try {
    formReady = await evaluate(
      `!!document.querySelector('#loginForm') && !!document.querySelector('#identityInput')`,
    );
  } catch {
    formReady = false;
  }
  if (formReady) break;
}

if (!formReady) {
  console.error('✗ login form never rendered — aborting');
  socket.close();
  process.exit(1);
}
console.log('· login form ready');

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
await sleep(400);
await evaluate(`document.querySelector('#submitBtn').click(); true`);

let loggedIn = false;
for (let i = 0; i < 25; i++) {
  await sleep(900);
  const p = await evaluate('location.pathname');
  if (p && !p.startsWith('/login')) {
    loggedIn = true;
    break;
  }
}

if (!loggedIn) {
  const err = await evaluate(
    `(document.querySelector('.error-message')?.textContent || '').trim()`,
  );
  console.error(`✗ login failed${err ? ` — ${err}` : ''}`);
  socket.close();
  process.exit(1);
}
console.log('✓ logged in\n');

// Pin the theme BEFORE any screen renders, so the pre-paint snippet applies it.
await evaluate(
  `localStorage.setItem('theme', ${JSON.stringify(THEME)}); true`,
);
console.log(`· theme = ${THEME}\n`);

// ── Warm the API before measuring ─────────────────────────────────────
//
// The backend talks to a REMOTE managed MySQL (Aiven). The first requests
// after login pay a cold-connection cost and can exceed the per-screen wait,
// which showed up as a false "no data request was issued" for the first two
// screens of a run while every later screen passed.
//
// Firing one cheap authenticated request here removes that artifact so the
// report reflects the screens, not the connection warm-up.
{
  const warm = await evaluate(`(async () => {
    // Key from src/auth/tokenStorage.ts — it stores the raw token string.
    const token = localStorage.getItem('daway.auth.token') || '';
    try {
      const res = await fetch('http://127.0.0.1:8000/api/pharmacy/dashboard/stats', {
        headers: { Accept: 'application/json', Authorization: token ? 'Bearer ' + token : '' },
      });
      return res.status;
    } catch (e) {
      return 'err:' + e.message;
    }
  })()`);
  console.log(`· warm-up request → ${warm}\n`);
  await sleep(800);
}

// ── Visit each screen ─────────────────────────────────────────────────
const results = [];

for (const path of PATHS) {
  currentConsole = [];
  currentFailed = [];
  currentApi = [];

  // Hard-load each route (`Page.reload` after setting the URL) instead of an
  // in-SPA `Page.navigate`. An SPA navigation keeps the previously rendered
  // DOM in place, so the evidence pass could read the PREVIOUS screen's `<h1>`
  // before React swapped the tree — which made every route look identical.
  await send('Page.navigate', { url: `${BASE}${path}` }, sessionId);
  await sleep(600);
  await send('Page.reload', { ignoreCache: false }, sessionId);
  await sleep(1600);
  await settle();

  // Wait for the screen to LEAVE the loading state.
  //
  // The API is slow here (measured: inventory TTFB 3.7–4.7s, accounting overview
  // 17s–62s, plus a 0.5–0.8s CORS preflight), so a fixed sleep samples the
  // skeleton and reports `stats=0 rows=0` for a screen that actually renders
  // fine. Poll until the skeletons are gone, an error appears, or we hit the cap.
  //
  // The cap is generous on purpose: the slowest endpoint measured at 62s, and a
  // false "no data request issued" is worse than a slower sweep.
  for (let i = 0; i < 90; i++) {
    const stillLoading = await evaluate(
      `document.querySelectorAll('.ph-skel-row').length > 0`,
    );
    const hasOutcome = await evaluate(
      `document.querySelectorAll('.ph-error').length > 0 ||
       document.querySelectorAll('.ph-stat').length > 0 ||
       document.querySelectorAll('.ac-kpi').length > 0 ||
       document.querySelectorAll('tbody tr').length > 0 ||
       document.querySelectorAll('.ph-empty').length > 0`,
    );
    if (!stillLoading || hasOutcome) break;
    await sleep(500);
  }

  const evidence = await evaluate(`(() => {
    const txt = (el) => (el?.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 90);
    // Scope the heading to the routed content area. A bare
    // \`document.querySelector('h1')\` can match the app shell's own title
    // region, which made every route look like the dashboard.
    const page = document.querySelector('.ph-page');
    const scope = page || document.querySelector('main') || document.body;
    return {
      path: location.pathname,
      h1: txt(scope.querySelector('h1')),
      shellH1: txt(document.querySelector('h1')),
      hasPage: !!page,
      statCards: document.querySelectorAll('.ph-stat').length,
      tables: document.querySelectorAll('table').length,
      tableRows: document.querySelectorAll('tbody tr').length,
      cards: document.querySelectorAll('.ph-card').length,
      charts: document.querySelectorAll('canvas').length,
      // Async-state markers added for the live API wiring:
      loading: document.querySelectorAll('.ph-loading, .ph-skel-row').length,
      errorBoundary: document.querySelectorAll('.ph-error').length,
      errorText: txt(document.querySelector('.ph-error p')),
      empty: document.querySelectorAll('.ph-empty').length,
      emptyTitle: txt(document.querySelector('.ph-empty h3')),
      bodyLen: document.body.innerText.length,
      /**
       * Shell integrity. A screen that renders without the sidebar (or with the
       * page scrolled horizontally) is a layout regression that a screenshot
       * alone does not make obvious, so it is asserted here explicitly.
       */
      sidebarW: Math.round(document.querySelector('.sidebar-pro')?.getBoundingClientRect().width ?? 0),
      topbarH: Math.round(document.querySelector('.topbar')?.getBoundingClientRect().height ?? 0),
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);

  let shotFile = null;
  try {
    const shot = await send(
      'Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: true },
      sessionId,
    );
    shotFile = join(OUT_DIR, `${path === '/' ? 'dashboard' : path.slice(1).replace(/\//g, '-')}.png`);
    writeFileSync(shotFile, Buffer.from(shot.data, 'base64'));
  } catch (e) {
    console.log(`  screenshot failed: ${e.message}`);
  }

  const bouncedToLogin = evidence.path.startsWith('/login') && path !== '/login';

  results.push({ requested: path, ...evidence, bouncedToLogin, failed: currentFailed, api: currentApi, console: currentConsole, shotFile });

  const flag = bouncedToLogin ? '⚠ bounced→login' : '';
  console.log(
    `  ${path.padEnd(22)} → ${String(evidence.path).padEnd(22)} ` +
      `page=${evidence.hasPage ? 'y' : 'n'} h1="${evidence.h1.slice(0, 26)}" ` +
      `stats=${evidence.statCards} rows=${evidence.tableRows} err=${evidence.errorBoundary} ` +
      `empty=${evidence.empty} api=${currentApi.length} ${flag}`,
  );
}

// ── Report ────────────────────────────────────────────────────────────
const reportPath = join(OUT_DIR, 'screens-report.json');
writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log(`\nreport: ${reportPath}`);
console.log(`shots:  ${OUT_DIR}`);

const problems = results.filter(
  (r) => r.bouncedToLogin || r.errorBoundary > 0 || r.failed.length > 0 || r.api.length === 0,
);
if (problems.length === 0) {
  console.log('✅ all screens rendered without error/bounce');
} else {
  console.log(`\n⚠ ${problems.length} screen(s) need attention:`);
  for (const p of problems) {
    console.log(`  ${p.requested}`);
    if (p.bouncedToLogin) console.log('    - bounced to /login');
    if (p.errorBoundary) console.log(`    - error boundary: ${p.errorText}`);
    if (p.api.length === 0) console.log('    - no data request was issued for this screen');
    for (const f of p.failed.slice(0, 4)) console.log(`    - HTTP ${f.status} ${f.url}`);
    for (const c of p.console.slice(0, 4)) console.log(`    - ${c.type}: ${c.text.slice(0, 160)}`);
  }
}

console.log('\nper-screen API traffic:');
for (const r of results) {
  const list = r.api.map((a) => `${a.method} ${a.url} → ${a.status}`).join(' | ');
  console.log(`  ${r.requested.padEnd(22)} ${list || '(none)'}`);
}

socket.close();
process.exit(problems.length === 0 ? 0 : 0);
