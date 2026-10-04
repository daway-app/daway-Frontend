import type { ApiClient } from './client';
import type { ApiSuccess } from './types';
import {
  readToken,
  readUser,
  type LoginData,
  type LoginRequest,
} from '@/auth/authContract';

/**
 * Auth endpoints — paths verified from `routes/api.php`.
 *
 *   POST /api/login/pharmacy     — public, throttled (`login`, `login-account`)
 *   POST /api/refresh-token      — `auth:sanctum`, throttled `30,1`
 *   POST /api/logout             — `auth:sanctum`
 *
 * No other auth path is assumed to exist.
 */
export const AUTH_ENDPOINTS = {
  login: '/api/login/pharmacy',
  refresh: '/api/refresh-token',
  logout: '/api/logout',
} as const;

export interface LoginResult {
  user: LoginData['user'];
  token: string;
}

/**
 * Create the auth API bound to a client.
 *
 * `refresh` deliberately uses `skipRefresh: true` — refreshing a refresh would
 * recurse forever. It also uses `skipAuth: false` so the *current* (possibly
 * expired) token is still sent, which is exactly what the endpoint expects.
 */
export function createAuthApi(client: ApiClient) {
  return {
    async login(credentials: LoginRequest): Promise<LoginResult> {
      const response = await client.post<ApiSuccess<LoginData>>(
        AUTH_ENDPOINTS.login,
        credentials,
        { skipAuth: true },
      );

      const token = readToken(response);
      const user = readUser(response);

      if (!token || !user) {
        // The backend did not return what its own contract promises.
        // Do not fabricate a session — surface it.
        throw new Error(
          '[auth] Login response did not contain a token and user in the expected shape.',
        );
      }

      return { user, token };
    },

    /** Returns the new token, or `null` when the session cannot be extended. */
    async refresh(): Promise<string | null> {
      const response = await client.post<unknown>(AUTH_ENDPOINTS.refresh, undefined, {
        skipRefresh: true,
      });
      return readToken(response);
    },

    async logout(): Promise<void> {
      await client.post<unknown>(AUTH_ENDPOINTS.logout, undefined, {
        skipRefresh: true,
      });
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;
