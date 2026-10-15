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
 *   POST /api/login/pharmacy      — public, throttled (`login`, `login-account`)
 *   POST /api/register/pharmacy   — public, throttled `register`
 *   POST /api/refresh-token       — `auth:sanctum`, throttled `30,1`
 *   POST /api/logout              — `auth:sanctum`
 *
 * No other auth path is assumed to exist.
 */
export const AUTH_ENDPOINTS = {
  login: '/api/login/pharmacy',
  registerPharmacy: '/api/register/pharmacy',
  refresh: '/api/refresh-token',
  logout: '/api/logout',
} as const;

export interface LoginResult {
  user: LoginData['user'];
  token: string;
}

/** Body of `POST /api/register/pharmacy` — matches the backend validator. */
export interface PharmacyRegistrationRequest {
  pharmacy_name: string;
  phone: string;
  region: string;
  password: string;
}

/**
 * `data` of a successful registration.
 *
 * `status` is always `'pending_approval'` and `is_active` always `false`: the
 * backend does NOT hand out a usable account here.
 */
export interface PharmacyRegistrationData {
  pharmacy_name: string;
  phone: string;
  is_active: boolean;
  status: 'pending_approval';
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

    /**
     * Apply for a pharmacy account.
     *
     * 🔴 THIS DOES NOT CREATE A LOGIN. The backend files the pharmacy as
     * `pending_approval` (HTTP 201) and returns NO token — the credentials are
     * issued later, by SMS, once an admin approves. Callers must present this as
     * an APPLICATION; treating it as a signup leaves the user trying to log in
     * with credentials that do not exist yet.
     */
    async registerPharmacy(
      input: PharmacyRegistrationRequest,
    ): Promise<{ message: string; data: PharmacyRegistrationData }> {
      const response = await client.post<ApiSuccess<PharmacyRegistrationData>>(
        AUTH_ENDPOINTS.registerPharmacy,
        input,
        { skipAuth: true },
      );

      return { message: response.message ?? '', data: response.data };
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
