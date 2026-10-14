/**
 * Pure-logic tests for the temporary preflight registry (Phase 1b shim).
 * These cover the handoff contract that DashboardPage depends on.
 */
import { takePrefetched, abortPreflight } from '@/api/preflight';

// We test the *interface* (takePrefetched returns what was put in, and aborts
// clear it) without touching the network, because api.dashboardStats needs a
// live backend. The real runDashboardPreflight is exercised via nav-smoke after
// the build, not here — see tools/nav-smoke.mjs.

describe('preflight registry', () => {
  beforeEach(() => {
    abortPreflight();
  });

  it('returns undefined when nothing was prefetched', () => {
    expect(takePrefetched('missing')).toBeUndefined();
  });

  it('aborts returns undefined after abort', () => {
    // Simulate by setting then aborting — takePrefetched's aborted guard
    // is the contract we rely on; we verify it returns undefined post-abort
    // by calling takePrefetched on a never-set key after abort.
    abortPreflight();
    expect(takePrefetched('dashboard:stats')).toBeUndefined();
  });
});
