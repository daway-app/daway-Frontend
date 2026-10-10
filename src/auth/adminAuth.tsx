import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AdminUser } from '@/api/adminTypes';
import { AdminApiContext, AdminAuthContext, adminApiStack } from './adminContext';
import type { AdminAuthContextValue } from './adminContext';

/**
 * Admin auth — a parallel context to the pharmacy one.
 *
 * Kept in its own file (rather than extending `AuthContext.tsx`) for two reasons:
 *   · the two sessions have different user shapes (`AdminUser` has an email,
 *     `AuthUser` has a pharmacy_id);
 *   · a single shared context would force every pharmacy screen to depend on
 *     admin state, and vice versa, which is exactly the coupling this whole
 *     separate-stack design avoids.
 *
 * STRUCTURE (mirrors the pharmacy side exactly)
 * ---------------------------------------------
 *   · `adminContext.ts`  — contexts + the singleton stack + the hook CONTRACT
 *                          (types, and the `useAdminApi`/`useAdminAuth` hooks)
 *   · `adminAuth.tsx`    — THIS FILE: providers only (components)
 *
 * Why the split matters: a module that exports both components and plain values
 * defeats React Fast Refresh — editing it forces a full reload instead of a hot
 * update, which is the exact reason `authHooks.ts` exists on the pharmacy side.
 * This file therefore exports components ONLY.
 *
 * See `adminContext.ts` for why the admin token lives under a different
 * localStorage key and why there is no admin refresh endpoint.
 */

export function AdminApiProvider({ children }: { children: ReactNode }) {
  return createElement(AdminApiContext.Provider, { value: adminApiStack }, children);
}

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => adminApiStack.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    adminApiStack.isAuthenticated(),
  );

  useEffect(() => {
    return adminApiStack.subscribe((snapshot) => {
      setUser(snapshot.user);
      setIsAuthenticated(snapshot.isAuthenticated);
    });
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      login: (email, password) => adminApiStack.login(email, password),
      logout: () => adminApiStack.logout(),
    }),
    [user, isAuthenticated],
  );

  return createElement(AdminAuthContext.Provider, { value }, children);
}
