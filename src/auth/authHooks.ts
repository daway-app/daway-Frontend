import { createContext, useContext } from 'react';
import type { ApiStack } from './session';
import type { AuthUser } from './authContract';

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

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('[useAuth] Must be used inside <AuthProvider>.');
  }
  return context;
}
