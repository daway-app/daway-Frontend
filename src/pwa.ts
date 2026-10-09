/**
 * Service worker registration + update flow (item #70).
 *
 * ---------------------------------------------------------------------------
 * WHY PRODUCTION ONLY
 * ---------------------------------------------------------------------------
 * `public/sw.js` is copied verbatim into Vite's build output, but Vite ALSO
 * serves everything under `public/` at the dev server root — so `/sw.js`
 * exists in dev too and would happily register. That is undesirable:
 *
 *   · the SW's runtime cache would intercept HMR/dev rebuilds and serve stale
 *     modules, which is the classic "my edit didn't apply" trap, and
 *   · `skipWaiting()` + `controllerchange` reloads during dev fight with
 *     Vite's own reload, producing reload loops.
 *
 * So registration is gated on `import.meta.env.PROD`. The dev server never
 * installs a worker.
 *
 * ---------------------------------------------------------------------------
 * UPDATE FLOW — deliberately NO UI
 * ---------------------------------------------------------------------------
 * The project has a standing rule that nothing may be intrusive and that Light
 * Mode must not be disturbed. A "new version available" toast/banner on every
 * deploy is exactly the kind of nagging the rule forbids, and it interrupts a
 * pharmacist mid-task.
 *
 * Instead:
 *   1. `updatefound` → `installed` with an existing controller means a new
 *      worker is `waiting`.
 *   2. We post it `SKIP_WAITING`; the worker (public/sw.js) also self-skips on
 *      install, so either path takes over promptly without user action.
 *   3. `controllerchange` fires when the new worker takes control. We reload
 *      ONCE so the page runs the new bundle — guarded by a boolean so a second
 *      `controllerchange` cannot start a reload loop.
 *
 * The reload is the one visible effect, and only after a version change.
 */

let refreshing = false;

function activateWaitingWorker(registration: ServiceWorkerRegistration): void {
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      // A controller already exists → this new worker is an update, not the
      // very first install, so taking over and reloading is safe.
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        installing.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  });
}

/** Registers the SW in production only. Safe to call unconditionally. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        activateWaitingWorker(registration);
      })
      .catch(() => {
        /* Registration failures are non-fatal — the app works without a SW. */
      });
  });

  // Reload exactly once when a new worker takes control.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
