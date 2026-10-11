/**
 * Measure the REACT categories page in headless Chrome, with the admin API
 * stubbed at the network layer.
 *
 * WHY STUB
 * --------
 * The dev server talks to a REMOTE Aiven MySQL through a local `php artisan
 * serve`; every `/api/admin/*` call measured 5-36s earlier in this project. A
 * screenshot of a loading skeleton measures the skeleton, not the page. The
 * `Fetch` domain lets the real component render with fixed data, so the numbers
 * describe the real markup.
 *
 * WHAT IS STUBBED AND WHAT IS NOT
 * -------------------------------
 * ONLY the HTTP responses. The React components, the CSS bundle, the router,
 * the auth guard and the i18n are the real ones. The token is seeded into
 * localStorage because `isAuthenticated()` is `token !== null` and does not
 * verify with the server — see auth/session.ts.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5199';
const URL_ = `${BASE}/admin/categories`;
const dark = process.argv.includes('--dark');

const profile = mkdtempSync(join(process.env.TEMP ?? tmpdir(), 'cdp-react-'));
const port = 9600 + Math.floor(Math.random() * 200);

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1440,1200',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The canned payload — the same two rows the Blade harness renders, so the two
   measurements describe the same content. */
const CATEGORIES_PAYLOAD = {
  data: {
    categories: [
      {
        id: 1,
        name_ar: 'مسكنات الألم',
        name_en: 'Painkillers',
        slug: 'painkillers',
        is_active: true,
        sort_order: 1,
        category_medicine_links_count: 1250,
        needs_review_count: 12,
        subcategories: [
          { id: 11, name_ar: 'باراسيتامول' },
          { id: 12, name_ar: 'إيبوبروفين' },
        ],
      },
      {
        id: 2,
        name_ar: 'فيتامينات',
        name_en: 'Vitamins',
        slug: 'vitamins',
        is_active: false,
        sort_order: 7,
        category_medicine_links_count: 88,
        needs_review_count: 0,
        subcategories: [],
      },
    ],
    pagination: { current_page: 1, last_page: 1, per_page: 50, total: 42, from: 1, to: 2 },
    filters: { q: '' },
    stats: { total: 42, active: 39, links: 18330, needs_review: 17 },
  },
};

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('chrome did not expose a debugger');
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  const handlers = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    for (const h of handlers) h(msg);
  });
  return {
    send: (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        const myId = ++id;
        pending.set(myId, { resolve, reject });
        ws.send(JSON.stringify({ id: myId, method, params, sessionId }));
      }),
    on: (fn) => handlers.push(fn),
  };
}

const MEASURE = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (s) => {
    const el = q(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: +r.width.toFixed(1), h: +r.height.toFixed(1),
      font: cs.fontSize, lh: cs.lineHeight, radius: cs.borderRadius, pad: cs.padding,
      bg: cs.backgroundImage !== 'none' ? 'gradient' : cs.backgroundColor, color: cs.color,
    };
  };
  const shell = q('.admin-page');
  const sr = shell ? shell.getBoundingClientRect() : null;
  return {
    shellFound: !!shell,
    contentWidth: sr ? +sr.width.toFixed(1) : null,
    h1: box('.header-title-section h1'),
    subtitle: box('.header-title-section p'),
    breadcrumb: box('.breadcrumb-trail'),
    statsGrid: box('.stats-grid'),
    statsCols: (() => { const g = q('.stats-grid'); return g ? getComputedStyle(g).gridTemplateColumns : null; })(),
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
    /* Leftover React-side classes that should NO LONGER be present now that the
       page renders the Blade shell. Non-zero means the old design is still
       bleeding through. */
    legacyPhHead: document.querySelectorAll('.ph-head').length,
    legacyPhStats: document.querySelectorAll('.ph-stats-grid').length,
    legacyPhTable: document.querySelectorAll('.ph-table').length,
    /* Is Font Awesome actually available? It is loaded from a CDN
       (index.html). In a network-restricted headless run the icons render BLANK,
       which looks like a missing-icon defect in the screenshot but is purely an
       environment artifact. Checked explicitly so a blank square is never
       misread as a bug in the port. */
    faLoaded: (() => {
      const probe = document.createElement('i');
      probe.className = 'fas fa-eye';
      probe.style.position = 'absolute';
      document.body.appendChild(probe);
      const fam = getComputedStyle(probe).fontFamily;
      probe.remove();
      return /awesome/i.test(fam);
    })(),
    iconGlyphCount: document.querySelectorAll('.action-btn i, .pill-icon-wrapper i').length,
    dark: document.body.classList.contains('dark-mode')
      || document.documentElement.dataset.theme === 'dark',
  };
})()`;

(async () => {
  const wsUrl = await connect();
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  const { send, on } = makeClient(ws);

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  await send('Page.enable', {}, sessionId);
  await send('Runtime.enable', {}, sessionId);
  await send('Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }, sessionId);

  /* Intercept and stub the API.
     🔴 THREE TRAPS — each cost a full debugging round.
     (1) The API base is an ABSOLUTE cross-origin URL taken from
         VITE_API_BASE_URL (http://127.0.0.1:8000/api/...), NOT a relative
         path. A pattern like 'api/admin' therefore never matches; the pattern
         has to be wildcarded from the host.
     (2) A loose pattern also matches the app's own ES module requests —
         src/api/client.ts, src/api/adminApi.ts, … — and stubbing those with
         JSON destroys the module graph, so React never mounts and the
         measurement silently reports an EMPTY PAGE. The pattern must include
         the '/api/admin/' segment so it cannot catch the module graph.
     (3) NEVER write a slash-star-star-slash sequence inside a block comment.
         A literal glob like the one this pattern uses ends with those three
         characters and CLOSES THE COMMENT EARLY, turning the prose after it
         into real code. That produced a baffling "api is not defined"
         ReferenceError from inside a comment. Keep globs out of comments.
     `Fetch.enable` must be on BEFORE the first navigation of the run, or the
     page's request escapes to the real (remote, slow) backend and the page
     stays in its loading state forever. */
  const API_PATTERN = '*://*/api/admin/*';
  await send('Fetch.enable',
    { patterns: [{ urlPattern: API_PATTERN, requestStage: 'Request' }] }, sessionId);
  on((msg) => {
    if (msg.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = msg.params;
    const url = request.url;

    /*
     * 🔴 A CROSS-ORIGIN request that carries an `Authorization` header triggers
     * a CORS PREFLIGHT. Stubbing the OPTIONS with a normal JSON body left the
     * preflight unanswered, so the browser blocked the real request and the page
     * rendered its ERROR state — which looks like "the API is down" rather than
     * "the harness is wrong". The preflight must be answered as a preflight.
     */
    const cors = [
      { name: 'Access-Control-Allow-Origin', value: BASE },
      { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,PUT,DELETE,OPTIONS' },
      { name: 'Access-Control-Allow-Headers', value: 'Authorization,Content-Type,Accept,X-Requested-With' },
    ];

    if (request.method === 'OPTIONS') {
      send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 204,
        responseHeaders: cors,
        body: '',
      }, msg.sessionId).catch(() => {});
      return;
    }

    const body = /\/api\/admin\/categories(\?|$)/.test(url)
      ? CATEGORIES_PAYLOAD
      : { data: {} };

    send('Fetch.fulfillRequest', {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, ...cors],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    }, msg.sessionId).catch(() => {});
  });

  /* Seed the admin token on the app origin, then navigate. Done via a separate
     navigation because localStorage is per-origin and the tab starts on
     about:blank.
     🔴 `Fetch.enable` MUST already be active here — i.e. before the FIRST
     navigation of the run, not just before the page under test. Enabling it
     only before the second navigation left the page in a permanent loading
     state; the interception was live but the request had already been issued
     against the real (remote, slow) backend. */
  await send('Page.navigate', { url: BASE }, sessionId);
  await sleep(1500);
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('daway.admin.token', 'harness-token');`,
  }, sessionId);

  await send('Page.navigate', { url: URL_ }, sessionId);

  /* Wait for the DATA, not for a fixed duration. A fixed sleep is either too
     short (measures a skeleton) or needlessly slow.
     ⚠️ The readiness predicate must ALSO confirm we are on the target route —
     the admin dashboard renders its own `.stats-grid`, so checking for that
     class alone can pass while still on the previous page and then measure a
     document that has since been replaced. */
  const READY = `location.pathname === '/admin/categories'
     && (!!document.querySelector('.stats-grid') || !!document.querySelector('.ph-error'))`;

  let ready = false;
  for (let i = 0; i < 60; i++) {
    const probe = await send('Runtime.evaluate',
      { expression: READY, returnByValue: true }, sessionId);
    if (probe.result.value === true) { ready = true; break; }
    await sleep(300);
  }
  if (!ready) console.error('⚠️  timed out waiting for the categories page to settle — measuring what is there');

  /* The icon webfont is loaded from a CDN. This is a file-system/document
     wait, so it is a legitimate one — measuring before it lands makes the
     screenshot show empty squares and invites a false "icons are broken"
     reading. The measurement itself does not depend on it; the SCREENSHOT does. */
  await send('Runtime.evaluate', {
    expression: `document.fonts ? document.fonts.ready.then(()=>true) : true`,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);

  await sleep(600); // let the reveal animation (0.75s) settle before measuring

  if (dark) {
    await send('Runtime.evaluate', {
      expression: `document.body.classList.add('dark-mode');
                   document.documentElement.classList.add('dark-mode');
                   document.documentElement.dataset.theme='dark';`,
    }, sessionId);
    await sleep(500);
  }

  const res = await send('Runtime.evaluate',
    { expression: MEASURE, returnByValue: true }, sessionId);

  const v = res.result.value;
  console.log(JSON.stringify(v, null, 2));

  /* Keep a screenshot for the eye, not for the verdict. */
  const shot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(`tools/__react-categories${dark ? '-dark' : ''}.png`,
    Buffer.from(shot.data, 'base64'));

  await send('Target.closeTarget', { targetId });
  ws.close();
  chrome.kill();
  process.exit(0);
})().catch((err) => {
  console.error('PROBE FAILED:', err.message);
  console.error(err.stack?.split('\n').slice(0, 6).join('\n'));
  chrome.kill();
  process.exit(1);
});
