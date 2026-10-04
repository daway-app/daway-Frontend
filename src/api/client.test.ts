import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError } from './errors';

/**
 * The 401 path is the most fragile part of the client. These tests pin down:
 *  - exactly ONE refresh for N concurrent 401s (single-flight)
 *  - exactly ONE retry after a successful refresh
 *  - NO refresh loop, and a cleared token, once refresh fails
 */

const BASE = 'https://api.test';

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

/** A fetch stub driven by a queue of responses. */
function fetchQueue(responses: Response[]) {
  const queue = [...responses];
  return vi.fn(async () => {
    const next = queue.shift();
    if (!next) throw new Error('fetchQueue: no response left');
    return next;
  }) as unknown as typeof fetch;
}

describe('createApiClient — happy path', () => {
  it('attaches the Bearer token and Accept header', async () => {
    const fetchImpl = fetchQueue([jsonResponse({ success: true, data: { ok: 1 } })]);
    const client = createApiClient({
      getToken: () => 'tok-123',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    const result = await client.get<{ success: true; data: unknown }>('/api/x');

    expect(result.data).toEqual({ ok: 1 });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Accept: 'application/json',
      Authorization: 'Bearer tok-123',
    });
  });

  it('omits Authorization when skipAuth is set', async () => {
    const fetchImpl = fetchQueue([jsonResponse({ ok: true })]);
    const client = createApiClient({
      getToken: () => 'tok-123',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    await client.post('/api/login/pharmacy', { a: 1 }, { skipAuth: true });

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).headers).not.toHaveProperty('Authorization');
  });
});

describe('createApiClient — 401 handling', () => {
  it('refreshes once, retries once, and succeeds', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ message: 'Unauthorized' }, 401), // original request
      jsonResponse({ success: true, data: { ok: true } }), // retry after refresh
    ]);
    const refresh = vi.fn(async () => 'new-token');
    const setToken = vi.fn();

    const client = createApiClient({
      getToken: () => 'old-token',
      setToken,
      clearToken: () => {},
      refresh,
      fetchImpl,
      baseUrl: BASE,
    });

    const result = await client.get<{ success: true; data: { ok: boolean } }>(
      '/api/x',
    );

    // The client returns the raw envelope — unwrapping is the caller's concern.
    expect(result.data.ok).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    // Retry used the refreshed token.
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });

  it('runs exactly ONE refresh for concurrent 401s (single-flight)', async () => {
    const fetchImpl = vi.fn(async () => {
      // First round: every call 401s. Later calls succeed.
      const count = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
        .length;
      if (count <= 3) return jsonResponse({ message: 'Unauthorized' }, 401);
      return jsonResponse({ success: true, data: { ok: true } });
    }) as unknown as typeof fetch;

    let refreshCount = 0;
    const refresh = vi.fn(async () => {
      refreshCount += 1;
      await new Promise((r) => setTimeout(r, 10)); // simulate latency
      return 'fresh';
    });

    const client = createApiClient({
      getToken: () => 'expired',
      setToken: () => {},
      clearToken: () => {},
      refresh,
      fetchImpl,
      baseUrl: BASE,
    });

    const results = await Promise.all([
      client.get('/api/a'),
      client.get('/api/b'),
      client.get('/api/c'),
    ]);

    expect(results).toHaveLength(3);
    // Three concurrent failures → ONE refresh, not three.
    expect(refreshCount).toBe(1);
  });

  it('clears the token and surfaces the error when refresh fails', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse(
        { success: false, message: 'انتهت صلاحية الجلسة نهائياً، يرجى تسجيل الدخول من جديد' },
        401,
      ),
    ]);
    const clearToken = vi.fn();
    const onSessionExpired = vi.fn();

    const client = createApiClient({
      getToken: () => 'expired',
      setToken: () => {},
      clearToken,
      refresh: async () => null, // chain cap reached / refresh refused
      onSessionExpired,
      fetchImpl,
      baseUrl: BASE,
    });

    await expect(client.get('/api/x')).rejects.toBeInstanceOf(ApiError);

    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when skipRefresh is set', async () => {
    const fetchImpl = fetchQueue([jsonResponse({ message: 'Unauthorized' }, 401)]);
    const refresh = vi.fn(async () => 'should-not-be-used');
    const clearToken = vi.fn();

    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken,
      refresh,
      fetchImpl,
      baseUrl: BASE,
    });

    await expect(
      client.post('/api/refresh-token', undefined, { skipRefresh: true }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('createApiClient — failure mapping', () => {
  it('maps 422 to validation with field errors', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse(
        { message: 'البيانات غير صحيحة', errors: { pharmacy_id: ['مطلوب'] } },
        422,
      ),
    ]);
    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    await expect(client.get('/api/x')).rejects.toMatchObject({
      kind: 'validation',
      status: 422,
      errors: { pharmacy_id: ['مطلوب'] },
    });
  });

  it('maps a network failure to kind "network"', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    await expect(client.get('/api/x')).rejects.toMatchObject({
      kind: 'network',
      status: null,
    });
  });

  it('preserves Retry-After on 429', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ message: 'Too many' }, 429, { 'Retry-After': '30' }),
    ]);
    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    await expect(client.get('/api/x')).rejects.toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 30,
    });
  });

  it('handles 204 with no body', async () => {
    const fetchImpl = fetchQueue([new Response(null, { status: 204 })]);
    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    await expect(client.delete('/api/x')).resolves.toBeUndefined();
  });

  it('serialises query params and drops empty ones', async () => {
    const fetchImpl = fetchQueue([jsonResponse({ ok: true })]);
    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
    });

    await client.get('/api/x', { query: { page: 2, search: undefined, active: true } });

    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string;
    expect(url).toContain('page=2');
    expect(url).toContain('active=true');
    expect(url).not.toContain('search=');
  });
});
