import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/authHooks';
import { ROUTES } from './paths';

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
 * Gate for public-only routes (login). A signed-in user is redirected inward.
 */
export function RequireGuest() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return <Outlet />;
}
