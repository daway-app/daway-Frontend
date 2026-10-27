import { RouterProvider } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { ApiProvider, AuthProvider } from '@/auth/AuthContext';
import { AdminApiProvider, AdminAuthProvider } from '@/auth/adminAuth';
import { LanguageProvider } from '@/lib/lang/LanguageContext';
import { router } from '@/routes/router';
import { ErrorBoundary } from '@/routes/RouteErrorBoundary';

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
    /**
     * OUTERMOST boundary.
     *
     * `errorElement` in the router only catches throws INSIDE the route tree.
     * A throw during the initial mount of these providers — a bad token in
     * localStorage, a `?lang=` value the store rejects, any hook bug in auth
     * setup — happens BEFORE the router exists, so it had no boundary at all
     * and blanked the document. This wrapper is the floor under everything.
     *
     * It renders the crash screen WITHOUT a language provider above it, which
     * is why `CrashScreen` reads `LangContext` defensively and falls back to
     * Arabic instead of calling `useLang()`.
     */
    <ErrorBoundary>
      {/* QueryClientProvider sits ABOVE ApiProvider/AuthProvider so the query
          cache outlives auth churn but can still be cleared at logout/login. */}
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ApiProvider>
            <AuthProvider>
              <AdminApiProvider>
                <AdminAuthProvider>
                  <RouterProvider router={router} />
                </AdminAuthProvider>
              </AdminApiProvider>
            </AuthProvider>
          </ApiProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
