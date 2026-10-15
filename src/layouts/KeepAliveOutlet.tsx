import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { lazyPage } from '@/routes/lazyPage';

/**
 * Keep-alive outlet for a SINGLE high-value page (Phase 3).
 *
 * Replaces the plain `<Outlet />` in AppLayout.tsx. Its ONLY job: when the user
 * navigates AWAY from `/accounting/sales/create` (the POS cart — 12 state atoms
 * per the audit, the most expensive page to lose), keep that page mounted but
 * visually hidden (display:none) so its in-memory state (cart lines, scanned
 * but unsaved quantities) survives. Returning re-reveals it instantly — no
 * remount, no catalogue refetch.
 *
 * HOW IT WORKS (deliberately boring):
 *   · The POS route in router.tsx renders NULL — the route match still exists
 *     (URL, guards, breadcrumbs all work), but the page component itself is
 *     mounted HERE, not by the Outlet.
 *   · Once visited, the POS component stays mounted in a hidden div while the
 *     Outlet renders whatever other route is active.
 *   · The POS chunk is lazy (lazyPage), so code splitting is preserved — the
 *     chunk loads on first POS visit, exactly like before.
 *
 * MEMORY BOUND: exactly one page is ever preserved, and it is this one.
 *
 * LIFECYCLE + AUTH:
 *   · This sits INSIDE <RequireAuth> (AppLayout), so a logout destroys the
 *     whole layout and the preserved POS instance dies with it — no leaked
 *     timers or fetches outlive the session.
 *   · The POS page has no polling (verified in the audit), so a hidden
 *     instance holds only closures, not intervals.
 *   · In-session cart persistence ACROSS logout is intentionally NOT provided:
 *     the cart is also written to sessionStorage via lib/drafts.ts, which IS
 *     identity-scoped and TTL-bound — the mounted instance is a convenience,
 *     the draft is the durable layer.
 */
const KEEP_ALIVE_PATH = '/accounting/sales/create';

// Lazy — same chunking behaviour as the route used to have.
const AccountingSaleCreatePage = lazyPage(() =>
  import('@/features/pharmacy/accounting/AccountingSaleCreatePage'),
);

export function KeepAliveOutlet() {
  const location = useLocation();
  const isPos = location.pathname === KEEP_ALIVE_PATH;

  // Mount-on-first-visit; initialised from the CURRENT location so a deep
  // link straight into the POS page mounts it on the very first render
  // (no flash of empty content).
  const [posMounted, setPosMounted] = useState(() => location.pathname === KEEP_ALIVE_PATH);

  if (isPos && !posMounted) {
    setPosMounted(true);
  }

  return (
    <>
      {/* Preserved POS instance — stays mounted once visited, hidden when the
          user is elsewhere. Rendered FIRST so the live route content paints
          above it in DOM order. */}
      <div style={isPos ? undefined : { display: 'none' }} data-keep-alive="pos-cart">
        {posMounted ? <AccountingSaleCreatePage /> : null}
      </div>

      {/* Every other route renders normally. When the current route IS the
          kept-alive one, the Outlet renders the route's null element and this
          div is hidden to avoid a double paint. */}
      <div style={isPos ? { display: 'none' } : undefined}>
        <Outlet />
      </div>
    </>
  );
}
