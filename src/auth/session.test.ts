import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminApiStack, createApiStack } from './session';

describe('refresh through the session and storage contract', () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = new Map([
      ['daway.auth.token', 'old-pharmacy'],
      ['daway.admin.token', 'admin-token'],
    ]);
    vi.stubGlobal('window', { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: vi.fn((key: string) => values.delete(key)),
    } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(['request', 'download'] as const)('persists a root refresh token for the next %s', async (mode) => {
    const seen: string[] = [];
    let first = true;
    const fetchImpl = vi.fn(async (url, init) => {
      seen.push((init?.headers as Record<string, string>).Authorization);
      if (String(url).endsWith('/api/refresh-token')) {
        return new Response(JSON.stringify({ success: true, token: 'new-pharmacy' }));
      }
      if (first) {
        first = false;
        return new Response('{}', { status: 401 });
      }
      return new Response('{}');
    }) as typeof fetch;
    const expired = vi.fn();
    const stack = createApiStack({ fetchImpl, baseUrl: 'https://api.test', onSessionExpired: expired });
    await stack.client[mode]('/file');
    await stack.client[mode]('/next');
    expect(seen).toEqual(['Bearer old-pharmacy', 'Bearer old-pharmacy', 'Bearer new-pharmacy', 'Bearer new-pharmacy']);
    expect(stack.tokens.get()).toBe('new-pharmacy');
    expect(values.get('daway.auth.token')).toBe('new-pharmacy');
    expect(values.get('daway.admin.token')).toBe('admin-token');
    expect(expired).not.toHaveBeenCalled();
  });

  it.each(['request', 'download'] as const)('expires once when the real internal refresh returns 401 for %s', async (mode) => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response('{}', { status: 401 }));
    const expired = vi.fn();
    const stack = createApiStack({ fetchImpl, baseUrl: 'https://api.test', onSessionExpired: expired });
    await expect(stack.client[mode]('/file')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0]).toBe('https://api.test/api/refresh-token');
    expect(window.localStorage.removeItem).toHaveBeenCalledWith('daway.auth.token');
    expect(vi.mocked(window.localStorage.removeItem).mock.calls.filter(([key]) => key === 'daway.auth.token')).toHaveLength(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(stack.tokens.get()).toBeNull();
    expect(values.get('daway.admin.token')).toBe('admin-token');
  });

  it('ends an admin download session without calling the pharmacy refresh endpoint', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 401 }));
    const expired = vi.fn();
    const stack = createAdminApiStack({ fetchImpl, baseUrl: 'https://api.test', onSessionExpired: expired });
    await expect(stack.client.download('/receipt')).rejects.toMatchObject({ kind: 'unauthorized' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(stack.tokens.get()).toBeNull();
    expect(values.get('daway.auth.token')).toBe('old-pharmacy');
  });

  it('shares one failed internal refresh and one expiry across a request and download', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL) => new Response('{}', { status: 401 }));
    const expired = vi.fn();
    const stack = createApiStack({ fetchImpl, baseUrl: 'https://api.test', onSessionExpired: expired });
    const results = await Promise.allSettled([stack.client.get('/json'), stack.client.download('/file')]);
    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
    expect(fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/api/refresh-token'))).toHaveLength(1);
    expect(expired).toHaveBeenCalledOnce();
    expect(vi.mocked(window.localStorage.removeItem).mock.calls.filter(([key]) => key === 'daway.auth.token')).toHaveLength(1);
  });
});
