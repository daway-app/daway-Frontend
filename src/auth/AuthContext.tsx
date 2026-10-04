import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createApiStack } from './session';
import { ApiStackContext, AuthContext, type AuthContextValue } from './authHooks';
import type { AuthUser } from './authContract';

/**
 * Single API stack for the app, plus the React bindings over it.
 *
 * The stack owns the token and the HTTP client; React only reads the derived
 * session state and calls login/logout.
 */

/** Create the stack once, outside React, so it survives re-renders. */
const apiStack = createApiStack({
  onSessionExpired: () => {
    // Navigation is handled by `useSessionExpiryRedirect`; this keeps the
    // stack itself free of any React dependency.
    window.dispatchEvent(new CustomEvent('daway:session-expired'));
  },
});

export function ApiProvider({ children }: { children: ReactNode }) {
  return (
    <ApiStackContext.Provider value={apiStack}>{children}</ApiStackContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => apiStack.getUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    apiStack.isAuthenticated(),
  );

  useEffect(() => {
    return apiStack.subscribe((snapshot) => {
      setUser(snapshot.user);
      setIsAuthenticated(snapshot.isAuthenticated);
    });
  }, []);

  const login = useCallback(async (pharmacyId: string, password: string) => {
    return apiStack.login(pharmacyId, password);
  }, []);

  const logout = useCallback(async () => {
    await apiStack.logout();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated, login, logout }),
    [user, isAuthenticated, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
