import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/authHooks';
import { useAdminAuth } from '@/auth/adminContext';
import { ROUTES } from './paths';
import { guestRedirect } from './guestGate';

/**
 * Route guards, written as layout routes.
 *
 * They render an `<Outlet />` when access is allowed, which lets the router
 * nest them over a group of routes instead of wrapping each element.
 */

/**
 * Gate for authenticated areas.
 *
 * Unauthenticated users are sent to login, remembering where they were headed
 * so they can be returned there after signing in.
 */
export function RequireAuth() {
  const { isAuthenticated } = useAuth();
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
 * Gate for the unified `/login` route.
 *
 * 🔴 IT MUST KNOW ABOUT **BOTH** SESSIONS, NOT JUST THE PHARMACY ONE.
 * `/login` serves two roles — the pharmacy form and the admin form — so
 * "already signed in" is true when EITHER token is present. An earlier version
 * only checked the pharmacy token (`useAuth`), which produced a real, reported
 * bug: an admin who already held a valid `daway.admin.token` was still shown
 * the login screen, and because the layout never redirected, a fresh admin
 * sign-in appeared to do nothing at all.
 *
 * The decision itself lives in `guestGate.ts` so it can be pinned by a test in
 * this DOM-less suite; this component only supplies the two sessions.
 */
export function RequireGuest() {
  const { isAuthenticated: pharmacySignedIn } = useAuth();
  const { isAuthenticated: adminSignedIn } = useAdminAuth();

  const to = guestRedirect({ pharmacySignedIn, adminSignedIn });
  if (to) return <Navigate to={to} replace />;

  return <Outlet />;
}
