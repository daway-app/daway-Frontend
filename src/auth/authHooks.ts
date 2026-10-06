import { createContext, useContext, useMemo } from 'react';
import type { ApiStack } from './session';
import type { AuthUser } from './authContract';
import type { PharmacyApi } from '@/api/pharmacyApi';

/**
 * Bind every method of an API object to its owner.
 *
 * Without this, `const { customersForPicker } = useApi().pharmacy` would call
 * the method with `this === undefined` and the internal `this.customers(...)`
 * call would throw at runtime — a defect that TypeScript cannot catch.
 */
function bindAll<T extends object>(api: T): T {
  const bound: Record<string, unknown> = {};
  for (const key of Object.keys(api)) {
    const value = (api as Record<string, unknown>)[key];
    bound[key] = typeof value === 'function' ? value.bind(api) : value;
  }
  return bound as T;
}

/**
 * Contexts + hooks, separated from the provider components.
 *
 * Keeping these out of `AuthContext.tsx` means that file exports only
 * components, so React Fast Refresh works correctly during development.
 */

export interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (pharmacyId: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const ApiStackContext = createContext<ApiStack | null>(null);
export const AuthContext = createContext<AuthContextValue | null>(null);

/** Access the API client from anywhere in the tree. */
export function useApi(): ApiStack {
  const stack = useContext(ApiStackContext);
  if (!stack) {
    throw new Error('[useApi] Must be used inside <ApiProvider>.');
  }
  return stack;
}

/**
 * The pharmacy-bound API, with bound methods.
 *
 * `useApi().pharmacy` returns the same object, but destructuring its methods
 * loses `this` — which breaks the one method that calls a sibling
 * (`customersForPicker` → `this.customers`). This hook returns a stable,
 * fully-bound API so screens can safely destructure.
 */
export function usePharmacyApi(): PharmacyApi {
  const stack = useApi();
  return useMemo(() => bindAll(stack.pharmacy), [stack]);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('[useAuth] Must be used inside <AuthProvider>.');
  }
  return context;
}
