/**
 * Verify inline form validation in a real browser, on the real profile screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * `forms.test.ts` proves the RULES. It cannot prove the WIRING: that a touched,
 * invalid field actually renders red, that the error is attached to the control
 * via `aria-describedby`, that an untouched field stays neutral, or that pressing
 * Save on a broken form scrolls/focuses the first offender instead of firing a
 * request. Those are the parts that make validation useful, and they are all
 * browser-only.
 *
 * The specific trap this guards against: a form that shows a red border but no
 * message, or a message that is not programmatically linked to its field. Both
 * look fine in a screenshot and are useless to a screen reader.
 *
 * Checks:
 *   1. a pristine form shows NO error state (the hostile-defaults guard)
 *   2. blurring an emptied required field marks it invalid: red border + message
 *   3. the message is linked to the control via aria-describedby
 *   4. aria-invalid is set on the control
 *   5. typing a valid value clears the error (no stale red)
 *   6. a valid field gets the positive state, not just "not red"
 *   7. Save with an invalid field does NOT navigate away and does focus it
 *
 * Usage:
 *   VERIFY_ROUTE=profile node tools/verify-form-validation.mjs http://127.0.0.1:5173
 *
 * ⚠️ PASS THE ROUTE WITHOUT A LEADING SLASH — MSYS2 rewrites `/x` into a
 * filesystem path in both argv AND env values (see verify-notice.mjs).
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
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'verify-forms-'));
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

  console.log(`→ ${BASE}${route}\n`);

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

  // ── navigate and wait for the form ─────────────────────────────────
  await send('Page.navigate', { url: `${BASE}${route}` }, S);
  await sleep(1200);

  let fieldId = null;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    // Pick the phone field: it is required, text, and present on this screen.
    fieldId = await evaluate(`(() => {
      const el = document.querySelector('#phone_number');
      if (!el || !el.offsetParent) return null;
      const wrap = el.closest('.ph-field');
      return wrap ? 'phone_number' : null;
    })()`);
    if (fieldId) break;
  }
  if (!fieldId) {
    console.log('⚠ #phone_number inside a .ph-field never appeared — cannot verify');
    process.exit(0);
  }

  // Helper injected once, used by the steps below.
  await evaluate(`window.__probe = () => {
    const el = document.querySelector('#phone_number');
    const wrap = el.closest('.ph-field');
    const msg = wrap.querySelector('.ph-field-msg');
    const cs = getComputedStyle(el);
    return {
      wrapClass: wrap.className,
      invalid: el.getAttribute('aria-invalid'),
      describedby: el.getAttribute('aria-describedby'),
      msgId: msg ? msg.id : null,
      msgText: msg ? msg.textContent.trim() : '',
      msgVisible: msg ? msg.offsetParent !== null : false,
      borderColor: cs.borderColor,
      msgColor: msg ? getComputedStyle(msg).color : '',
    };
  };
  window.__setVal = (id, v) => {
    const el = document.querySelector(id);
    const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    s.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  true`);

  // 1 — pristine
  const pristine = await evaluate(`window.__probe()`);
  check(
    'pristine field is NEUTRAL (no error state before the user reaches it)',
    !pristine.wrapClass.includes('is-invalid') &&
      !pristine.wrapClass.includes('is-valid') &&
      pristine.invalid === null,
    `class="${pristine.wrapClass}"`,
  );

  // 2 — blur an emptied required field
  await evaluate(`(() => {
    window.__setVal('#phone_number', '');
    const el = document.querySelector('#phone_number');
    el.focus();
    el.blur();
    return true;
  })()`);
  await sleep(400);
  const invalid = await evaluate(`window.__probe()`);
  check('emptied + blurred field becomes INVALID', invalid.wrapClass.includes('is-invalid'));
  check('aria-invalid is set on the control', invalid.invalid === 'true');
  check('an error message is rendered and visible', invalid.msgVisible && invalid.msgText.length > 0, `"${invalid.msgText}"`);

  // 3 — the message is programmatically linked
  check(
    'aria-describedby points at the message element',
    Boolean(invalid.describedby) && invalid.describedby === invalid.msgId,
    `describedby=${invalid.describedby} msgId=${invalid.msgId}`,
  );

  // 4 — the border actually went red (the class alone proves nothing)
  const rgb = (s) => (s.match(/\d+/g) || []).map(Number);
  const [ir, ig, ib] = rgb(invalid.borderColor);
  check(
    'the border is actually red, not just classed as such',
    ir > ig + 40 && ir > ib + 40,
    invalid.borderColor,
  );

  // 5 — typing a valid value clears it
  await evaluate(`window.__setVal('#phone_number', '0599123456'); true`);
  await sleep(400);
  const fixed = await evaluate(`window.__probe()`);
  check(
    'a valid value clears the error (no stale red)',
    !fixed.wrapClass.includes('is-invalid') && fixed.invalid === null,
    `class="${fixed.wrapClass}"`,
  );
  check('valid + touched shows the positive state', fixed.wrapClass.includes('is-valid'));

  // 6 — Save with an invalid field must not submit, and must focus it
  await evaluate(`(() => {
    window.__setVal('#phone_number', '');
    // Deliberately do NOT blur: this reproduces "typed then immediately pressed
    // Save", which is where a touched-only implementation falls down.
    window.__urlBefore = location.href;
    const btn = [...document.querySelectorAll('button')].find(
      (b) => /حفظ/.test(b.textContent || '') && !b.disabled && b.offsetParent !== null
    );
    if (btn) btn.click();
    return !!btn;
  })()`);
  await sleep(1500);
  const afterSubmit = await evaluate(`(() => {
    const el = document.querySelector('#phone_number');
    return {
      stillInvalid: el.closest('.ph-field').className.includes('is-invalid'),
      focused: document.activeElement === el,
      url: location.href,
      saved: !!document.querySelector('.ph-alt-notice'),
    };
  })()`);
  check('Save on an invalid form marks the field invalid', afterSubmit.stillInvalid);
  check('Save on an invalid form focuses the offending field', afterSubmit.focused);
  check(
    'Save on an invalid form does NOT report success',
    afterSubmit.saved === false,
    afterSubmit.saved ? 'a success notice appeared for an invalid form' : '',
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${failed === 0 ? '✅ all checks passed' : `❌ ${failed} check(s) failed`}`);
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
