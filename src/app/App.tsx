import { RouterProvider } from 'react-router-dom';
import { ApiProvider, AuthProvider } from '@/auth/AuthContext';
import { router } from '@/routes/router';

/**
 * Application root.
 *
 * Provider order matters:
 *   ApiProvider → AuthProvider → RouterProvider
 * so that route guards can read auth state.
 *
 * The session-expiry watcher is a layout route *inside* the router tree (see
 * `router.tsx`) — it cannot live here, because `useNavigate()` throws outside
 * a router context.
 */
export function App() {
  return (
    <ApiProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ApiProvider>
  );
}
