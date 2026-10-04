import { Outlet } from 'react-router-dom';
import { useSessionExpiryRedirect } from './useSessionExpiryRedirect';

/**
 * Bridges the React-free API stack to navigation.
 *
 * MUST live inside the router tree — `useSessionExpiryRedirect` calls
 * `useNavigate()`, which throws outside a router context and would take the
 * whole app down. It is mounted as a layout route so it sits inside
 * `<RouterProvider>` while rendering nothing of its own.
 */
export function SessionExpiryWatcher() {
  useSessionExpiryRedirect();
  return <Outlet />;
}
