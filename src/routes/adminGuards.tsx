import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/auth/adminContext';
import { ADMIN_ROUTES } from './adminPaths';

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
 */

/** Gate for authenticated admin areas. */
export function RequireAdmin() {
  const { isAuthenticated } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate
        to={ADMIN_ROUTES.login}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}

/** Gate for the admin login screen — a signed-in admin is sent inward. */
export function RequireAdminGuest() {
  const { isAuthenticated } = useAdminAuth();

  if (isAuthenticated) {
    return <Navigate to={ADMIN_ROUTES.dashboard} replace />;
  }

  return <Outlet />;
}
