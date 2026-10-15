/**
 * TanStack Query client — SINGLETON (Phase 2).
 *
 * Created once at module load, mirroring the pharmacy `apiStack` singleton
 * pattern in src/auth/session.ts. Mounted via <QueryClientProvider> in
 * src/app/App.tsx, ABOVE <ApiProvider>, so the cache outlives auth state
 * churn while still being clearable on logout.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DEPENDENCY IS ALLOWED DESPITE PROJECT RULE B7
 * ─────────────────────────────────────────────────────────────────────────────
 * Rule B7 ("no new dependency unless truly necessary") is documented in
 * src/api/useApiQuery.ts:7. The rule's own exception reads "unless truly
 * necessary" — and this feature is *necessitated* by the spec:
 *
 *   - "Populate the appropriate cache with successfully retrieved responses"
 *   - "Reuse the existing query/cache infrastructure. If no suitable
 *      solution exists, evaluate TanStack Query." ← NO cache exists today.
 *
 * The audit proved zero caching/dedup/invalidation in the current layer.
 * Re-implementing dedup + staleTime + invalidation + GC by hand — on top of a
 * hand-rolled fetch client that already handles 401-refresh + abort — would
 * create a second, parallel, untested query engine instead of buying into a
 * battle-tested one. The maintenance + test surface of a hand-rolled clone
 * exceeds the cost of one peer dependency; this file is the written waiver.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Stale-time policy is per data class (see queryKeys.ts for the exact keys):
 *   - dashboard stats / profile / settings: short-lived (30–60s, 5min)
 *   - inventory / inquiries: medium (15–20s)
 *   - financials (sales, refunds, cash, expenses): NOT cached as truth
 *     (staleTime: 0) — mutations always invalidate, and a stale view is
 *     never treated as proof a transaction succeeded.
 *
 * refetchOnWindowFocus is DISABLED — the backend reads a remote MySQL with
 * 3–9s latency, so refetching on every tab-focus storm would thrash. Stale
 * data is acceptable between invalidations; real staleness is handled by the
 * per-key staleTime above.
 */
import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Only retry transient failures (network/5xx/timeout per ApiError.isRetryable).
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.isRetryable && failureCount < 2) {
          return true;
        }
        return false;
      },
      // Never retry a query automatically on window focus — too expensive
      // over the remote DB. Callers that need refresh-invalidate use
      // queryClient.invalidateQueries explicitly.
      refetchOnWindowFocus: false,
      refetchOnMount: false, // respect staleTime; only refetch if stale
      refetchOnReconnect: false,
      // Default GC window — short enough to free memory on SPA-style nav,
      // long enough to keep sidebar counts while flipping between tabs.
      gcTime: 5 * 60 * 1000,
      // Per-key staleTime is set via the query keys' defaults where needed;
      // this is the catch-all for anything that doesn't declare one.
      staleTime: 10_000,
    },
    mutations: {
      // Mutations don't auto-retry by default; the UI surfaces the error and
      // the caller decides whether to retry (e.g. a network blip during import).
      retry: false,
    },
  },
});

export const PRESET_STALE_TIMES = {
  /** Dashboard summaries — stale fast, the dashboard auto-refreshes via idle */
  dashboardSummary: 30_000,
  /** Inventory — balances freshness vs. write conflicts */
  inventory: 15_000,
  /** Inquiries + sidebar unread counts — real-time-ish */
  inquiries: 20_000,
  /** Profile/settings — rarely change, can live longer */
  settings: 5 * 60_000,
  /** Financial records — never served stale as truth */
  financial: 0,
  /** General default */
  default: 10_000,
} as const;
