/* Public content-hashed Vite assets only. Navigations and API responses are
 * always network-only, so neither authenticated data nor old HTML is cached. */
const VERSION = 'daway-web-v2';
const FINGERPRINTED_ASSET = /^\/assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(js|css)$/;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION && key.startsWith('daway-web-')).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !FINGERPRINTED_ASSET.test(url.pathname)) return;

  event.respondWith((async () => {
    let cache;
    try {
      cache = await caches.open(VERSION);
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch {
      // Cache storage may be unavailable in private or low-storage contexts.
    }
    try {
      const response = await fetch(request);
      const type = response.headers.get('content-type') || '';
      const expectedType = url.pathname.endsWith('.css') ? /text\/css/i : /(?:javascript|ecmascript)/i;
      if (cache && response.ok && response.type === 'basic' && expectedType.test(type)) {
        try {
          await cache.put(request, response.clone());
        } catch {
          // A full or unavailable cache must not block a successful response.
        }
      }
      return response;
    } catch {
      return new Response('', { status: 504, statusText: 'Gateway Timeout' });
    }
  })());
});
