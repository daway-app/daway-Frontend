import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { createScanSessionApi } from './scanSessionApi';
import { parsePairingUrl } from './scanSessionTypes';

/**
 * The scan-session API is thin, but three things must be pinned:
 *  - the exact PATHS (they must match `routes/api.php`; a typo is a silent 404)
 *  - the "create captures the QR, poll does not" contract
 *  - `pairDirect` NEVER fabricates a device_token (that secret is the phone's)
 */

const BASE = 'https://api.test';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function setup(responses: Response[]) {
  const queue = [...responses];
  const fetchImpl = vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('no response left');
    return next;
  }) as unknown as typeof fetch;
  const client = createApiClient({
    getToken: () => 'tok-123',
    setToken: () => {},
    clearToken: () => {},
    refresh: async () => null,
    fetchImpl,
    baseUrl: BASE,
  });
  return { api: createScanSessionApi(client), fetchImpl };
}

function calls(fetchImpl: typeof fetch) {
  return (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls as [
    string,
    RequestInit,
  ][];
}

describe('createScanSessionApi — paths', () => {
  it('create POSTs to the collection with a Bearer token', async () => {
    const { api, fetchImpl } = setup([
      jsonResponse(
        {
          success: true,
          data: {
            id: 'sid-1',
            status: 'waiting',
            pairing_code: 'A7K92F4B',
            pairing_url: 'daway://pair?sid=sid-1&token=tk',
            pairing_qr_svg: '<svg/>',
            expires_at: '2026-10-16T18:05:00+00:00',
            seconds_remaining: 300,
            device: null,
            devices: [],
            pending_device: null,
            barcode: null,
          },
        },
        201,
      ),
    ]);

    const created = await api.create();

    expect(created.pairing_qr_svg).toBe('<svg/>');
    const [url, init] = calls(fetchImpl)[0];
    expect(url).toBe(`${BASE}/api/pharmacy/scan-sessions`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it('show GETs the session by id', async () => {
    const { api, fetchImpl } = setup([
      jsonResponse({ success: true, data: { id: 'sid-1', status: 'waiting', barcode: null } }),
    ]);

    await api.show('sid-1');

    const [url, init] = calls(fetchImpl)[0];
    expect(url).toBe(`${BASE}/api/pharmacy/scan-sessions/sid-1`);
    expect(init.method).toBe('GET');
  });

  it('close DELETEs the session', async () => {
    const { api, fetchImpl } = setup([
      jsonResponse({ success: true, message: 'تم إغلاق جلسة المسح', data: null }),
    ]);

    await api.close('sid-1');

    const [url, init] = calls(fetchImpl)[0];
    expect(url).toBe(`${BASE}/api/pharmacy/scan-sessions/sid-1`);
    expect(init.method).toBe('DELETE');
  });

  it('pairDirect POSTs to /pair and never invents a device_token', async () => {
    const { api, fetchImpl } = setup([
      jsonResponse({ success: true, data: { name: 'Pixel 7', platform: null } }),
    ]);

    const result = await api.pairDirect('sid-1', 'Pixel 7');

    const [url, init] = calls(fetchImpl)[0];
    expect(url).toBe(`${BASE}/api/pharmacy/scan-sessions/sid-1/pair`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ device_name: 'Pixel 7' });
    // The web half holds no device token — it must stay empty.
    expect(result.device_token).toBe('');
  });
});

describe('parsePairingUrl', () => {
  it('extracts sid + token from the query string', () => {
    expect(
      parsePairingUrl('daway://pair?sid=9c1f0a2e-3b4d&token=Xk3abc'),
    ).toEqual({ sid: '9c1f0a2e-3b4d', token: 'Xk3abc' });
  });

  it('percent-decodes values', () => {
    expect(parsePairingUrl('daway://pair?sid=a%20b&token=x%2Fy')).toEqual({
      sid: 'a b',
      token: 'x/y',
    });
  });

  it('returns null when either half is missing', () => {
    expect(parsePairingUrl('daway://pair?sid=only')).toBeNull();
    expect(parsePairingUrl('daway://pair?token=only')).toBeNull();
    expect(parsePairingUrl(null)).toBeNull();
    expect(parsePairingUrl('')).toBeNull();
  });
});
