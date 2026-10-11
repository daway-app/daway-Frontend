/**
 * Verify the React admin MEDICINES page (charts + header + row actions) against
 * the LOCAL Laravel backend, in headless Chrome.
 *
 * WHAT IT PROVES — by MEASUREMENT, not by eyeballing a screenshot:
 *
 *  1. The two CSS-only charts actually render and are SIZED. A `conic-gradient`
 *     donut with a zero-height parent, or a bar whose `--fill-w` never resolves,
 *     looks "present" in the DOM while being invisible. So this reads the
 *     bounding boxes and the resolved custom properties.
 *
 *  2. The donut's `--seg1` matches `stats.in_pharmacy_pct * 3.6` — i.e. the ring
 *     is drawn from REAL data, not a hard-coded angle.
 *
 *  3. Each bar's rendered width is proportional to its percentage. This is the
 *     assertion that would catch `--fill-w` being dropped.
 *
 *  4. The header, breadcrumb and create button exist, and the create button is a
 *     real router <a> to `/admin/medicines/create`.
 *
 *  5. Each row carries edit + delete actions, and the edit action is an <a>
 *     pointing at that row's `/admin/medicines/{id}/edit`.
 *
 *  6. **The create/edit FORM mounts and is not blank** — this is the half that a
 *     screenshot of the list cannot show. It also checks the alternatives
 *     search box and that the image field is a TEXT URL input, not a file input
 *     (a file input would mean the Cloudinary-URL design regressed).
 *
 * It does NOT click delete: that would destroy a real catalogue row.
 *
 * Usage:
 *   node tools/probe-admin-medicines.mjs
 *   node tools/probe-admin-medicines.mjs --dark
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_BASE ?? 'http://127.0.0.1:5173';
const dark = process.argv.includes('--dark');

const token = readFileSync(new URL('./__token.txt', import.meta.url), 'utf8').trim();
if (!token) throw new Error('tools/__token.txt is empty — mint an admin token first.');

const profileDir = mkdtempSync(join(process.env.TEMP ?? tmpdir(), 'cdp-adminmed-'));
const port = 9800 + Math.floor(Math.random() * 90);

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1500,1400',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      // `/json/list` gives TARGETS (pages); `/json/version` is the browser
      // endpoint and exposes no `Page` domain.
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 140));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1500, height: 1400, deviceScaleFactor: 1, mobile: false,
});

await send('Page.navigate', { url: `${BASE}/` });
await sleep(1500);
await evaluate(`localStorage.setItem('daway.admin.token', ${JSON.stringify(token)}); true;`);
/*
 * Prime the backend before touching an admin route.
 *
 * `php artisan serve` is SINGLE-THREADED and the database is REMOTE, so the
 * very first request of the session can block for tens of seconds while the
 * connection is established. Without this the admin page's first API call
 * races the `waitFor` budget and the probe reports a bogus "timeout waiting
 * for medicines charts" even though the page eventually renders fine.
 */
await evaluate(`
  fetch('${process.env.PROBE_API ?? 'http://127.0.0.1:8000'}/api/pharmacies')
    .then(r => r.status).catch(e => String(e));
`);
if (dark) {
  await evaluate(`
    localStorage.setItem('theme','dark');
    document.body.classList.add('dark-mode');
    document.documentElement.classList.add('dark-mode');
    true;
  `);
}

const shot = async (name) => {
  mkdirSync(new URL('../.probe-out', import.meta.url), { recursive: true });
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const out = new URL(`../.probe-out/${name}.png`, import.meta.url).pathname.replace(/^\//, '');
  writeFileSync(out, Buffer.from(data, 'base64'));
  return out;
};

/** Wait on a CONDITION, never a fixed sleep — the local serve is
 *  single-threaded over a remote DB, so a cold call can take tens of seconds.
 *
 *  A mid-poll navigation destroys the JS execution context and makes the
 *  evaluation throw. That is NOT a failure — it means "still settling, look
 *  again" — so it is swallowed and retried. Letting it escape would abort the
 *  loop and surface as a misleading timeout.
 */
const waitFor = async (expr, label, ms = 180000) => {
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < ms) {
    try {
      if (await evaluate(expr)) return true;
    } catch (err) {
      lastErr = err;
    }
    await sleep(500);
  }
  throw new Error(
    `timeout waiting for ${label}` + (lastErr ? ` (last error: ${lastErr.message})` : ''),
  );
};

const report = {};

/* ── 1. The list page ───────────────────────────────────────────────────── */
await send('Page.navigate', { url: `${BASE}/admin/medicines` });
await waitFor(
  `location.pathname === '/admin/medicines' && !!document.querySelector('.admin-page .chart-card')`,
  'medicines charts',
);

report.list = await evaluate(`(() => {
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\\-]/g, '')); return Number.isFinite(n) ? n : null; };
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left) }; };

  const header = document.querySelector('.admin-page .header-title-section h1');
  const crumbs = [...document.querySelectorAll('.admin-page .breadcrumb-trail a, .admin-page .breadcrumb-trail span')].map(e => e.textContent.trim());
  /* Btn with a "to" prop renders a router <a>; match on the class alone and read
     the tag name back — that is what proves it is a link, not a styled div. */
  const createBtn = document.querySelector('.admin-page .header-actions .btn-add-pharmacy');

  const chartCards = [...document.querySelectorAll('.admin-page .chart-card')];
  const donut = document.querySelector('.admin-page .donut-chart-animated');
  const donutHole = document.querySelector('.admin-page .donut-inner-hole');
  const legend = [...document.querySelectorAll('.admin-page .legend-row')].map(r => ({
    text: r.querySelector('.legend-text') ? r.querySelector('.legend-text').textContent.trim() : null,
    pct: r.querySelector('.badge-percent') ? r.querySelector('.badge-percent').textContent.trim() : null,
    dotColour: r.querySelector('.dot-indicator') ? getComputedStyle(r.querySelector('.dot-indicator')).backgroundColor : null,
  }));

  const bars = [...document.querySelectorAll('.admin-page .bar-progress-group')].map(g => {
    const label = g.querySelector('.bar-title');
    const pctEl = g.querySelector('.bar-percentage');
    const track = g.querySelector('.bar-track');
    const fill = g.querySelector('.bar-fill');
    const tr = track ? track.getBoundingClientRect() : null;
    const fr = fill ? fill.getBoundingClientRect() : null;
    return {
      label: label ? label.textContent.trim() : null,
      pctText: pctEl ? pctEl.textContent.trim() : null,
      pctValue: pctEl ? num(pctEl.textContent) : null,
      fillW: fr ? Math.round(fr.width) : null,
      trackW: tr ? Math.round(tr.width) : null,
      ratio: (fr && tr && tr.width > 0) ? Math.round((fr.width / tr.width) * 100) : null,
      fillVar: fill ? getComputedStyle(fill).getPropertyValue('--fill-w').trim() : null,
    };
  });

  /* The row actions live in table CELLS, not thead. Read the first data row. */
  const firstRow = document.querySelector('.admin-page tbody tr');
  const rowActions = firstRow ? {
    hasGroup: !!firstRow.querySelector('.action-btn-group'),
    editHref: (() => { const a = firstRow.querySelector('a.action-btn.edit'); return a ? a.getAttribute('href') : null; })(),
    hasDelete: !!firstRow.querySelector('button.action-btn.delete'),
    hasToggle: !!firstRow.querySelector('button.action-btn.view'),
  } : null;

  return {
    path: location.pathname,
    heading: header ? header.textContent.trim() : null,
    crumbs,
    createHref: createBtn ? createBtn.getAttribute('href') : null,
    createText: createBtn ? createBtn.textContent.trim() : null,
    createTag: createBtn ? createBtn.tagName.toLowerCase() : null,
    chartCardCount: chartCards.length,
    chartCardRects: chartCards.map(rect),
    sidebarHeaderHidden: (() => {
      // The old PageHeader (.ph-head) must be gone — the Blade header replaces it.
      return !document.querySelector('.admin-page .ph-head');
    })(),
    donut: {
      rect: rect(donut),
      holeRect: rect(donutHole),
      seg1: donut ? donut.style.getPropertyValue('--seg1').trim() : null,
      backgroundImage: donut ? getComputedStyle(donut).backgroundImage.slice(0, 80) : null,
      number: (() => { const n = document.querySelector('.admin-page .donut-number'); return n ? n.textContent.trim() : null; })(),
    },
    legend,
    bars,
    rowActions,
    rowCount: document.querySelectorAll('.admin-page tbody tr').length,
    brokenImgs: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length,
  };
})()`);
report.listShot = await shot(dark ? 'medicines-list-dark' : 'medicines-list');

/* Cross-check the donut angle against the API's own numbers.
 *
 * ⚠️ The fetch must target the LARAVEL origin, not the page origin. The React
 * app runs on Vite (5173), which has NO `/api` proxy in dev — a same-origin
 * `fetch('/api/...')` 404s against Vite itself and the cross-check silently
 * reports "api 404". Use PROBE_API (defaults to the backend) instead.
 *
 * CORS: the backend's `config/cors.php` allows the Vite origin in dev, and the
 * bearer token rides in the header, so a cross-origin read is legitimate here.
 */
report.donutCrossCheck = await evaluate(`(async () => {
  const API = ${JSON.stringify(process.env.PROBE_API ?? 'http://127.0.0.1:8000')};
  const res = await fetch(API + '/api/admin/medicines?per_page=1', {
    headers: { Authorization: 'Bearer ' + localStorage.getItem('daway.admin.token'), Accept: 'application/json' },
  });
  if (!res.ok) return { error: 'api ' + res.status };
  const j = await res.json();
  const pct = j.data.stats.in_pharmacy_pct;
  const donut = document.querySelector('.admin-page .donut-chart-animated');
  const seg1 = donut ? donut.style.getPropertyValue('--seg1').trim() : null;
  const expected = (pct * 3.6).toFixed(1) + 'deg';
  return {
    apiPct: pct,
    expectedSeg1: expected,
    renderedSeg1: seg1,
    match: seg1 === expected,
    total: j.data.stats.total,
    donutNumberText: (() => { const n = document.querySelector('.admin-page .donut-number'); return n ? n.textContent.trim() : null; })(),
  };
})()`);

/* ── 2. The create form ─────────────────────────────────────────────────── */
await send('Page.navigate', { url: `${BASE}/admin/medicines/create` });
await waitFor(
  `location.pathname === '/admin/medicines/create' && !!document.querySelector('.admin-page .premium-card')`,
  'create form',
);

report.createForm = await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('.admin-page .premium-card input, .admin-page .premium-card select, .admin-page .premium-card textarea')];
  const nameInput = document.querySelector('.admin-page input#name_ar');
  const imageInput = document.querySelector('.admin-page input#image');
  const altSearch = document.querySelector('.admin-page input#alt_search');
  const submit = document.querySelector('.admin-page button.btn-submit');
  const cancel = document.querySelector('.admin-page a.btn-cancel');
  return {
    path: location.pathname,
    heading: (() => { const h = document.querySelector('.admin-page .page-heading h1'); return h ? h.textContent.trim() : null; })(),
    cardCount: document.querySelectorAll('.admin-page .premium-card').length,
    fieldIds: inputs.map(i => i.id || i.name).filter(Boolean),
    /* 🔴 Must be TEXT: a file input would mean the Cloudinary-URL design
       regressed back to a multipart upload this bundle cannot perform. */
    imageInputType: imageInput ? imageInput.type : null,
    hasAltSearch: !!altSearch,
    submitText: submit ? submit.textContent.trim() : null,
    cancelHref: cancel ? cancel.getAttribute('href') : null,
    nameRequired: nameInput ? nameInput.hasAttribute('required') || nameInput.getAttribute('aria-invalid') !== null : null,
  };
})()`);
report.createShot = await shot(dark ? 'medicines-create-dark' : 'medicines-create');

/* ── 3. The edit form for the first real row ────────────────────────────── */
const editHref = report.list?.rowActions?.editHref;
if (editHref) {
  await send('Page.navigate', { url: `${BASE}${editHref}` });
  await waitFor(
    `location.pathname.startsWith('/admin/medicines/') && location.pathname.endsWith('/edit') && !!document.querySelector('.admin-page input#name_ar') && document.querySelector('.admin-page input#name_ar').value.length > 0`,
    'edit form seeded',
  );

  report.editForm = await evaluate(`(() => {
    const nameInput = document.querySelector('.admin-page input#name_ar');
    const ingredient = document.querySelector('.admin-page input#active_ingredient');
    const image = document.querySelector('.admin-page input#image');
    const altCount = document.querySelector('.admin-page .med-alt-count');
    return {
      path: location.pathname,
      heading: (() => { const h = document.querySelector('.admin-page .page-heading h1'); return h ? h.textContent.trim() : null; })(),
      nameValue: nameInput ? nameInput.value : null,
      ingredientValue: ingredient ? ingredient.value : null,
      imageValue: image ? image.value : null,
      altCountText: altCount ? altCount.textContent.trim() : null,
      imagePreviewSrc: (() => { const i = document.querySelector('.admin-page .med-image-preview img'); return i ? i.getAttribute('src') : null; })(),
      submitText: (() => { const b = document.querySelector('.admin-page button.btn-submit'); return b ? b.textContent.trim() : null; })(),
      brokenImgs: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length,
    };
  })()`);
  report.editShot = await shot(dark ? 'medicines-edit-dark' : 'medicines-edit');
} else {
  report.editForm = { skipped: 'no edit href on the first row' };
}

console.log(JSON.stringify(report, null, 2));
socket.close();
chrome.kill();
process.exit(0);
