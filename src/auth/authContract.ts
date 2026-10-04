/**
 * Auth contract — verified against the Laravel backend source.
 *
 * ============================================================================
 * These shapes are NOT guesses. Each was read from the controller:
 *   app/Http/Controllers/Api/AuthController.php
 * ============================================================================
 *
 * 🔴 CRITICAL — login and refresh return the token in DIFFERENT places:
 *
 *   POST /api/login/pharmacy   →  { success, message, data: { user, token } }
 *                                  token at  data.token
 *
 *   POST /api/refresh-token    →  { success, token }
 *                                  token at  ROOT `token`   ← NOT data.token
 *
 * Assuming one uniform shape is the single easiest way to break the session.
 * `readToken()` below handles both and is unit-tested.
 */

/** The user block returned by pharmacy login. */
export interface AuthUser {
  id: number;
  name: string;
  pharmacy_id: string;
  role: string;
  must_change_password: boolean;
}

/** `data` of a successful pharmacy login. */
export interface LoginData {
  user: AuthUser;
  token: string;
}

/** Body of `POST /api/login/pharmacy`. */
export interface LoginRequest {
  pharmacy_id: string;
  password: string;
}

/**
 * Token lifetime facts (from the backend), used for documentation and for
 * explaining a 401 to the user:
 *  - `SANCTUM_EXPIRATION = 10080` minutes → the token itself lives 7 days.
 *  - `MAX_TOKEN_AGE_DAYS = 30` → the refresh *chain* has an absolute 30-day cap.
 *  - Past the cap the backend deletes ALL tokens and returns 401 with
 *    "انتهت صلاحية الجلسة نهائياً، يرجى تسجيل الدخول من جديد".
 *  - A normal expiry returns 401 "يجب تسجيل الدخول".
 * Both 401s are terminal for the client: clear the token and go to login.
 */
export const TOKEN_LIFETIME = {
  /** Minutes — mirrors SANCTUM_EXPIRATION. */
  accessTokenMinutes: 10080,
  /** Days — mirrors MAX_TOKEN_AGE_DAYS. */
  absoluteChainCapDays: 30,
} as const;

/**
 * Read the token out of a login or refresh payload, tolerating both shapes
 * proven to exist in this backend.
 *
 * @returns the plain-text token, or `null` if neither location held one.
 */
export function readToken(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as Record<string, unknown>;

  // Refresh shape: { success, token }
  if (typeof body.token === 'string' && body.token.length > 0) {
    return body.token;
  }

  // Login shape: { success, data: { user, token } }
  const data = body.data;
  if (typeof data === 'object' && data !== null) {
    const nested = (data as Record<string, unknown>).token;
    if (typeof nested === 'string' && nested.length > 0) {
      return nested;
    }
  }

  return null;
}

/**
 * Extract the user block from a login payload (`data.user`).
 * Returns `null` when absent or malformed.
 */
export function readUser(payload: unknown): AuthUser | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = (payload as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return null;

  const user = (data as Record<string, unknown>).user;
  if (typeof user !== 'object' || user === null) return null;

  const u = user as Record<string, unknown>;
  if (typeof u.id !== 'number' || typeof u.name !== 'string') return null;

  return {
    id: u.id,
    name: u.name,
    pharmacy_id: typeof u.pharmacy_id === 'string' ? u.pharmacy_id : '',
    role: typeof u.role === 'string' ? u.role : '',
    must_change_password: Boolean(u.must_change_password),
  };
}

/**
 * The backend returns these codes on `403` for a deactivated account
 * (`code: "account_inactive"`). Surfaced so the UI can explain the state.
 */
export const AUTH_ERROR_CODES = {
  ACCOUNT_INACTIVE: 'account_inactive',
} as const;
