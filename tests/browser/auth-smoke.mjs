/** Browser UI smoke tests with a mocked API and mocked Google SDK; no real auth. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const origin = 'http://127.0.0.1:4179';
const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '4179', '--strictPort'], {
  stdio: 'inherit', env: { ...process.env, VITE_API_BASE_URL: origin, VITE_GOOGLE_CLIENT_ID: 'test-client.invalid' },
});
let browser;
try {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Vite server stopped');
    try { if ((await fetch(origin)).ok) break; } catch { /* server is starting */ }
    if (i === 99) throw new Error('Vite server did not start');
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let callback;
    window.google = { accounts: { id: {
      initialize(config) { callback = config.callback; },
      renderButton(element) {
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = 'Mock Google';
        button.addEventListener('click', () => callback({ credential: 'fake-google-token' }));
        element.append(button);
      },
    } } };
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push({ path, authorization: request.headers().authorization ?? null, body: request.postDataJSON() });
    const reply = (value) => route.fulfill({ json: value });
    if (path === '/api/auth/patient/login') return reply({ success: true, data: { user: { id: 9, name: 'Test Patient', role: 'patient' }, token: 'fake-patient-token' } });
    if (path === '/api/auth/patient/me') return reply({ success: true, data: { user: { id: 9, name: 'Test Patient', role: 'patient' } } });
    if (path === '/api/logout') return reply({ success: true });
    if (path === '/api/auth/google/challenge') return reply({ nonce: 'a'.repeat(64), expires_in: 300 });
    if (path === '/api/auth/google/register-pharmacy') return reply({ success: true, data: { pharmacy_id: 'PH-TEST', status: 'pending_approval', is_active: false } });
    if (path === '/api/auth/google/recover-pharmacy') return reply({ message: 'ok' });
    return route.fulfill({ status: 404, json: { message: 'mock endpoint not found' } });
  });

  await page.goto(`${origin}/patient/login`);
  await page.locator('#patient-id').fill('patient@example.test');
  await page.locator('#patient-password').fill('StrongPassword123');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await page.getByRole('heading', { name: 'مرحبًا Test Patient' }).waitFor();
  await page.reload();
  await page.getByRole('heading', { name: 'مرحبًا Test Patient' }).waitFor();
  await page.getByRole('button', { name: 'تسجيل الخروج' }).click();
  await page.getByRole('heading', { name: 'دخول المريض' }).waitFor();
  assert.equal(requests.find((r) => r.path === '/api/auth/patient/login').authorization, null);
  assert.equal(requests.find((r) => r.path === '/api/auth/patient/me').authorization, 'Bearer fake-patient-token');
  assert.equal(requests.find((r) => r.path === '/api/logout').authorization, 'Bearer fake-patient-token');

  await page.goto(`${origin}/register`);
  await page.locator('#pharmacyNameInput').fill('Test Pharmacy');
  await page.locator('#registerPhoneInput').fill('0591234567');
  await page.locator('#regionInput').fill('Gaza');
  await page.locator('#registerPasswordInput').fill('StrongPassword123');
  await page.locator('#registerConfirmInput').fill('StrongPassword123');
  await page.locator('#registerSubmitBtn').click();
  await page.getByRole('button', { name: 'Mock Google' }).click();
  await page.getByText('PH-TEST').waitFor();
  const pharmacy = requests.find((r) => r.path === '/api/auth/google/register-pharmacy');
  assert.equal(pharmacy.body.id_token, 'fake-google-token');
  assert.equal(pharmacy.body.nonce, 'a'.repeat(64));
  assert.equal(pharmacy.authorization, null);

  await page.goto(`${origin}/forgot-password`);
  await page.locator('#pharmacy-recovery-password').fill('NewPassword123');
  await page.locator('#pharmacy-recovery-confirm').fill('NewPassword123');
  await page.getByRole('button', { name: 'متابعة باستخدام Google' }).click();
  await page.getByRole('button', { name: 'Mock Google' }).click();
  await page.getByText('تم تغيير كلمة المرور.', { exact: false }).waitFor();
  assert.equal(requests.find((r) => r.path === '/api/auth/google/recover-pharmacy').authorization, null);
  assert.deepEqual(errors, []);
  console.log('Browser UI smoke passed using mocked API and Google SDK.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
