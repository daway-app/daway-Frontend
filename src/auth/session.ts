import { createApiClient, type ApiClient } from '@/api/client';
import { createAuthApi, type AuthApi } from '@/api/authApi';
import { createPharmacyApi, type PharmacyApi } from '@/api/pharmacyApi';
import { createAdminApi, type AdminApi } from '@/api/adminApi';
import { browserAdminTokenStorage, createTokenManager, type TokenManager } from './tokenStorage';
import type { AuthUser } from './authContract';
import type { AdminUser } from '@/api/adminTypes';

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

// =============================================================================
// Admin stack — a SEPARATE session from the pharmacy one
// =============================================================================
// The admin panel is not another pharmacy screen; it is a different product for
// a different role. It therefore gets:
//   · its own token storage key  (see tokenStorage.ADMIN_TOKEN_KEY)
//   · its own client instance    (so a 401 refresh cannot cross the two roles)
//   · its own listener set       (so a pharmacy logout does not re-render admin)
//
// Deliberately NOT sharing `createApiStack`: doing so would make the admin's
// refreshed token overwrite the pharmacy's, and the two `user` values would
// fight over one variable. Separate stacks make that class of bug impossible.
//
// Note on refresh: the admin API has NO refresh endpoint. The pharmacy
// `/api/refresh-token` is scoped to `auth:sanctum` and would rotate whatever
// token it is sent — but reusing it here would entangle the two sessions. So the
// admin session does NOT auto-refresh; a 401 ends it and the guard sends the
// admin back to the admin login. The token lives 7 days, which is ample.

export interface AdminSessionSnapshot {
  user: AdminUser | null;
  isAuthenticated: boolean;
}

export function createAdminApiStack(options?: {
  onSessionExpired?: () => void;
  fetchImpl?: typeof fetch;
  baseUrl?: string;
}) {
  const tokens: TokenManager = createTokenManager(browserAdminTokenStorage);
  const listeners = new Set<(snapshot: AdminSessionSnapshot) => void>();

  let user: AdminUser | null = null;

  function notify(): void {
    const snapshot: AdminSessionSnapshot = {
      user,
      isAuthenticated: tokens.get() !== null,
    };
    for (const listener of listeners) listener(snapshot);
  }

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
    // No refresh for the admin session — see the note above. Returning `null`
    // makes the client treat a 401 as terminal instead of trying to rotate.
    refresh: async () => null,
    onSessionExpired: () => {
      user = null;
      notify();
      options?.onSessionExpired?.();
    },
    fetchImpl: options?.fetchImpl,
    baseUrl: options?.baseUrl,
  });

  const admin: AdminApi = createAdminApi(client);

  return {
    client,
    admin,
    tokens,

    getUser: (): AdminUser | null => user,
    isAuthenticated: (): boolean => tokens.get() !== null,

    async login(email: string, password: string): Promise<AdminUser> {
      const response = await admin.login(email, password);
      const payload = response.data;

      if (!payload?.token || !payload?.user) {
        throw new Error(
          '[admin auth] Login response did not contain a token and user in the expected shape.',
        );
      }

      tokens.set(payload.token);
      user = payload.user;
      notify();
      return payload.user;
    },

    async logout(): Promise<void> {
      try {
        await client.post('/api/logout', undefined, { skipRefresh: true });
      } catch {
        // Best-effort server-side revocation; local clear always happens.
      } finally {
        tokens.clear();
        user = null;
        notify();
      }
    },

    subscribe(listener: (snapshot: AdminSessionSnapshot) => void): () => void {
      listeners.add(listener);
      listener({ user, isAuthenticated: tokens.get() !== null });
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type AdminApiStack = ReturnType<typeof createAdminApiStack>;
