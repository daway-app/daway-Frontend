import { RouterProvider } from 'react-router-dom';
import { ApiProvider, AuthProvider } from '@/auth/AuthContext';
import { AdminApiProvider, AdminAuthProvider } from '@/auth/adminAuth';
import { router } from '@/routes/router';

/**
 * Application root.
 *
 * Provider order matters:
 *   ApiProvider → AuthProvider → AdminApiProvider → AdminAuthProvider
 *   → RouterProvider
 * so that route guards can read auth state.
 *
 * WHY THE ADMIN PROVIDERS ARE MOUNTED HERE TOO
 * --------------------------------------------
 * The admin panel lives in the same document as the pharmacy app (one Vite
 * build, one router) but must NOT share its session — see `auth/adminAuth.tsx`.
 * Both stacks are mounted side by side and are entirely independent:
 *
 *   · pharmacy: `ApiProvider` + `AuthProvider`  → `daway.token`
 *   · admin:    `AdminApiProvider` + `AdminAuthProvider` → `daway.admin.token`
 *
 * Mounting them together is what makes `/admin/*` reachable at all — the admin
 * guards call `useAdminAuth()`, which throws without `AdminAuthProvider` above
 * it. It is deliberately NOT done per-route: a provider inside the admin branch
 * would unmount on navigating away from `/admin` and drop the admin session's
 * React state (the localStorage token would survive, but the subscriber set and
 * the loaded user would not).
 *
 * The session-expiry watcher is a layout route *inside* the router tree (see
 * `router.tsx`) — it cannot live here, because `useNavigate()` throws outside
 * a router context.
 */
export function App() {
  return (
    <ApiProvider>
      <AuthProvider>
        <AdminApiProvider>
          <AdminAuthProvider>
            <RouterProvider router={router} />
          </AdminAuthProvider>
        </AdminApiProvider>
      </AuthProvider>
    </ApiProvider>
  );
}
