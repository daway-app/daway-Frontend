import { lazy, Suspense } from 'react';
import type { ComponentProps, JSX } from 'react';
import { LoadingState } from '@/components/ui';
import {
  resolveLazyComponent,
  type AnyComponent,
  type ModuleShape,
} from '@/routes/lazyPageResolve';

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
 */
export function lazyPage<T extends AnyComponent = AnyComponent>(
  loader: () => Promise<ModuleShape>,
): (props: ComponentProps<T>) => JSX.Element {
  // Intentional loose typing: page modules are heterogeneous (some have a
  // default, most only have a single named export), and the wrapper must
  // accept whatever props the resolved component declares. `resolveLazyComponent`
  // guarantees only a real component is returned.
  const LazyComponent = lazy(async () => ({ default: resolveLazyComponent(await loader()) }));

  return function LazyPageWrapper(props: ComponentProps<T>): JSX.Element {
    return (
      <Suspense fallback={<LoadingState rows={4} />}>
        {/* Cast: props are forwarded blindly to whatever component resolved. */}
        <LazyComponent {...(props as object)} />
      </Suspense>
    );
  };
}
