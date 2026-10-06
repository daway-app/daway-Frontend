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

  /**
   * Request timeout in milliseconds.
   *
   * 🔴 RAISED 20s → 60s. The previous default made the app fail against its own
   * backend.
   *
   * The API reads from a REMOTE managed MySQL (Aiven), so every request pays a
   * network round-trip. Measured warm, repeatedly, on a normal connection:
   *
   *     /api/pharmacy/inventory          3.7 – 9.2 s
   *     /api/login/pharmacy              4.5 – 5.7 s
   *     /api/pharmacy/accounting/overview  17 s · 18 s · 62 s
   *
   * With a 20 s cap, the accounting overview was aborted more often than not and
   * the screen fell back to its error state — correct behaviour, but a
   * permanent failure for the user. 60 s covers everything measured except the
   * worst outlier.
   *
   * This is a MITIGATION for backend latency, not a fix: the real answer is
   * faster queries or a nearer database. A hung request now blocks its screen
   * for longer, which is acceptable because the UI shows a skeleton (it is not
   * frozen) and navigating away aborts the request.
   */
  apiTimeoutMs: positiveInt(env.VITE_API_TIMEOUT_MS, 60_000),
} as const;
