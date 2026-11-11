import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) };
  const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue(['daway-web-v1', 'other']), delete: vi.fn().mockResolvedValue(true) };
  const response = { ok: true, type: 'basic', headers: { get: () => 'application/javascript' }, clone: () => ({}) };
  const fetch = vi.fn().mockResolvedValue(response);
  const self = { location: { origin: 'https://dawak.test' }, clients: { claim: vi.fn() }, skipWaiting: vi.fn(), addEventListener: (name: string, fn: (event: unknown) => void) => { handlers[name] = fn; } };
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, caches, fetch, URL, Response });
  return { handlers, caches, cache, fetch, response };
}

describe('service worker cache policy', () => {
  it('never intercepts HTML, API, or unversioned static files', () => {
    const { handlers } = worker();
    for (const [pathname, mode] of [['/login', 'navigate'], ['/api/private.js', 'cors'], ['/vendor/chart.umd.js', 'cors'], ['/assets/app.js', 'cors']]) {
      const respondWith = vi.fn();
      handlers.fetch({ request: { method: 'GET', mode, url: 'https://dawak.test' + pathname }, respondWith });
      expect(respondWith).not.toHaveBeenCalled();
    }
  });

  it('caches fingerprinted JS without caching an HTML fallback', async () => {
    const { handlers, cache, response } = worker();
    let result: Promise<unknown> | undefined;
    const event = { request: { method: 'GET', mode: 'cors', url: 'https://dawak.test/assets/index-12345678.js' }, respondWith: (value: Promise<unknown>) => { result = value; } };
    handlers.fetch(event);
    await result;
    expect(cache.put).toHaveBeenCalledTimes(1);
    cache.put.mockClear();
    response.headers.get = () => 'text/html';
    handlers.fetch(event);
    await result;
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('removes the old application cache when the new worker activates', async () => {
    const { handlers, caches } = worker();
    let result: Promise<unknown> | undefined;
    handlers.activate({ waitUntil: (value: Promise<unknown>) => { result = value; } });
    await result;
    expect(caches.delete).toHaveBeenCalledWith('daway-web-v1');
    expect(caches.delete).not.toHaveBeenCalledWith('other');
  });
});
