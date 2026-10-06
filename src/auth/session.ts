import { createApiClient, type ApiClient } from '@/api/client';
import { createAuthApi, type AuthApi } from '@/api/authApi';
import { createPharmacyApi, type PharmacyApi } from '@/api/pharmacyApi';
import { createTokenManager, type TokenManager } from './tokenStorage';
import type { AuthUser } from './authContract';

/**
 * Composition root for the API + auth stack, with no React dependency.
 *
 * Wiring order matters: the client needs `getToken`/`clearToken`/`refresh`,
 * while `refresh` is implemented by the auth API, which needs the client.
 * The cycle is broken with a mutable holder that is filled in immediately.
 */

export interface SessionSnapshot {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

export function createApiStack(options?: {
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}) {
  const tokens: TokenManager = createTokenManager();
  const listeners = new Set<(snapshot: SessionSnapshot) => void>();

  let user: AuthUser | null = null;

  function notify(): void {
    const snapshot: SessionSnapshot = {
      user,
      isAuthenticated: tokens.get() !== null,
    };
    for (const listener of listeners) listener(snapshot);
  }

  // The refresh implementation is assigned once the auth API exists.
  let refreshImpl: () => Promise<string | null> = async () => null;

  const client: ApiClient = createApiClient({
    getToken: () => tokens.get(),
    setToken: (token) => {
      tokens.set(token);
      notify();
    },
    clearToken: () => {
      tokens.clear();
      user = null;
      notify();
    },
    refresh: () => refreshImpl(),
    onSessionExpired: () => {
      user = null;
      notify();
      options?.onSessionExpired?.();
    },
    fetchImpl: options?.fetchImpl,
    baseUrl: options?.baseUrl,
  });

  const auth: AuthApi = createAuthApi(client);
  const pharmacy: PharmacyApi = createPharmacyApi(client);

  // Wire the cycle: refresh now delegates to the auth API.
  refreshImpl = () => auth.refresh();

  return {
    client,
    auth,
    pharmacy,
    tokens,

    /** Current user, or `null` when signed out. */
    getUser: (): AuthUser | null => user,

    /** True when a token is present. */
    isAuthenticated: (): boolean => tokens.get() !== null,

    async login(pharmacyId: string, password: string): Promise<AuthUser> {
      const result = await auth.login({
        pharmacy_id: pharmacyId,
        password,
      });
      tokens.set(result.token);
      user = result.user;
      notify();
      return result.user;
    },

    async logout(): Promise<void> {
      try {
        await auth.logout();
      } finally {
        // Always clear locally, even if the network call failed.
        tokens.clear();
        user = null;
        notify();
      }
    },

    /** Subscribe to session changes. Returns an unsubscribe function. */
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
      listeners.add(listener);
      listener({
        user,
        isAuthenticated: tokens.get() !== null,
      });
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type ApiStack = ReturnType<typeof createApiStack>;
