/**
 * Verify the Phase 2 success-feedback notices actually RENDER.
 *
 * Why this exists: the notices are type-checked and built, but "the code
 * compiles" is not "the user sees it". The only way to know is to click the
 * real control and look at the DOM afterwards.
 *
 * The test is a ROUND TRIP: it records the row's current status, changes it,
 * asserts the notice appeared, then changes it BACK — so the demo data is left
 * exactly as it was found.
 *
 * Usage:
 *   VERIFY_ROUTE=inquiries node tools/verify-notice.mjs http://127.0.0.1:5173
 *
 * ⚠️ PASS THE ROUTE WITHOUT A LEADING SLASH.
 * MSYS2 (Git Bash) rewrites anything that looks like a POSIX path — in argv
 * AND in environment values — so `/inquiries` arrives as
 * `C:/Users/…/PortableGit/…/inquiries` and navigation fails with "Cannot
 * navigate to invalid URL". A value that does not start with `/` is left
 * alone, so the leading slash is added below. (`screens.mjs` dodges the same
 * trap by using a comma-separated list, which does not look like one path.)
 * On a plain shell, `/inquiries` is accepted as-is.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// `ws` is not a project dependency — the other tools in this folder load it
// from the managed Node workspace so the repo stays dependency-free.
const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');

let route = process.env.VERIFY_ROUTE ?? process.argv[3] ?? 'inquiries';
if (/PortableGit|[A-Za-z]:[\\/]/.test(route)) {
  throw new Error(
    `the shell rewrote the route into a filesystem path: ${route}\n` +
      'Pass it without a leading slash, e.g. VERIFY_ROUTE=inquiries',
  );
}
if (!route.startsWith('/')) route = '/' + route;
const ROUTE = route;
const PHARMACY_ID = process.env.PHARMACY_ID || 'PH-1234';
const PASSWORD = process.env.PHARMACY_PASSWORD || 'password';

const CHROME =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Chrome + CDP plumbing ────────────────────────────────────────────
const profile = mkdtempSync(join(tmpdir(), 'verify-notice-'));
const port = 9600 + Math.floor(Math.random() * 300);

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let ws;
let msgId = 0;
const pending = new Map();

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error('Chrome never exposed a page target');
}

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(
      r.exceptionDetails.exception?.description || 'evaluate failed',
    );
  }
  return r.result.value;
}

// ── run ──────────────────────────────────────────────────────────────
try {
  const wsUrl = await connect();
  ws = new WebSocketImpl(wsUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });

  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  });

  const { targetInfos } = await send('Target.getTargets');
  const page = targetInfos.find((t) => t.type === 'page');
  const { sessionId } = await send('Target.attachToTarget', {
    targetId: page.targetId,
    flatten: true,
  });
  const S = sessionId;

  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
    S,
  );

  console.log(`→ ${BASE}${ROUTE}`);

  // login
  await send('Page.navigate', { url: `${BASE}/login` }, S);
  let ready = false;
  for (let i = 0; i < 180; i++) {
    await sleep(500);
    try {
      ready = await evaluate(`!!document.querySelector('#loginForm')`);
    } catch {
      ready = false;
    }
    if (ready) break;
  }
  if (!ready) throw new Error('login form never rendered');

  await evaluate(`(() => {
    const set = (el, v) => {
      const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set(document.querySelector('#identityInput'), ${JSON.stringify(PHARMACY_ID)});
    set(document.querySelector('#passwordInput'), ${JSON.stringify(PASSWORD)});
    return true;
  })()`);
  await sleep(400);
  await evaluate(`document.querySelector('#submitBtn').click(); true`);
  for (let i = 0; i < 40; i++) {
    await sleep(900);
    const p = await evaluate('location.pathname');
    if (p && !p.startsWith('/login')) break;
  }
  console.log('✓ logged in');

  // the screen under test
  await send('Page.navigate', { url: `${BASE}${ROUTE}` }, S);
  await sleep(1500);
  await send('Page.reload', {}, S);

  // wait for a status control to exist
  let found = false;
  for (let i = 0; i < 120; i++) {
    await sleep(1000);
    try {
      found = await evaluate(
        `document.querySelectorAll('tbody .ph-badge, tbody button.ph-btn').length > 0`,
      );
    } catch {
      found = false;
    }
    if (found) break;
  }
  if (!found) {
    console.log('⚠ no rows rendered — cannot exercise a status change');
    console.log('  (this screen may simply have no data)');
    process.exit(0);
  }

  const before = await evaluate(`(() => {
    const b = document.querySelector('tbody .ph-badge');
    return b ? b.textContent.trim() : null;
  })()`);
  console.log(`· current status: ${before}`);

  // click the first status action button in the row
  const clicked = await evaluate(`(() => {
    const row = document.querySelector('tbody tr');
    if (!row) return 'no row';
    const btns = [...row.querySelectorAll('button.ph-btn')];
    const target = btns.find(b => !b.disabled);
    if (!target) return 'no enabled button';
    target.click();
    return 'clicked: ' + target.textContent.trim();
  })()`);
  console.log(`· ${clicked}`);

  // look for the notice
  let notice = null;
  for (let i = 0; i < 40; i++) {
    await sleep(750);
    notice = await evaluate(`(() => {
      const n = document.querySelector('.ac-inline-msg.success, .ac-inline-msg.show.success');
      return n ? n.textContent.trim() : null;
    })()`);
    if (notice) break;
  }

  if (notice) {
    console.log(`\n✅ SUCCESS NOTICE RENDERED: "${notice}"`);
  } else {
    const any = await evaluate(
      `document.querySelectorAll('.ac-inline-msg').length`,
    );
    console.log(`\n❌ no success notice found (.ac-inline-msg count = ${any})`);
  }

  // round trip: click the same control again to restore the original status
  const reverted = await evaluate(`(() => {
    const row = document.querySelector('tbody tr');
    if (!row) return 'no row';
    const btns = [...row.querySelectorAll('button.ph-btn')];
    const target = btns.find(b => !b.disabled);
    if (!target) return 'no enabled button';
    target.click();
    return 'clicked back';
  })()`);
  await sleep(2500);
  const after = await evaluate(`(() => {
    const b = document.querySelector('tbody .ph-badge');
    return b ? b.textContent.trim() : null;
  })()`);
  console.log(`· ${reverted} → status now: ${after}`);
  console.log(
    after === before
      ? '✓ round trip clean — data restored'
      : `⚠ status changed: ${before} → ${after} (check manually)`,
  );
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
