/**
 * Token persistence.
 *
 * SECURITY NOTE — read before changing:
 * `localStorage` is readable by any script running in the origin, so it is
 * vulnerable to XSS. It is used here deliberately and pragmatically:
 *  - the backend is a stateless Bearer API (`supports_credentials = false`),
 *    so there is no HttpOnly-cookie option without backend changes;
 *  - the backend is READ-ONLY for this project, so we cannot add one.
 *
 * This is an accepted, documented trade-off — NOT a claim that it is secure.
 * Mitigations that belong to P0: keep the app free of `dangerouslySetInnerHTML`,
 * never log the token, and clear it on logout / 401.
 */

const TOKEN_KEY = 'daway.auth.token';

/**
 * Storage key for the ADMIN session.
 *
 * 🔴 Why a separate key and not the same one:
 * an admin and a pharmacy are different people with different tokens. Sharing
 * one key means signing into the admin panel silently destroys the pharmacy
 * session (and vice versa), and the two roles have different landing pages —
 * so the losing session would be redirected to a page it cannot use. Two keys
 * let both exist independently, which is also what makes the guards meaningful.
 */
const ADMIN_TOKEN_KEY = 'daway.admin.token';

/** Minimal storage contract so tests can inject a fake. */
export interface TokenStorage {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage can throw in private mode / when disabled.
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore — the app still works for the current session via memory.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

/** Browser-backed token storage. */
export const browserTokenStorage: TokenStorage = {
  get: () => safeGet(TOKEN_KEY),
  set: (token) => safeSet(TOKEN_KEY, token),
  clear: () => safeRemove(TOKEN_KEY),
};

/** Browser-backed token storage for the admin session (separate key). */
export const browserAdminTokenStorage: TokenStorage = {
  get: () => safeGet(ADMIN_TOKEN_KEY),
  set: (token) => safeSet(ADMIN_TOKEN_KEY, token),
  clear: () => safeRemove(ADMIN_TOKEN_KEY),
};

/**
 * In-memory token holder.
 *
 * The token is cached in memory so the request path does not touch
 * `localStorage` on every call; the cache is the single source of truth while
 * the app runs, and is rehydrated from storage on first access.
 */
export function createTokenManager(storage: TokenStorage = browserTokenStorage) {
  let cached: string | null = null;
  let hydrated = false;

  return {
    get(): string | null {
      if (!hydrated) {
        cached = storage.get();
        hydrated = true;
      }
      return cached;
    },

    set(token: string): void {
      cached = token;
      hydrated = true;
      storage.set(token);
    },

    clear(): void {
      cached = null;
      hydrated = true;
      storage.clear();
    },
  };
}

export type TokenManager = ReturnType<typeof createTokenManager>;
