/**
 * Phase screenshots for the design-unification work.
 *
 * WHY NOT `screens.mjs`: that tool logs in through the PHARMACY form only
 * (`#identityInput` / `#passwordInput`), so it can never reach `/admin/*`.
 * This harness seeds the two bearer tokens directly — the same localStorage
 * keys the app itself reads (`daway.auth.token` for pharmacy,
 * `daway.admin.token` for admin) — so ONE run covers both surfaces, in both
 * themes, on the same pages. That is what a before/after comparison needs.
 *
 * Tokens come from the environment so nothing lands on disk:
 *   ADMIN_TOKEN, PHARMACY_TOKEN
 *
 * Usage:
 *   ADMIN_TOKEN=... PHARMACY_TOKEN=... node tools/shoot-unify.mjs <outDir> [label]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = (process.env.PROBE_BASE ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');

const OUT_DIR = process.argv[2];
const LABEL = process.argv[3] ?? '';
if (!OUT_DIR) {
  console.error('usage: node tools/shoot-unify.mjs <outDir> [label]');
  process.exit(2);
}

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';
const PHARMACY_TOKEN = process.env.PHARMACY_TOKEN ?? '';

/* Mock mode is resolved up here because the run report records it, and the
   report is built before the mock module below is reached. */
const FIXTURE_DIR = process.env.FIXTURES ?? '';
const MOCK = process.env.MOCK === '1' && FIXTURE_DIR !== '';
if (!ADMIN_TOKEN || !PHARMACY_TOKEN) {
  console.error('ADMIN_TOKEN and PHARMACY_TOKEN env vars are required.');
  process.exit(2);
}

/**
 * Named page sets. `role: 'none'` clears BOTH tokens, which is required for
 * `/login` — a seeded token would bounce the screen straight to the dashboard
 * and the login page would never be photographed.
 */
const SETS = {
  six: [
    { name: 'admin-medicines', path: '/admin/medicines', role: 'admin' },
    { name: 'admin-users', path: '/admin/users', role: 'admin' },
    { name: 'admin-categories', path: '/admin/categories', role: 'admin' },
    { name: 'pharmacy-medicines', path: '/medicines', role: 'pharmacy' },
    { name: 'pharmacy-accounting-sales', path: '/accounting/sales', role: 'pharmacy' },
    { name: 'pharmacy-profile', path: '/profile', role: 'pharmacy' },
  ],
  phase3: [
    { name: 'admin-medicine-create', path: '/admin/medicines/create', role: 'admin' },
    { name: 'pharmacy-medicine-request', path: '/medicines/request', role: 'pharmacy' },
    { name: 'pharmacy-alternative-create', path: '/alternatives/create', role: 'pharmacy' },
  ],
  auth: [
    { name: 'login', path: '/login', role: 'none' },
    { name: 'admin-password-change', path: '/admin/profile/password', role: 'admin' },
    { name: 'pharmacy-password-change', path: '/password', role: 'pharmacy' },
  ],
};

/* Optional narrowing, so a single slow page can be re-shot without redoing the
   whole sweep. `ONLY=pharmacy-medicines THEMES=light node tools/shoot-unify.mjs …` */
const set = process.env.SET ?? 'six';
const PAGES_ALL = SETS[set] ?? SETS.six;
const only = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const PAGES = only.length ? PAGES_ALL.filter((p) => only.includes(p.name)) : PAGES_ALL;
const THEMES = (process.env.THEMES ?? 'light,dark')
  .split(',')
  .map((s) => s.trim())
  .filter((t) => t === 'light' || t === 'dark');

const profileDir = mkdtempSync(join(process.env.TEMP ?? tmpdir(), 'cdp-unify-'));
/* Wide port range: two runs (light + dark) can be launched in parallel, and
   each needs its own CDP port. */
const port = 9600 + Math.floor(Math.random() * 900);

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-proxy-server',
  '--window-size=1500,1400',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
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
const consoleErrors = [];
socket.on('message', (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.method === 'Fetch.requestPaused') {
    onRequestPaused(m.params).catch(() => {});
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? 'exception');
  }
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
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 120));
  return r.result.value;
};

/**
 * Retry an evaluate across a navigation.
 *
 * 🔴 Between `Page.navigate` and the new document committing, the old execution
 * context is destroyed — `Runtime.evaluate` then fails, or runs against a page
 * with no `document.body` yet. On a cold Vite start the first compile takes
 * tens of seconds, so a fixed sleep is not enough: poll until the document is
 * really there.
 */
async function evalSafe(expr, tries = 100) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      return await evaluate(expr);
    } catch (e) {
      last = e;
      await sleep(300);
    }
  }
  throw new Error(`evalSafe gave up (${tries} tries): ${String(last?.message ?? last).slice(0, 160)} :: ${expr.slice(0, 90)}`);
}

/* Wait for Vite's document on the correct origin. A fulfilled expression that
   returns false is not a successful readiness check, so this explicitly loops
   until the body exists and the URL has left about:blank. */
async function domReady() {
  const origin = new URL(BASE).origin;
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    try {
      const ready = await evaluate(`!!document.body && location.origin === ${JSON.stringify(origin)}`);
      if (ready) return true;
    } catch { /* new execution context is still being created */ }
    await sleep(250);
  }
  throw new Error(`DOM did not reach ${origin} within 90s`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false,
});

/* No eager API warm-up here. `php artisan serve` is single-threaded over a
   remote database; an unbounded `fetch()` before capture can block every page
   indefinitely if that first request stalls. The page's own data request is
   covered by the per-page settle timeout below. */
await send('Page.navigate', { url: `${BASE}/` });
await domReady();

const report = { base: BASE, label: LABEL, mock: MOCK, themes: {}, errors: consoleErrors };

/** Apply a theme exactly the way `lib/theme.ts` does — the class on BOTH
 *  <html> and <body>, plus the stored preference. Setting `data-theme` alone
 *  does NOT activate dark mode.
 *  `document.body` is optional-chained: on a cold Vite start the very first
 *  evaluate can run against a document that has no <body> yet. */
async function applyTheme(theme) {
  await evalSafe(`
    (() => {
      const on = ${JSON.stringify(theme)} === 'dark';
      localStorage.setItem('theme', ${JSON.stringify(theme)});
      document.body?.classList.toggle('dark-mode', on);
      document.documentElement.classList.toggle('dark-mode', on);
      document.documentElement.setAttribute('data-theme', on ? 'dark' : 'light');
      return true;
    })()
  `);
}

/**
 * Seed exactly the token the page needs and CLEAR the other.
 *
 * Seeding both (as an earlier version did) breaks `/login`: a present token
 * makes the guest gate redirect to the dashboard, so the login screen could
 * never be captured.
 */
async function seedTokens(role) {
  const admin = role === 'admin' ? ADMIN_TOKEN : '';
  const pharmacy = role === 'pharmacy' ? PHARMACY_TOKEN : '';
  await evalSafe(`
    (() => {
      const put = (k, v) => (v ? localStorage.setItem(k, v) : localStorage.removeItem(k));
      put('daway.admin.token', ${JSON.stringify(admin)});
      put('daway.auth.token', ${JSON.stringify(pharmacy)});
      return true;
    })()
  `);
}

/* ------------------------------------------------------------------ */
/* API mocking (the CDP equivalent of Playwright's `page.route`)       */
/* ------------------------------------------------------------------ */
/*
 * 🔴 WHY THIS EXISTS: the dev API is `php artisan serve` (single-threaded)
 * against a REMOTE MySQL. Measured: `/api/admin/medicines` 16.5s,
 * `/api/admin/users` 4.5s, `/api/admin/categories` >90s (times out). Screens
 * captured against it show the app's own "request timed out" error state, which
 * proves nothing about layout. So the pages are rendered against recorded
 * fixtures instead — deterministic, instant, and immune to the backend.
 *
 * Fixtures are captured once from the real API (see `.probe-out/fixtures/`), so
 * the shapes are real, not invented.
 */
/** pathname prefix → fixture basename */
const FIXTURE_MAP = [
  ['/api/admin/medicines', 'admin_medicines'],
  ['/api/admin/users', 'admin_users'],
  ['/api/admin/dashboard', 'admin_dashboard'],
  ['/api/admin/categories', 'admin_categories'],
  ['/api/admin/profile', 'admin_profile'],
  ['/api/pharmacy/medicines', 'pharmacy_medicines'],
  ['/api/pharmacy/accounting/sales', 'accounting_sales'],
  ['/api/profile/pharmacy', 'profile_pharmacy'],
  ['/api/categories', 'categories_public'],
];

const fixtureCache = new Map();
const unmatchedApi = new Set();

function fixtureFor(pathname) {
  const hit = FIXTURE_MAP.find(([p]) => pathname.startsWith(p));
  if (!hit) return null;
  if (fixtureCache.has(hit[1])) return fixtureCache.get(hit[1]);
  try {
    const body = readFileSync(join(FIXTURE_DIR, `${hit[1]}.json`), 'utf8');
    fixtureCache.set(hit[1], body);
    return body;
  } catch {
    return null;
  }
}

const CORS = [
  { name: 'Access-Control-Allow-Origin', value: BASE },
  { name: 'Access-Control-Allow-Headers', value: 'Authorization,Content-Type,Accept,X-Requested-With' },
  { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,PATCH,DELETE,OPTIONS' },
  { name: 'Access-Control-Allow-Credentials', value: 'true' },
];

async function onRequestPaused(params) {
  const { requestId, request } = params;
  let url = null;
  try {
    url = new URL(request.url);
  } catch { /* leave null */ }
  const pathname = url?.pathname ?? '/';

  /*
   * 🔴 Only the BACKEND's `/api/*` is mocked.
   *
   * The pattern `*​/api/*` also matches Vite's own modules (`/src/api/client.ts`,
   * `/src/api/adminApi.ts`). Fulfilling those with JSON would break the app —
   * they must pass through to the dev server.
   */
  const baseHost = new URL(BASE).host;
  if (!pathname.startsWith('/api/') || url?.host === baseHost) {
    await send('Fetch.continueRequest', { requestId }).catch(() => {});
    return;
  }

  // Preflight — answer locally, never touch the network.
  if (request.method === 'OPTIONS') {
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 204,
      responseHeaders: CORS,
    }).catch(() => {});
    return;
  }

  const body = fixtureFor(pathname);
  if (body == null) {
    unmatchedApi.add(`${request.method} ${pathname}`);
    /*
     * 🔴 Fulfil with an empty envelope instead of letting it through.
     *
     * `continueRequest` hands the call to the REAL backend, and when that
     * backend is down (it dies between sessions) the request never resolves —
     * the page sits on its loading skeleton and the capture hangs for the full
     * timeout. A generic `{success,message,data}` keeps every unmatched call
     * instant and lets the screen render its own empty state.
     */
    await send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [...CORS, { name: 'Content-Type', value: 'application/json; charset=utf-8' }],
      body: Buffer.from(JSON.stringify({ success: true, message: '', data: [], pagination: null }), 'utf8').toString('base64'),
    }).catch(() => {});
    return;
  }

  await send('Fetch.fulfillRequest', {
    requestId,
    responseCode: 200,
    responseHeaders: [...CORS, { name: 'Content-Type', value: 'application/json; charset=utf-8' }],
    body: Buffer.from(body, 'utf8').toString('base64'),
  }).catch(() => {});
}

/** Full-page PNG capture. */
const shot = async (file) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(file, Buffer.from(data, 'base64'));
};

/**
 * Freeze motion before capturing.
 *
 * `.admin-page` runs a 0.75s entrance reveal (`opacity`/`translateY`/`blur`)
 * and the sidebar animates too. A capture taken mid-flight is blurred and
 * washed out — it looks like a broken layout when the page is simply still
 * arriving. Killing animation/transition makes the frame deterministic, which
 * is the whole point of a before/after comparison.
 */
async function freeze() {
  await evaluate(`
    (() => {
      if (document.getElementById('__freeze')) return true;
      const s = document.createElement('style');
      s.id = '__freeze';
      s.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}';
      document.head.appendChild(s);
      return true;
    })()
  `);
}

/**
 * Wait until the route sticks AND the page has REAL content.
 *
 * 🔴 Waiting on `innerText.length` alone is not enough: the page header renders
 * immediately, so the condition passes while `AsyncBoundary` is still showing
 * its `.ph-loading` skeleton. That captured a screenful of shimmer bars, which
 * reads as a broken/blurred layout. So the skeleton must be gone AND a real
 * content node (a table row, a card, or a chart) must exist.
 *
 * A redirect to /login is a real finding, so it is reported rather than
 * silently timed out on.
 */
async function settle(path) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < 120000) {
    // evalSafe, not evaluate: a navigation in flight destroys the execution
    // context and would throw out of the polling loop instead of retrying.
    const state = await evalSafe(`(() => {
      const root = document.querySelector('#root');
      const loading = !!document.querySelector('.ph-loading');
      const errored = !!document.querySelector('.ph-error, .error-state, [data-state="error"]');
      const content = document.querySelectorAll(
        'table tbody tr, .ph-card, .admin-page .chart-card, .admin-page .main-card, .admin-page .card-box'
      ).length;
      return {
        path: location.pathname,
        children: root ? root.children.length : 0,
        text: (document.body.innerText || '').length,
        loading,
        errored,
        content,
      };
    })()`, 1);
    last = state;
    // A redirect away from the requested route is a real finding — report it
    // instead of waiting out the timeout. (Asking for /login and getting it is
    // correct, so the guard compares against the requested path.)
    if ((state.path === '/login' || state.path === '/') && state.path !== path) return state;
    // The brief is explicit: wait for REAL content — not the skeleton and not
    // the error state. `.ph-loading` is the skeleton; `.ph-error` is the
    // "request timed out" panel.
    // The text floor is 200, not 500: auth screens (login, password) carry no
    // table or card, and at 500 they never qualified — every run burned the
    // full 120s timeout on them. `!loading` is what actually rules out a
    // skeleton, so a lower floor is still safe for data pages.
    if (state.path === path && !state.loading && !state.errored && (state.content > 0 || state.text > 200)) {
      return state;
    }
    await sleep(400);
  }
  return { ...(last ?? {}), path: 'TIMEOUT' };
}

mkdirSync(OUT_DIR, { recursive: true });

/* Enabled here, after the mock module's `const`s are initialised — referencing
   MOCK earlier hits the temporal dead zone. The warm-up navigation above is
   deliberately left un-mocked: it only needs the DOM, not data. */
if (MOCK) {
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*', requestStage: 'Request' }] });
}

for (const theme of THEMES) {
  const themeDir = join(OUT_DIR, theme);
  mkdirSync(themeDir, { recursive: true });
  report.themes[theme] = [];

  await send('Page.navigate', { url: `${BASE}/` });
  await domReady();
  await seedTokens('none');
  await applyTheme(theme);

  for (const page of PAGES) {
    console.log(`[capture] ${theme} ${page.path}: seed token`);
    /*
     * 🔴 Seed on the CURRENT page, BEFORE navigating.
     *
     * localStorage is origin-scoped and survives a full page load, so writing
     * it here means the token is already present when the target route mounts.
     * Writing it AFTER `Page.navigate` is too late: the app reads the token
     * during its initial mount, finds nothing, and the guest gate redirects to
     * /login — which then photographs the login screen instead of the page.
     */
    await seedTokens(page.role);
    await applyTheme(theme);

    await send('Page.navigate', { url: `${BASE}${page.path}` });
    // Wait for the DOM, then re-assert the theme class (a full load resets the
    // DOM classes). `domReady` replaces a fixed sleep — on a cold Vite start a
    // fixed sleep races the first compile.
    await domReady();
    await applyTheme(theme);

    const state = await settle(page.path);
    // Freeze motion, then let images/fonts finish before the capture.
    await freeze();
    await sleep(1800);
    const file = join(themeDir, `${page.name}.png`);
    await shot(file);
    console.log(`[capture] ${theme} ${page.path}: ${state.path}, errored=${state.errored}, content=${state.content}, saved ${file}`);
    report.themes[theme].push({ ...page, landedOn: state.path, errored: state.errored, content: state.content, file });
  }
}

console.log(JSON.stringify({ ...report, unmatchedApi: [...unmatchedApi] }, null, 2));
socket.close();
chrome.kill();
process.exit(0);
