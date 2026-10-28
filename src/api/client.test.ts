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

describe('download refresh cancellation and rate limiting', () => {
  it.each([
    ['caller', 'get'], ['timeout', 'get'],
    ['caller', 'download'], ['timeout', 'download'],
  ] as const)('cancels the %s waiter, cleans up, and lets a shared %s refresh finish', async (reason, peerKind) => {
    vi.useFakeTimers();
    const add = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    try {
      let finish!: (token: string) => void;
      const refresh = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
      const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
        jsonResponse({}, (init?.headers as Record<string, string>).Authorization === 'Bearer new' ? 200 : 401),
      );
      const clearToken = vi.fn();
      const expired = vi.fn();
      const client = createApiClient({
        getToken: () => 'old', setToken: () => {}, clearToken, onSessionExpired: expired,
        refresh, fetchImpl, baseUrl: BASE, downloadTimeoutMs: 1000,
      });
      const caller = new AbortController();
      const pending = client.download('/cancelled', { signal: caller.signal });
      const rejected = expect(pending).rejects.toMatchObject({ kind: 'timeout' });
      await vi.advanceTimersByTimeAsync(0);
      const internal = fetchImpl.mock.calls[0][1]!.signal!;
      await vi.advanceTimersByTimeAsync(500);
      const peer = client[peerKind]('/peer');
      await vi.advanceTimersByTimeAsync(0);
      expect(refresh).toHaveBeenCalledOnce();
      if (reason === 'caller') caller.abort();
      else await vi.advanceTimersByTimeAsync(500);
      await rejected;
      expect(vi.getTimerCount()).toBe(peerKind === 'download' ? 1 : 0);
      for (const [index, [event, listener]] of add.mock.calls.entries()) {
        const signal = add.mock.contexts[index];
        if (signal === caller.signal || signal === internal) {
          expect(remove.mock.calls.some((args, i) => remove.mock.contexts[i] === signal && args[0] === event && args[1] === listener)).toBe(true);
        }
      }
      finish('new');
      if (peerKind === 'download') await expect(peer).resolves.toBeInstanceOf(Blob);
      else await expect(peer).resolves.toEqual({});
      expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
        `${BASE}/cancelled`, `${BASE}/peer`, `${BASE}/peer`,
      ]);
      expect(clearToken).not.toHaveBeenCalled();
      expect(expired).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('cleans the refresh listener and timer after success', async () => {
    vi.useFakeTimers();
    const add = vi.spyOn(AbortSignal.prototype, 'addEventListener');
    const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    try {
      const fetchImpl = fetchQueue([jsonResponse({}, 401), new Response('file')]);
      const client = createApiClient({
        getToken: () => 'old', setToken: () => {}, clearToken: () => {},
        refresh: async () => 'new', fetchImpl, baseUrl: BASE,
      });
      await client.download('/file');
      const signal = vi.mocked(fetchImpl).mock.calls[0][1]!.signal!;
      const index = add.mock.contexts.indexOf(signal);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(remove.mock.calls.some((args, i) => remove.mock.contexts[i] === signal && args[1] === add.mock.calls[index][1])).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it.each([
    ['numeric', '30', 30],
    ['HTTP-date', 'Wed, 28 Oct 2026 10:00:30 GMT', 30],
    ['missing', undefined, undefined],
    ['invalid', 'not-a-date', undefined],
  ] as const)('preserves %s Retry-After without retrying a 429, including after refresh', async (_name, header, seconds) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
    try {
      for (const afterRefresh of [false, true]) {
        const response = jsonResponse({}, 429, header ? { 'Retry-After': header } : {});
        const fetchImpl = fetchQueue(afterRefresh ? [jsonResponse({}, 401), response] : [response]);
        const refresh = vi.fn(async () => 'new');
        const clearToken = vi.fn();
        const client = createApiClient({ getToken: () => 'old', setToken: () => {}, clearToken, refresh, fetchImpl, baseUrl: BASE });
        await expect(client.download('/limited')).rejects.toMatchObject({
          kind: 'rate_limited', status: 429, retryAfterSeconds: seconds,
        });
        expect(fetchImpl).toHaveBeenCalledTimes(afterRefresh ? 2 : 1);
        expect(refresh).toHaveBeenCalledTimes(afterRefresh ? 1 : 0);
        expect(clearToken).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
      }
    } finally {
      vi.useRealTimers();
    }
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

/**
 * F4 regression suite (Phase 1B.2).
 *
 * `download()` used to call `fetch` bare — no timeout, no cancellation. A socket
 * that stalled after the headers left the returned promise pending FOREVER: the
 * caller's spinner never stopped, no error reached the UI, and navigating away
 * could not release it.
 *
 * These tests pin the new guarantees: a download-specific budget, caller
 * cancellation, error normalisation through `ApiError`, and — as importantly —
 * that neither the timer nor the abort listener leaks on any exit path.
 */
describe('createApiClient — download reliability', () => {
  function clientWith(fetchImpl: typeof fetch, downloadTimeoutMs = 60_000) {
    return createApiClient({
      getToken: () => 'tok-123',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
      downloadTimeoutMs,
    });
  }

  /**
   * A fetch stub that never answers but honours the abort signal exactly like a
   * real fetch — including a signal that was ALREADY aborted before the call.
   * Without a signal it would hang forever, which is the old behaviour.
   */
  function stallingFetch(): typeof fetch {
    return vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) return;
          if (signal.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
  }

  it('returns the body as a Blob with the auth and Accept headers', async () => {
    const blob = new Blob(['xlsx-bytes'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fetchImpl = vi.fn(
      async () => new Response(blob, { status: 200 }),
    ) as unknown as typeof fetch;
    const client = clientWith(fetchImpl);

    const result = await client.download('/api/template');

    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(blob.size);

    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect((init as RequestInit).headers).toMatchObject({
      Accept: '*/*',
      Authorization: 'Bearer tok-123',
    });
    // A binary body must not be labelled as JSON.
    expect((init as RequestInit).headers).not.toHaveProperty('Content-Type');
  });

  it('normalises an HTTP failure into ApiError (403 → forbidden)', async () => {
    const fetchImpl = fetchQueue([jsonResponse({ message: 'nope' }, 403)]);
    const client = clientWith(fetchImpl);

    await expect(client.download('/api/receipt')).rejects.toMatchObject({
      kind: 'forbidden',
      status: 403,
    });
  });

  it('times out a stalled request instead of hanging forever', async () => {
    // A 30 ms budget keeps the test fast; the mechanism is the same as 3 min.
    const client = clientWith(stallingFetch(), 30);

    await expect(client.download('/api/receipt')).rejects.toMatchObject({
      kind: 'timeout',
      status: null,
    });
  });

  /**
   * G1 — the budget must cover the BODY, not just the headers.
   *
   * The dangerous variant of the bug is invisible to a headers-only test: a
   * server answers `200 OK` immediately and then stalls while transmitting. If
   * the implementation cleared its timer right after `fetch()` resolved, the
   * promise would hang forever with headers already received — exactly the
   * symptom this whole change set exists to remove.
   *
   * A `Response` constructed in-process is NOT tied to the fetch signal, so this
   * mock wires the abort to the body itself: headers resolve at once, while
   * `blob()` stays pending until the signal aborts and then rejects with
   * `AbortError` — what a browser does when the socket dies mid-body.
   */
  function headersThenStallingBody(): typeof fetch {
    return vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      const body = new Promise<Blob>((_resolve, reject) => {
        const fail = () => {
          signal?.removeEventListener('abort', fail);
          reject(new DOMException('Aborted', 'AbortError'));
        };
        if (signal?.aborted) {
          fail();
          return;
        }
        signal?.addEventListener('abort', fail);
      });

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        blob: vi.fn(() => body),
      } as unknown as Response);
    }) as unknown as typeof fetch;
  }

  it('keeps the timeout armed while the response BODY is consumed (G1)', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = headersThenStallingBody();
      const client = clientWith(fetchImpl, 5_000);

      const pending = client.download('/api/big-report');
      // Attach first so the rejection is never unhandled.
      const assertion = expect(pending).rejects.toMatchObject({
        kind: 'timeout',
        status: null,
      });

      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );

      // 1) fetch resolves: HEADERS are in, the BODY is still pending.
      await vi.advanceTimersByTimeAsync(0);
      expect(
        (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls,
      ).toHaveLength(1);
      expect(settled).toBe(false);

      // 2) One millisecond BEFORE the budget: still pending. This is the step
      //    that fails if the timer were cleared once headers arrived — the
      //    promise would stay pending past every advance below.
      await vi.advanceTimersByTimeAsync(4_999);
      expect(settled).toBe(false);

      // 3) The BODY budget expires → abort → blob() rejects → ApiError(timeout).
      await vi.advanceTimersByTimeAsync(1);
      await assertion;

      // 4) No timer survives the exit path.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  it('maps a network failure to kind "network"', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    await expect(clientWith(fetchImpl).download('/api/x')).rejects.toMatchObject(
      { kind: 'network', status: null },
    );
  });

  it('supports caller cancellation via an AbortSignal', async () => {
    const controller = new AbortController();
    const client = clientWith(stallingFetch(), 60_000);

    const pending = client.download('/api/receipt', { signal: controller.signal });
    controller.abort();

    // The error architecture has no `cancelled` kind, so an abort is reported as
    // `timeout` — the same convention `request()` uses for a caller abort.
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const client = clientWith(stallingFetch(), 60_000);

    await expect(
      client.download('/api/receipt', { signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('releases its timeout timer on success (no leak)', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        async () => new Response(new Blob(['ok']), { status: 200 }),
      ) as unknown as typeof fetch;
      const client = clientWith(fetchImpl, 60_000);

      const pending = client.download('/api/x');
      await vi.advanceTimersByTimeAsync(0);

      await expect(pending).resolves.toBeInstanceOf(Blob);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('releases its timeout timer after an HTTP failure (no leak)', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = fetchQueue([jsonResponse({ message: 'boom' }, 500)]);
      const client = clientWith(fetchImpl, 60_000);

      const pending = client.download('/api/x');
      // Attach the assertion BEFORE advancing so the rejection is never unhandled.
      const assertion = expect(pending).rejects.toMatchObject({
        kind: 'server',
        status: 500,
      });
      await vi.advanceTimersByTimeAsync(0);
      await assertion;

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * G2 — caller cancellation while `blob()` is mid-stream.
   *
   * The existing `supports caller cancellation` test uses `stallingFetch()`
   * which never resolves *headers* — it rejects at the `fetch()` level. But
   * the real danger is: headers arrive (200 OK), body starts streaming, and
   * the caller aborts during `blob()`. This test pins that path: the abort
   * listener is wired to the internal controller, `blob()` rejects with
   * `AbortError`, the error maps to `timeout`, and the listener + timer are
   * cleaned up in `finally`.
   */
  it('rejects and cleans up when the caller aborts during blob() (G2)', async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = headersThenStallingBody();
      const client = clientWith(fetchImpl, 60_000);

      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, 'addEventListener');
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const pending = client.download('/api/x', { signal: controller.signal });

      // Attach first so the rejection is never unhandled.
      const assertion = expect(pending).rejects.toMatchObject({
        kind: 'timeout',
        status: null,
      });

      // 1) fetch resolves: HEADERS are in, BODY is still pending.
      await vi.advanceTimersByTimeAsync(0);
      const response = await vi.mocked(fetchImpl).mock.results[0].value;
      expect(response.blob).toHaveBeenCalledTimes(1);

      // 2) Caller aborts while blob() is still waiting on the body.
      controller.abort();

      // 3) The download must reject — not hang.
      await assertion;

      // 4) No timer or listener leak.
      expect(vi.getTimerCount()).toBe(0);
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * G3a — 401 on download triggers a refresh + retry, mirroring request().
   */
  it('refreshes and retries a 401 on download (G3a: refresh succeeds)', async () => {
    const blob = new Blob(['xlsx-bytes'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const fetchImpl = fetchQueue([
      jsonResponse({ message: 'Unauthorized' }, 401), // initial 401
      new Response(blob, { status: 200 }), // retry after refresh succeeds
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
      downloadTimeoutMs: 60_000,
    });

    const result = await client.download('/api/template');

    expect(result).toBeInstanceOf(Blob);
    expect(refresh).toHaveBeenCalledTimes(1);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect((calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer new-token',
    });
  });

  /**
   * G3a — refresh fails → `clearToken()` + `onSessionExpired()` fire once.
   */
  it('clears token and signals session expiry when download 401s and refresh fails (G3a)', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ message: 'Unauthorized' }, 401),
    ]);
    const clearToken = vi.fn();
    const onSessionExpired = vi.fn();

    const client = createApiClient({
      getToken: () => 'expired-token',
      setToken: () => {},
      clearToken,
      refresh: async () => null, // refresh refused
      onSessionExpired,
      fetchImpl,
      baseUrl: BASE,
      downloadTimeoutMs: 60_000,
    });

    await expect(client.download('/api/template')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });

    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    // Refresh was attempted exactly once (not retried).
    // The `refresh` mock itself tracks this — it should have been called once.
  });

  /**
   * G3a — still 401 after refresh → session ends exactly once (no double notification).
   */
  it('ends the session exactly once when download stays 401 after refresh (G3a)', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ message: 'Unauthorized' }, 401), // initial 401
      jsonResponse({ message: 'Unauthorized' }, 401), // retry still 401
    ]);
    const refresh = vi.fn(async () => 'new-token');
    const clearToken = vi.fn();
    const onSessionExpired = vi.fn();

    const client = createApiClient({
      getToken: () => 'old-token',
      setToken: () => {},
      clearToken,
      refresh,
      onSessionExpired,
      fetchImpl,
      baseUrl: BASE,
      downloadTimeoutMs: 60_000,
    });

    await expect(client.download('/api/template')).rejects.toMatchObject({
      kind: 'unauthorized',
      status: 401,
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clearToken).toHaveBeenCalledTimes(1);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  /**
   * G3b — 429 on download preserves `Retry-After` as `retryAfterSeconds`.
   * No automatic backoff or retry is expected — this only pins the parse+forward path.
   */
  it('preserves Retry-After as retryAfterSeconds on a 429 download (G3b)', async () => {
    const fetchImpl = fetchQueue([
      jsonResponse({ message: 'Too many requests' }, 429, { 'Retry-After': '30' }),
    ]);

    const client = createApiClient({
      getToken: () => 'tok',
      setToken: () => {},
      clearToken: () => {},
      refresh: async () => null,
      fetchImpl,
      baseUrl: BASE,
      downloadTimeoutMs: 60_000,
    });

    await expect(client.download('/api/big-report')).rejects.toMatchObject({
      kind: 'rate_limited',
      status: 429,
      retryAfterSeconds: 30,
    });
  });
});
