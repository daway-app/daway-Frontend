import type { AdminUser } from '@/api/adminTypes';
import type { AuthUser } from './authContract';

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

/* ========================================================================== */
/* Signed-in USER persistence                                                  */
/* ========================================================================== */

/**
 * WHY THE USER OBJECT IS PERSISTED TOO (Blade parity).
 *
 * Laravel renders the topbar/sidebar user block server-side from
 * `auth()->user()` — name, role and avatar are always present, on every page
 * load. The SPA kept the user in MEMORY only (`session.ts`: `let user = null`),
 * so a page refresh with a valid token restored the SESSION but not the USER:
 * the topbar showed an empty name and a "؟" avatar until the next login, while
 * the user still appeared signed in.
 *
 * Persisting the same JSON the login endpoint returned closes that gap and
 * makes a refresh behave like Blade's SSR render. It is display data only
 * (name/role/id) — no token, no secret — and it is cleared together with the
 * token on logout, 401 and session expiry.
 */
const USER_KEY = 'daway.auth.user';
const ADMIN_USER_KEY = 'daway.admin.user';

/** Minimal user-storage contract, mirroring `TokenStorage`. */
export interface UserStorage<T> {
  get(): T | null;
  set(user: T): void;
  clear(): void;
}

/**
 * JSON-backed user storage.
 *
 * A corrupt/absent value resolves to `null` rather than throwing: a bad parse
 * must degrade to "no user yet" (the guards then re-login), never crash the
 * app on boot.
 */
export function createUserStorage<T>(key: string): UserStorage<T> {
  return {
    get(): T | null {
      const raw = safeGet(key);
      if (!raw) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? (parsed as T) : null;
      } catch {
        return null;
      }
    },
    set(user: T): void {
      safeSet(key, JSON.stringify(user));
    },
    clear(): void {
      safeRemove(key);
    },
  };
}

/** Browser-backed user storage for the pharmacy session. */
export const browserUserStorage = createUserStorage<AuthUser>(USER_KEY);

/** Browser-backed user storage for the admin session (separate key). */
export const browserAdminUserStorage = createUserStorage<AdminUser>(ADMIN_USER_KEY);
