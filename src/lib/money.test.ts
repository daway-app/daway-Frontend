import { describe, expect, it } from 'vitest';
import { round2, sumBy } from './money';

/**
 * Regression guards for the money helpers (audit B-12).
 *
 * These were originally asserted against the mock fixtures. The fixtures are
 * gone, but the helpers are live — every accounting screen uses them — so the
 * guards moved here rather than being deleted with the mocks.
 */
describe('round2 — audit B-12', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(1.005)).toBe(1.0);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(52.5)).toBe(52.5);
  });

  it('is exact for values that are already 2dp', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-1366.5)).toBe(-1366.5);
  });

  it('handles zero and integers', () => {
    expect(round2(0)).toBe(0);
    expect(round2(7)).toBe(7);
  });
});

describe('sumBy — audit B-12', () => {
  it('rounds once at the end, not per item', () => {
    // Summing 0.1 + 0.2 naively gives 0.30000000000000004.
    expect(sumBy([0.1, 0.2], (x) => x)).toBe(0.3);
  });

  it('returns 0 for an empty list', () => {
    expect(sumBy([], (x: number) => x)).toBe(0);
  });

  it('sums a projected field', () => {
    const rows = [{ amount: 10.5 }, { amount: 0.25 }, { amount: 1 }];
    expect(sumBy(rows, (r) => r.amount)).toBe(11.75);
  });
});
