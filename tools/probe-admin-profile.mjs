/**
 * Verify the React admin PROFILE page + PASSWORD-CHANGE screen against the
 * LOCAL Laravel backend, in headless Chrome.
 *
 * WHAT IT PROVES (with measurement, not eyeballing)
 *   · `/admin/profile` renders inside the admin shell and hydrates from
 *     `GET /api/admin/profile` (real name/email/phone from the local DB);
 *   · the avatar falls back to the initial tile when `avatar_url` is null;
 *   · the "change password" control is a real router link to
 *     `/admin/profile/password` (an <a>, not a <button>);
 *   · the password screen mounts with three password inputs.
 *
 * It does NOT submit a password change: doing so deletes ALL admin tokens in
 * the real DB, which would invalidate the token seeded here mid-run. The
 * submit path is already proven by curl in the shell (200 + 401 afterwards).
 *
 * Seeds `localStorage['daway.admin.token']` — `isAuthenticated()` is
 * `token !== null` and does NOT verify with the server (auth/session.ts).
 *
 * Usage:
 *   node tools/probe-admin-profile.mjs
 *   node tools/probe-admin-profile.mjs --dark
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.PROBE_BASE ?? 'http://localhost:5173';
const dark = process.argv.includes('--dark');

const token = readFileSync(new URL('./__token.txt', import.meta.url), 'utf8').trim();
if (!token) throw new Error('tools/__token.txt is empty — mint an admin token first.');

const profileDir = mkdtempSync(join(process.env.TEMP ?? tmpdir(), 'cdp-adminprofile-'));
const port = 9900 + Math.floor(Math.random() * 90);

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--hide-scrollbars',
  '--window-size=1500,1200',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      // `/json/list` gives TARGETS (pages). `/json/version` is the BROWSER
      // endpoint and does not expose the `Page` domain.
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
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr.slice(0, 120));
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: 1500, height: 1200, deviceScaleFactor: 1, mobile: false,
});

/* Seed the token BEFORE the app boots so RequireAdmin lets the page in. */
await send('Page.navigate', { url: `${BASE}/` });
await sleep(1500);
await evaluate(`localStorage.setItem('daway.admin.token', ${JSON.stringify(token)}); true;`);
/* Apply dark mode the SAME way the app does: the `theme` localStorage key
   plus the `.dark-mode` class on <body>/<html> (see lib/theme.ts). Setting only
   `data-theme` left the app in light mode, so the earlier dark shot was a
   duplicate of the light one — a probe bug, not a CSS bug. */
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

/** Wait on a CONDITION (never a fixed sleep) — the local serve is single
 *  threaded over a remote DB, so a cold call can take tens of seconds. */
const waitFor = async (expr, label, ms = 150000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evaluate(expr)) return true;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${label}`);
};

const report = {};

/* ── Profile page ───────────────────────────────────────────────────────── */
await send('Page.navigate', { url: `${BASE}/admin/profile` });
await waitFor(
  `location.pathname === '/admin/profile' && !!document.querySelector('.admin-page .adp-facts')`,
  'profile facts',
);

report.profile = await evaluate(`(() => {
  const facts = [...document.querySelectorAll('.adp-fact')].map(f => {
    const dt = f.querySelector('dt');
    const dd = f.querySelector('dd');
    const dr = dd ? dd.getBoundingClientRect() : null;
    const lr = dt ? dt.getBoundingClientRect() : null;
    return {
      label: dt ? dt.textContent.trim() : null,
      value: dd ? dd.textContent.trim() : null,
      stackGap: (dr && lr) ? Math.round(dr.top - lr.bottom) : null,
      centreDelta: (dr && lr) ? Math.round(Math.abs((dr.left + dr.width / 2) - (lr.left + lr.width / 2))) : null,
    };
  });
  const card = document.querySelector('.adp-card');
  const banner = document.querySelector('.adp-banner');
  const av = document.querySelector('.adp-avatar');
  const img = av ? av.querySelector('img') : null;
  const actions = [...document.querySelectorAll('.adp-actions .ph-btn')];
  const cr = card ? card.getBoundingClientRect() : null;
  const br = banner ? banner.getBoundingClientRect() : null;
  const ar = av ? av.getBoundingClientRect() : null;
  const factsEl = document.querySelector('.adp-facts');
  const fr = factsEl ? factsEl.getBoundingClientRect() : null;
  const actr = document.querySelector('.adp-actions');
  const ar2 = actr ? actr.getBoundingClientRect() : null;
  return {
    path: location.pathname,
    insideAdminShell: !!document.querySelector('.app-layout .sidebar-pro'),
    sidebarProfileLink: (() => {
      const a = document.querySelector('.sidebar-pro a[href="/admin/profile"]');
      return a ? a.textContent.trim() : null;
    })(),
    facts,
    cardWidth: cr ? Math.round(cr.width) : null,
    cardCentredDelta: cr ? Math.round(Math.abs((cr.left + cr.width / 2) - (document.documentElement.clientWidth / 2))) : null,
    bannerGradient: banner ? getComputedStyle(banner).backgroundImage.slice(0, 60) : null,
    /* The overlap: the avatar's top must sit ABOVE the banner's bottom. */
    avatarOverlapPx: (ar && br) ? Math.round(br.bottom - ar.top) : null,
    avatarIsImg: !!img,
    avatarInitial: av && !img ? av.textContent.trim() : null,
    avatarCss: ar ? { w: Math.round(ar.width), h: Math.round(ar.height) } : null,
    /* Ordering: facts must sit BELOW the avatar, actions BELOW the facts. */
    factsBelowAvatar: (fr && ar) ? fr.top >= ar.bottom - 2 : null,
    actionsBelowFacts: (ar2 && fr) ? ar2.top >= fr.bottom - 2 : null,
    actionCount: actions.length,
    actionTexts: actions.map(b => b.textContent.trim()),
    disabledActions: actions.map(b => b.disabled),
    hasPhotoNote: !!document.querySelector('.adp-note'),
    brokenImgs: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length,
  };
})()`);
report.profileShot = await shot(dark ? 'profile-dark' : 'profile');

/* ── Navigate via the real button (click, not a fresh URL) ──────────────── */
await evaluate(`(() => {
  const a = document.querySelector('.adp-actions a[href="/admin/profile/password"]');
  if (!a) throw new Error('password CTA not found');
  a.click();
  return true;
})()`);
await waitFor(
  `location.pathname === '/admin/profile/password' && document.querySelectorAll('.admin-password-form input[type=password], .admin-password-form input[type=text]').length >= 3`,
  'password form',
);

report.password = await evaluate(`(() => {
  const form = document.querySelector('.admin-password-form');
  const inputs = form ? [...form.querySelectorAll('input')] : [];
  const back = form ? form.querySelector('a[href="/admin/profile"]') : null;
  const submit = form ? form.querySelector('button[type=submit]') : null;
  return {
    path: location.pathname,
    inputCount: inputs.length,
    inputNames: inputs.map(i => i.name),
    allMasked: inputs.filter(i => i.type === 'password').length,
    submitText: submit ? submit.textContent.trim() : null,
    backHref: back ? back.getAttribute('href') : null,
    hasRulesHint: !!document.querySelector('.admin-password-form .info-hint'),
  };
})()`);
report.passwordShot = await shot(dark ? 'profile-password-dark' : 'profile-password');

console.log(JSON.stringify(report, null, 2));
socket.close();
chrome.kill();
process.exit(0);
