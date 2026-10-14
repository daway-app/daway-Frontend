/**
 * Post-login data prefetch — TEMPORARY (Phase 1b).
 *
 * This module bridges the gap until TanStack Query is wired up (Phase 2).
 * Its ONLY job: while the post-login overlay is visible, kick off the
 * Dashboard's critical data requests EARLY and stash the resolved values so
 * that when DashboardPage mounts its `useApiQuery` calls find data in the
 * registry and skip the network round-trip.
 *
 * After Phase 2 this file is DELETED — `queryClient.prefetchQuery` replaces it
 * and `useApiQuery` becomes a real cache (no handoff shim needed).
 */
import type { ApiDashboardStats, ApiPharmacyProfile, ApiSalesList } from '@/api/pharmacyTypes';
import type { PharmacyApi } from '@/api/pharmacyApi';

// Keys must match the exact resource each DashboardPage query asks for, so
// that the handoff is lossless.
export const DASHBOARD_PREFLIGHT = {
  stats: 'dashboard:stats',
  profile: 'dashboard:profile',
  sales: 'dashboard:sales',
} as const;

// A registry scoped per login attempt so a stale login cannot leak data into
// the next one. Cleared by clearPreflight() — called from LoginPage on any
// outcome, and by the dashboard consumer after taking its share.
const preflightStore = new Map<string, unknown>();

let aborted = false;

/** Run the Dashboard's critical fetches, resolving once all settle. Returns
 *  false if a previous prefetch was aborted (caller should not navigate). */
export function runDashboardPreflight(api: PharmacyApi): Promise<void> {
  aborted = false;
  // Fire all three independently (no Promise.all — they race the same way
  // they do on the real dashboard page).
  const p1 = api.dashboardStats();
  const p2 = api.profile();
  const p3 = api.sales({ per_page: 1 });

  // Store each resolved value as it arrives (partial data is still useful).
  p1.then((data) => { if (!aborted) preflightStore.set(DASHBOARD_PREFLIGHT.stats, data); })
    .catch(() => { /* the dashboard query will refetch on mount anyway */ });
  p2.then((data) => { if (!aborted) preflightStore.set(DASHBOARD_PREFLIGHT.profile, data); })
    .catch(() => {});
  p3.then((data) => { if (!aborted) preflightStore.set(DASHBOARD_PREFLIGHT.sales, data); })
    .catch(() => {});

  return Promise.allSettled([p1, p2, p3]).then(() => undefined);
}

/** Read + consume a single prefetched value. Returns undefined if absent. */
export function takePrefetched<T>(key: string): T | undefined {
  if (aborted) return undefined;
  const value = preflightStore.get(key);
  if (value !== undefined) {
    // Consume once: prevents a remount from re-reading stale preflight data.
    preflightStore.delete(key);
  }
  return value as T | undefined;
}

/** Mark any in-flight prefetch as abandoned (e.g. user logs out mid-prepare
 *  or retries). Subsequent takePrefetched() calls return undefined. */
export function abortPreflight(): void {
  aborted = true;
  preflightStore.clear();
}
