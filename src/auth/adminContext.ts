import { createContext, useContext } from 'react';
import { createAdminApiStack, type AdminApiStack } from './session';
import type { AdminUser } from '@/api/adminTypes';

/**
 * Admin contexts, the singleton stack, and the two hooks.
 *
 * WHY THIS IS A `.ts` FILE AND `adminAuth.tsx` IS NOT
 * ---------------------------------------------------
 * React Fast Refresh only works for a module that exports components and
 * nothing else. `adminAuth.tsx` exports the two provider components, so the
 * contexts (plain values) and the hooks (plain functions) live here instead —
 * the same split the pharmacy side uses (`AuthContext.tsx` for components,
 * `authHooks.ts` for contexts + hooks). Keeping them together would work, but
 * every edit to either would force a full page reload in development.
 *
 * ============================================================================
 * 🔴 THE ADMIN SESSION IS DELIBERATELY ISOLATED FROM THE PHARMACY SESSION
 * ============================================================================
 * An admin and a pharmacy are different principals and must never share a
 * token. Three separate things enforce that, and all three matter:
 *
 *  1. **A different localStorage key** — `daway.admin.token` vs `daway.token`
 *     (see `auth/tokenStorage.ts`). Signing in as an admin therefore does not
 *     disturb an open pharmacy session, and vice versa. If the two shared a key,
 *     opening the admin panel in another tab would silently log the pharmacist
 *     out of theirs.
 *
 *  2. **A separate `AdminApiStack`** — its own `TokenManager`, its own API
 *     client, its own listener set. Nothing is shared by reference, so a token
 *     rotation on one stack cannot notify subscribers of the other.
 *
 *  3. **No auto-refresh.** `refresh` resolves to `null` permanently: the admin
 *     API has no refresh endpoint (a pharmacy refresh route exists, an admin one
 *     does not). Pretending otherwise by reusing the pharmacy refresh call would
 *     send a pharmacy-shaped request with an admin token, so the stack is
 *     configured to be honest about the fact that an admin session simply ends
 *     when its token expires — and the UI handles that by redirecting to the
 *     admin login, not by trying to recover.
 *
 * The contexts are exported so the providers in `adminAuth.tsx` can reference
 * them, and the hooks are here so screens have one import path for both.
 */

export interface AdminAuthContextValue {
  user: AdminUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AdminUser>;
  logout: () => Promise<void>;
}

export const AdminApiContext = createContext<AdminApiStack | null>(null);
export const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/**
 * The singleton admin stack — created once, outside React, exactly like the
 * pharmacy one. The session-expired handler dispatches a DOM event rather than
 * calling `navigate()`, because this module has no router context.
 */
export const adminApiStack = createAdminApiStack({
  onSessionExpired: () => {
    window.dispatchEvent(new CustomEvent('daway:admin-session-expired'));
  },
});

/** Access the admin API client. */
export function useAdminApi(): AdminApiStack {
  const stack = useContext(AdminApiContext);
  if (!stack) {
    throw new Error('[useAdminApi] Must be used inside <AdminApiProvider>.');
  }
  return stack;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('[useAdminAuth] Must be used inside <AdminAuthProvider>.');
  }
  return context;
}
