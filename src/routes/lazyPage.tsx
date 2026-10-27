import { lazy, Suspense } from 'react';
import type { ComponentProps, JSX } from 'react';
import { LoadingState } from '@/components/ui';
import {
  resolveLazyComponent,
  type AnyComponent,
  type ModuleShape,
} from '@/routes/lazyPageResolve';
import { isChunkLoadError } from '@/routes/chunkLoadError';

/**
 * Wraps a dynamic import in React.lazy + a shared Suspense boundary.
 *
 * Used by router.tsx to turn every route page into a code-split chunk.
 * The fallback is the existing LoadingState skeleton (see components/ui/index.tsx)
 * — a lightweight skeleton, NOT a blank screen and NOT a full-page spinner,
 * consistent with the project rule that every data-bound path has a loading UI.
 *
 * The module→component resolution rule lives in `lazyPageResolve.ts` (pure, and
 * unit-tested) — it previously lived here and shipped a runtime crash that no
 * static check caught. See that file for the full story.
 *
 * ---------------------------------------------------------------------------
 * WHY THE LOADER RETRIES
 * ---------------------------------------------------------------------------
 * `React.lazy` caches the promise it is given, and a REJECTED promise stays
 * rejected for the lifetime of the page — `lazy` does not retry, and the same
 * `LazyComponent` is a module-level constant that never gets rebuilt. So one
 * transient failure (a dropped connection on a 3–9s backend, a flaky mobile
 * network in Gaza, a CDN hiccup) permanently bricked that route until a full
 * page reload. The user would press "retry" on the error screen and land on the
 * same dead screen, because the retry reuses the poisoned promise.
 *
 * Retrying INSIDE the loader fixes that at the only place it can be fixed: the
 * second attempt produces a fresh `import()`, which is a fresh network request.
 *
 * Scope is deliberately narrow:
 *   · only chunk-load failures are retried — a genuine `SyntaxError` in a module
 *     or a bug in `resolveLazyComponent` will fail identically forever, and
 *     retrying it just delays the error screen by a network round-trip;
 *   · exactly ONE retry, so a truly missing file does not become an infinite
 *     loop or a request storm.
 */

/** Delay before the single retry. Enough to clear a momentary blip. */
const RETRY_DELAY_MS = 400;

export function lazyPage<T extends AnyComponent = AnyComponent>(
  loader: () => Promise<ModuleShape>,
): (props: ComponentProps<T>) => JSX.Element {
  // Intentional loose typing: page modules are heterogeneous (some have a
  // default, most only have a single named export), and the wrapper must
  // accept whatever props the resolved component declares. `resolveLazyComponent`
  // guarantees only a real component is returned.
  const LazyComponent = lazy(async () => ({
    default: resolveLazyComponent(await loadWithRetry(loader)),
  }));

  return function LazyPageWrapper(props: ComponentProps<T>): JSX.Element {
    return (
      <Suspense fallback={<LoadingState rows={4} />}>
        {/* Cast: props are forwarded blindly to whatever component resolved. */}
        <LazyComponent {...(props as object)} />
      </Suspense>
    );
  };
}

/**
 * Runs the import, retrying once if (and only if) it failed to FETCH.
 *
 * Re-throws the original error after the retry is exhausted so the route's
 * `errorElement` sees the real failure and can show the stale-build copy.
 */
export async function loadWithRetry(
  loader: () => Promise<ModuleShape>,
): Promise<ModuleShape> {
  try {
    return await loader();
  } catch (error) {
    if (!isChunkLoadError(error)) throw error;

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    // A second failure is final — let it propagate unchanged.
    return await loader();
  }
}
