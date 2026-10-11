import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/auth/adminContext';
import { ADMIN_ROUTES } from './adminPaths';
import { ROUTES } from './paths';

/**
 * Admin route guards.
 *
 * ============================================================================
 * 🔴 WHAT THIS GUARD IS — AND IS NOT
 * ============================================================================
 * This is a UX gate, NOT a security boundary. It only decides which screen to
 * render. The actual protection is `auth:sanctum` + `role:admin` on every
 * `/api/admin/*` route: a non-admin token gets 403 from the server even if it
 * somehow reached the page.
 *
 * That distinction matters: a client-side guard can be bypassed by anyone who
 * edits the bundle, so the server must never rely on it — and it does not.
 *
 * ============================================================================
 * 🔴 THERE IS NO SEPARATE ADMIN LOGIN SCREEN ANY MORE
 * ============================================================================
 * A signed-out admin is sent to the UNIFIED `/login`, which carries the role
 * switch that decides which endpoint is called. Keeping a second admin-only
 * login around meant two doors to the same session, and the redundant one
 * (`/admin/login`) was reported as having no reason to exist.
 *
 * `state.from` is still passed so that an admin who was deep in the panel lands
 * back on the page they asked for, rather than the dashboard.
 */

/** Gate for authenticated admin areas. */
export function RequireAdmin() {
  const { isAuthenticated } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ROUTES.login}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}

/**
 * Kept only so the legacy `/admin/login` URL can bounce into the unified
 * screen instead of 404-ing for anyone with a bookmark. It performs no
 * authentication of its own.
 */
export function RedirectAdminLoginToUnified() {
  const { isAuthenticated } = useAdminAuth();
  const location = useLocation();

  return (
    <Navigate
      to={isAuthenticated ? ADMIN_ROUTES.dashboard : ROUTES.login}
      replace
      state={{ from: location.pathname }}
    />
  );
}
