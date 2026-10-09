/* ==========================================================================
   Daway Pharmacy Web — service worker (item #70)
   ==========================================================================
   Plain JS, NO build step, NO workbox. This repo vendors rather than adds
   dependencies (see index.html: Chart.js is a copied UMD file in
   public/vendor/, Font Awesome is a CDN link) — the SW follows the same
   spirit: a single hand-written file, copied to the build output by Vite
   because it lives in public/.



   --------------------------------------------------------------------------
   🔴 THE CACHING RULE THIS FILE MUST OBEY (found in the backend repo)
   --------------------------------------------------------------------------
   The sibling Laravel repo (daway-backend/public/sw.js) carries a documented,
   deliberate security rule. Quoting its v6 note verbatim:

     "v6 (أمني): منع تسرّب HTML المصادَق بين المستخدمين.
      السبب: كان الـ SW يخزّن صفحات /pharmacy/* و /profile المصادَق عليها في
      كاش واحد بمفتاح URL فقط (Cache API لا يعرف الكوكيز/الجلسة). فلو زار
      مستخدم A صفحة ما، ثم سجّل مستخدم B دخوله على نفس المتصفح وكانت الشبكة
      أبطأ من مهلة السباق، كان `return cached` يخدم HTML الخاص بـ A إلى B.
      الحل: لا تخزين ولا إعادة تقديم لأي HTML مصادَق إطلاقاً — تنقّل
      network-only دائماً، مع إبقاء الكاش للأصول الثابتة العامة فقط، والأوفلاين
      الحقيقي يعتمد على IndexedDB (resources/js/offline/*) لا على HTML مخزَّن."

   In English, the rule is: the Cache API is keyed by URL and is per-origin,
   NOT per-session — it cannot see cookies or the Bearer token. Caching an
   authenticated HTML page (a pharmacy's dashboard) under a URL key means a
   second pharmacy logging in on the same browser/profile can be served the
   FIRST pharmacy's page when the network loses the race. So:

     ▶ Navigations (HTML) are NETWORK-ONLY. This SW never reads and never
       writes HTML into any cache. True offline comes from IndexedDB in the
       app layer, not from a cached HTML shell.

   This file complies with that rule in `handleFetch()` below — the navigate
   branch does not touch caches at all (not even a fallback shell, because
   this repo has no public /offline shell and we must not invent a cached
   HTML fallback).

   --------------------------------------------------------------------------
   WHY THERE IS NO HARDCODED PRECACHE LIST
   --------------------------------------------------------------------------
   Vite emits content-hashed filenames (`assets/index-<hash>.js`). A SW cannot
   hardcode those names without a build step that rewrites the SW. Options:

     a) generate the list at build time  → needs a build plugin (adds tooling)
     b) hardcode a list                  → WRONG: the names change every build
     c) no list, runtime-cache instead   → this file

   We choose (c): the simplest thing that is correct. Static assets are
   cached the FIRST time the browser requests them and served cache-first
   afterwards (see handleFetch). The trade-off: a cold first visit is not
   offline-capable for assets the user has not touched yet. That is acceptable
   here because (a) it needs no tooling, and (b) it cannot go stale the way a
   hardcoded hashed list would — a stale list would serve an OLD bundle.

   Bump VERSION on any change to evict old caches.
   ========================================================================== */

const VERSION = 'daway-web-v1';

/* Static, PUBLIC, non-hashed paths only. These are safe to precache: they are
   the same bytes for every user and carry no session. Deliberately NO HTML. */
const PRECACHE_URLS = [
  '/manifest.webmanifest',
  '/vendor/chart.umd.js',
  '/images/dawak-logo-256.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      // Take over as soon as installed so a waiting worker never strands the
      // user on an old version. The page side pairs this with a
      // `controllerchange` reload guard (see src/pwa.ts) to avoid reload loops.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION && k.startsWith('daway-web-')).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/* Same-origin, non-hashed static extensions. Cache-first, fill on miss. */
const STATIC_EXTENSIONS = /\.(css|js|mjs|png|jpg|jpeg|webp|svg|gif|ico|woff2?|ttf|eot)$/i;

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only GET is ever cacheable.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Font Awesome CDN, etc.) — never intercept.
  if (url.origin !== self.location.origin) return;

  /*
    --- The security rule, enforced. ---
    Navigations (request.mode === 'navigate') are the requests that carry the
    authenticated HTML of a pharmacy. Per the backend rule quoted above they
    MUST be network-only: no cache read, no cache write, no cached HTML
    fallback. Done here by simply not calling respondWith — the browser does a
    normal network fetch, and this worker never sees the bytes.
  */
  if (request.mode === 'navigate') return;

  // The API is never cached (it is session-scoped JSON, same leak class as
  // HTML). Also skip the dev-server and Vite HMR endpoints.
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/@') || url.pathname.startsWith('/src/')) return;

  // The SW itself must always come from the network, or it can never update.
  if (url.pathname === '/sw.js') return;

  if (STATIC_EXTENSIONS.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            // Only cache same-origin, OK, basic responses.
            if (response && response.ok && response.type === 'basic') {
              const clone = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, clone));
            }
            return response;
          })
          .catch(() => new Response('', { status: 504, statusText: 'Gateway Timeout' }));
      }),
    );
  }
});
