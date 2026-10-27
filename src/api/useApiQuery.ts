import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { PRESET_STALE_TIMES } from '@/api/queryClient';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2: TanStack Query adapter — ZERO-BREAK on existing call sites
 * ─────────────────────────────────────────────────────────────────────────────
 * This rewrites the previous dependency-free `useApiQuery`/`useApiMutation`
 * pair AS A THIN ADAPTER over TanStack Query, preserving the EXACT public
 * signature so the 32 query call sites and 17 mutation call sites need NO
 * change:
 *
 *   useApiQuery(fetcher, deps, options)   → same shape, same output
 *   useApiMutation(action, { invalidates }) → same output, optional invalidation
 *
 * Internally, `deps` (serialized by value) become the TanStack query key, so
 * dedup + staleTime + cache come for free. The old infinite-fetch-loop bug is
 * also eliminated — React Query owns the lifecycle.
 *
 * Migration complete: `queryKey` is required; call sites pass `pharmacyKeys`/
 * `adminKeys`/`publicKeys` keys so mutations invalidate precisely.
 *
 * Why not the OLD "why not react-query?" note?  See queryClient.ts — the B7
 * exception is documented there (no suitable cache existed; a hand-rolled
 * clone would duplicate tested infrastructure).
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AsyncStatus = 'loading' | 'ready' | 'error';

export interface UseApiQueryOptions<T> {
  enabled?: boolean;
  /** Stale lifetime (ms). Falls back to a sensible default. */
  staleTime?: number;
  /**
   * Required explicit query key — build it from `pharmacyKeys`/`adminKeys`/
   * `publicKeys` so screens dedupe and invalidate precisely.
   */
  queryKey: QueryKey;
  /** Called once per successful load — for side effects, not for state. */
  onSuccess?: (data: T) => void;
  /** Treat a result as empty for the empty-state UI. */
  isEmpty?: (data: T) => boolean;
}

export interface UseApiQueryResult<T> {
  data: T | null;
  error: ApiError | null;
  status: AsyncStatus;
  isLoading: boolean;
  isError: boolean;
  /** True once loaded successfully AND `isEmpty(data)` says so. */
  isEmpty: boolean;
  /** True while a *manual* refetch is in flight (data stays on screen). */
  isRefetching: boolean;
  refetch: () => void;
}

/**
 * Serialize a dependency list into a stable primitive key — same algorithm as
 * the previous implementation so inline `[a, b]` literals don't churn.
 */
function serializeDeps(deps: readonly unknown[]): string {
  return JSON.stringify(deps, (_key, value) => {
    // `\u0000` is written as an ESCAPE, never as a literal control byte: the
    // value is identical at runtime, but the source stays plain text. The
    // previous version embedded a raw NUL in the file, which made git classify
    // this module as BINARY (no diffs, no blame) — see the Phase 3 report.
    if (value === undefined) return '\u0000undef';
    return value;
  });
}

export function useApiQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options: UseApiQueryOptions<T>,
): UseApiQueryResult<T> {
  const {
    enabled = true,
    staleTime = PRESET_STALE_TIMES.default,
    queryKey: explicitKey,
    onSuccess,
    isEmpty: isEmptyFn,
  } = options;
  const queryClient = useQueryClient();

  const depsKey = serializeDeps(deps);
  // If the caller passed an explicit key (Phase 2b migration), use it for
  // real cross-screen invalidation. Otherwise fall back to deps-derived key
  // so pre-migration call sites still dedup correctly.
  const queryKey: QueryKey = useMemo(
    () => explicitKey ?? ['useApiQuery', depsKey],
    [explicitKey, depsKey],
  );

  const fetcherRef = useRef(fetcher);
  const onSuccessRef = useRef(onSuccess);
  const isEmptyRef = useRef(isEmptyFn);

  useEffect(() => {
    fetcherRef.current = fetcher;
    onSuccessRef.current = onSuccess;
    isEmptyRef.current = isEmptyFn;
  });

  const result = useQuery<T>({
    queryKey,
    queryFn: async (ctx) => {
      const data = await fetcherRef.current(ctx.signal);
      onSuccessRef.current?.(data);
      return data;
    },
    enabled,
    staleTime,
  });

  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey, exact: true });
  }, [queryClient, queryKey]);

  const status: AsyncStatus =
    result.status === 'pending'
      ? 'loading'
      : result.status === 'error'
        ? 'error'
        : 'ready';

  const error: ApiError | null = result.error
    ? result.error instanceof ApiError
      ? result.error
      : new ApiError({ kind: 'unknown', status: null, message: String(result.error) })
    : null;

  const isEmpty =
    status === 'ready' &&
    result.data !== null &&
    result.data !== undefined &&
    (isEmptyRef.current
      ? isEmptyRef.current(result.data)
      : Array.isArray(result.data)
        ? result.data.length === 0
        : false);

  return {
    data: result.data ?? null,
    error,
    status,
    isLoading: result.status === 'pending',
    isError: result.status === 'error',
    isEmpty,
    isRefetching: result.isFetching && result.status === 'success',
    refetch,
  };
}

/**
 * Imperative mutation hook — same shape as before, with an optional `invalidates`
 * option so mutation sites declare which queries to refresh instead of
 * reaching back to the component's `query.refetch()`.
 *
 * Usage (unchanged):  const { run, isPending, error, fieldErrors } = useApiMutation(action);
 * New (optional):     const { ... } = useApiMutation(action, { invalidates: [key] });
 */
export interface UseApiMutationResult<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<TResult>;
  isPending: boolean;
  error: ApiError | null;
  /** Validation field errors from a 422, when present. */
  fieldErrors: Record<string, string[]> | null;
  reset: () => void;
}

export interface UseApiMutationOptions {
  /** Query keys to invalidate AFTER a successful mutation. */
  invalidates?: QueryKey | QueryKey[];
}

function toMutationError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({
    kind: 'unknown',
    status: null,
    message: error instanceof Error ? error.message : undefined,
  });
}

/**
 * Apply a mutation's `invalidates` option to the cache.
 *
 * 🔴 WHY THIS IS AN EXPORTED FUNCTION AND NOT AN INLINE CALLBACK
 * `useApiMutation` cannot be rendered in this project's DOM-less test suite
 * (no jsdom, and adding one is out of scope), so an inline invalidation rule
 * would be permanently untestable. Extracting it keeps ONE implementation and
 * lets it be verified against a REAL `QueryClient` — see
 * `useApiQuery.test.ts`.
 *
 * 🔴 THE EMPTY-ARRAY TRAP THIS GUARDS AGAINST
 * `invalidates` is typed `QueryKey | QueryKey[]`, and a `QueryKey` is ITSELF an
 * array — so `[]` is genuinely ambiguous. The shape detection below reads
 * `invalidates[0]`; for `[]` that is `undefined`, which is not an array, so
 * `[]` was classified as ONE EMPTY KEY and handed to
 * `invalidateQueries({ queryKey: [] })`. TanStack treats a key as a PREFIX
 * filter and the empty prefix matches EVERY query — so an empty list silently
 * invalidated the ENTIRE cache: every entry marked stale, and every active
 * query refetched at once.
 *
 * An empty list now means "nothing to invalidate". No intentional
 * global-invalidation mode exists in this codebase (`invalidateQueries()` with
 * no filter is never called), so this is NOT turning a real feature into a
 * no-op — it is refusing to interpret "no keys" as "all keys".
 */
export function applyInvalidation(
  queryClient: QueryClient,
  invalidates?: QueryKey | QueryKey[],
): void {
  // Omitted (or explicitly undefined) → the mutation declares no invalidation.
  if (!invalidates) return;

  // An empty LIST is not one empty KEY — see the doc comment above.
  if (invalidates.length === 0) return;

  // A QueryKey is an array, so "a list of keys" is detected by the first
  // element being an array too (e.g. `[['pharmacy','sales'], ['dashboard']]`).
  const keys: QueryKey[] = Array.isArray(invalidates[0])
    ? (invalidates as QueryKey[])
    : [invalidates as QueryKey];

  for (const key of keys) {
    queryClient.invalidateQueries({ queryKey: key });
  }
}

export function useApiMutation<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: UseApiMutationOptions = {},
): UseApiMutationResult<TArgs, TResult> {
  const { invalidates } = options;
  const queryClient = useQueryClient();

  const mutation = useMutation<TResult, Error, unknown[]>({
    mutationFn: (args: unknown[]) => action(...(args as TArgs)),
    onSuccess: () => {
      // The rule lives in `applyInvalidation` so it stays testable without a DOM.
      applyInvalidation(queryClient, invalidates);
    },
  });

  const run = useCallback(async (...args: TArgs): Promise<TResult> => {
    return mutation.mutateAsync(args as unknown[]) as Promise<TResult>;
  }, [mutation]);

  const reset = useCallback(() => mutation.reset(), [mutation]);

  return {
    run,
    isPending: mutation.isPending,
    error: mutation.error ? toMutationError(mutation.error) : null,
    fieldErrors: mutation.error instanceof ApiError ? mutation.error.errors ?? null : null,
    reset,
  };
}
