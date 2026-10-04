/**
 * Runtime configuration, read once from Vite's environment.
 *
 * Rules:
 * - Everything here is PUBLIC (it ships in the client bundle).
 * - Fail loudly at startup if a required value is missing, rather than
 *   silently calling `undefined/api/...`.
 *
 * NOTE: read `import.meta.env` as a whole and destructure it. Vite's dev
 * transform rewrites bare `import.meta.env.FOO` member access into an
 * assignment that is invalid in a plain module, which produces a white screen
 * in development while the production build still works.
 */

const env = import.meta.env;

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `[config] Missing required environment variable "${name}". ` +
        `Copy .env.example to .env.local and set it.`,
    );
  }
  return value.replace(/\/+$/, ''); // strip trailing slashes
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  /** Base URL of the Daway Laravel API, without a trailing slash. */
  apiBaseUrl: required('VITE_API_BASE_URL', env.VITE_API_BASE_URL),

  /** Request timeout in milliseconds. */
  apiTimeoutMs: positiveInt(env.VITE_API_TIMEOUT_MS, 20_000),
} as const;
