/**
 * Chunk-load detection.
 *
 * Lives apart from `RouteErrorBoundary.tsx` for two reasons:
 *  1. `react-refresh/only-export-components` — a module that exports a component
 *     must export ONLY components, so it can hot-swap without losing state.
 *     Exporting this predicate from the component file broke that rule.
 *  2. It is pure and testable without a DOM, which is what this repo's test
 *     setup supports (no jsdom for most suites).
 */

/**
 * True when a thrown value means "a code-split chunk could not be fetched".
 *
 * This is the single most common real-world SPA crash in production and it is
 * NOT a bug in the page: a new build is deployed, the previous tab still holds
 * the old asset manifest, and navigating to a not-yet-loaded route asks for a
 * hashed file that no longer exists on the server.
 *
 * Matched messages, all emitted by real bundlers:
 *  - `Failed to fetch dynamically imported module: https://…`  (Vite / native ESM)
 *  - `error loading dynamically imported module`               (Firefox / older Safari)
 *  - `Loading chunk 42 failed` / `ChunkLoadError`              (webpack)
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  let message = '';
  if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    const maybe = (error as { message?: unknown }).message;
    message = typeof maybe === 'string' ? maybe : String(error);
  }

  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /Loading chunk \S+ failed/i.test(message) ||
    /ChunkLoadError/i.test(message)
  );
}
