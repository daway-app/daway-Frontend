/**
 * Cache-lifetime contract for the TanStack Query presets.
 *
 * These are the numbers every screen inherits. Getting them wrong is invisible
 * in the UI but shows up as either stale money data or a thundering herd of
 * refetches, so they are pinned here.
 */
import { describe, it, expect } from 'vitest';
import { PRESET_STALE_TIMES } from '@/api/queryClient';

describe('PRESET_STALE_TIMES', () => {
  it('financial data is never cached as truth (staleTime 0)', () => {
    expect(PRESET_STALE_TIMES.financial).toBe(0);
  });

  it('dashboard summary is short-lived (30s)', () => {
    expect(PRESET_STALE_TIMES.dashboardSummary).toBe(30_000);
  });

  it('settings last 5 minutes', () => {
    expect(PRESET_STALE_TIMES.settings).toBe(5 * 60_000);
  });

  it('inventory is 15s', () => {
    expect(PRESET_STALE_TIMES.inventory).toBe(15_000);
  });

  it('inquiries are 20s', () => {
    expect(PRESET_STALE_TIMES.inquiries).toBe(20_000);
  });
});
