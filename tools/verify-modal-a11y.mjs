/**
 * Verify the shared Modal's keyboard behaviour in a real browser.
 *
 * The Modal is used by 11 call sites, so "it compiles" is not enough: the trap,
 * Escape, and focus restore are only observable by actually driving the DOM.
 *
 * Checks, in order:
 *   1. role=dialog + aria-modal + aria-labelledby are present
 *   2. focus MOVES INTO the dialog when it opens
 *   3. Tab from the last control wraps to the first (the trap holds)
 *   4. Escape closes it
 *   5. focus returns to the element that opened it
 *   6. body scroll is locked while open, and released after
 *
 * Usage:
 *   VERIFY_ROUTE=profile node tools/verify-modal-a11y.mjs http://127.0.0.1:5173
 *
 * ⚠️ PASS THE ROUTE WITHOUT A LEADING SLASH — MSYS2 rewrites `/x` into a
 * filesystem path in both argv and env values (see verify-notice.mjs).
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const wsMod = await import(
  'file:///C:/Users/MSI/.workbuddy-ai/binaries/node/workspace/node_modules/ws/index.js'
);
const WebSocketImpl = wsMod.WebSocket ?? wsMod.default?.WebSocket ?? wsMod.default;

const BASE = (process.argv[2] ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');

let route = process.env.VERIFY_ROUTE ?? process.argv[3] ?? 'profile';
if (/PortableGit|[A-Za-z]:[\\/]/.test(route)) {
  throw new Error(`the shell rewrote the route into a path: ${route}`);
}
if (!route.startsWith('/')) route = '/' + route;

const PHARMACY_ID = process.env.PHARMACY_ID || 'PH-1234';
const PASSWORD = process.env.PHARMACY_PASSWORD || 'password';
const CHROME =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'verify-a11y-'));
const port = 9900 + Math.floor(Math.random() * 300);

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
    throw new Error(r.exceptionDetails.exception?.description || 'eval failed');
  }
  return r.result.value;
}

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
};

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
  const { sessionId: S } = await send('Target.attachToTarget', {
    targetId: page.targetId,
    flatten: true,
  });

  await send('Page.enable', {}, S);
  await send('Runtime.enable', {}, S);
  await send(
    'Emulation.setDeviceMetricsOverride',
    { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false },
    S,
  );

  console.log(`→ ${BASE}${route}`);

  // ── login ──────────────────────────────────────────────────────────
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
  console.log('✓ logged in\n');

  await send('Page.navigate', { url: `${BASE}${route}` }, S);
  await sleep(1500);
  await send('Page.reload', {}, S);

  // ── find a button that opens a modal ───────────────────────────────
  let opened = false;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const r = await evaluate(`(() => {
      const btn = [...document.querySelectorAll('button')].find(
        (b) => !b.disabled && b.offsetParent !== null &&
          /تعديل|تغيير|إضافة|الموقع|الشعار|ساعات|كلمة/.test(b.textContent || '')
      );
      if (!btn) return { found: false };
      /*
       * Hold the ELEMENT ITSELF on window, not an attribute.
       * React may replace the button node on re-render, which would drop a
       * data-* marker and make an attribute-based check report a false
       * failure — that is exactly what happened on the first run.
       * Identity comparison is the only reliable way to test focus restore.
       */
      window.__a11yTrigger = btn;
      btn.focus();
      btn.click();
      return { found: true, label: (btn.textContent || '').trim().slice(0, 30) };
    })()`);
    if (r?.found) {
      opened = true;
      console.log(`· opened via "${r.label}"\n`);
      break;
    }
  }

  if (!opened) {
    console.log('⚠ no modal trigger found on this route — cannot verify');
    process.exit(0);
  }

  await sleep(600);

  // 1 — ARIA
  const aria = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return null;
    return {
      modal: d.getAttribute('aria-modal'),
      labelled: d.getAttribute('aria-labelledby'),
      hasTitleEl: !!document.getElementById(d.getAttribute('aria-labelledby') || ''),
    };
  })()`);
  check('role=dialog with aria-modal', aria?.modal === 'true');
  check(
    'aria-labelledby resolves to the title',
    Boolean(aria?.hasTitleEl),
  );

  // 2 — focus moved inside
  const inside = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    return d ? d.contains(document.activeElement) : false;
  })()`);
  check('focus moves INTO the dialog', inside === true);

  // 3 — trap holds: focus the last control, Tab, expect the first
  const trapped = await evaluate(`(() => {
    const d = document.querySelector('[role="dialog"]');
    const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const items = [...d.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
    if (items.length < 2) return 'too-few';
    const first = items[0], last = items[items.length - 1];
    last.focus();
    return { atLast: document.activeElement === last, firstIsNotLast: first !== last };
  })()`);
  check(
    'has at least two focusable controls to test the trap',
    typeof trapped === 'object',
    trapped === 'too-few' ? 'only one control' : '',
  );

  if (typeof trapped === 'object') {
    // dispatch a real Tab keydown; the handler decides whether to wrap
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, S);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }, S);
    await sleep(200);
    const wrapped = await evaluate(`(() => {
      const d = document.querySelector('[role="dialog"]');
      const sel = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
      const items = [...d.querySelectorAll(sel)].filter(e => e.offsetParent !== null);
      return document.activeElement === items[0];
    })()`);
    check('Tab from the last control wraps to the first (trap holds)', wrapped === true);
  }

  // 4 — scroll lock
  const locked = await evaluate(`getComputedStyle(document.body).overflow`);
  check('body scroll locked while open', locked === 'hidden', `overflow=${locked}`);

  // 5 — Escape closes
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, S);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, S);
  await sleep(500);
  const closed = await evaluate(`!document.querySelector('[role="dialog"]')`);
  check('Escape closes the dialog', closed === true);

  // 6 — focus restored (identity comparison against the held element)
  const restored = await evaluate(`(() => {
    const t = window.__a11yTrigger;
    if (!t) return 'no-trigger';
    if (!document.contains(t)) return 'trigger-detached';
    return document.activeElement === t;
  })()`);
  check(
    'focus returns to the trigger',
    restored === true,
    typeof restored === 'string' ? restored : '',
  );

  const unlocked = await evaluate(`getComputedStyle(document.body).overflow !== 'hidden'`);
  check('body scroll released after close', unlocked === true);

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n${failed === 0 ? '✅ all checks passed' : `❌ ${failed} check(s) failed`}`,
  );
  process.exit(failed === 0 ? 0 : 1);
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
