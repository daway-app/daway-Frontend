import { describe, expect, it } from 'vitest';
import { refundSettlement } from './refundSettlement';

/**
 * Pins the debt-first split shared with the backend (D1–D7).
 *
 * The rule under test: returned goods cancel outstanding debt before any cash
 * is paid back — `debt_cancelled = min(refundTotal, remaining)`.
 */
describe('refundSettlement', () => {
  it('pays the whole value back in cash when the invoice is fully paid', () => {
    // remaining = 0 → nothing to cancel → all cash.
    expect(refundSettlement(200, 0)).toEqual({
      total: 200,
      debt_cancelled: 0,
      cash_refunded: 200,
    });
  });

  it('cancels debt and pays no cash when the goods were unpaid', () => {
    // remaining (1000) ≥ refund (200) → all debt, no cash leaves the drawer.
    expect(refundSettlement(200, 1000)).toEqual({
      total: 200,
      debt_cancelled: 200,
      cash_refunded: 0,
    });
  });

  it('splits debt and cash when the return crosses the unpaid balance', () => {
    // remaining 400, return 600 → 400 debt, 200 cash.
    expect(refundSettlement(600, 400)).toEqual({
      total: 600,
      debt_cancelled: 400,
      cash_refunded: 200,
    });
  });

  it('cancels exactly the remaining balance at the boundary', () => {
    expect(refundSettlement(400, 400)).toEqual({
      total: 400,
      debt_cancelled: 400,
      cash_refunded: 0,
    });
  });

  it('never lets the parts exceed the total (debt + cash = total)', () => {
    const split = refundSettlement(333.33, 100.11);
    expect(split.debt_cancelled + split.cash_refunded).toBeCloseTo(split.total, 2);
    expect(split.debt_cancelled).toBe(100.11);
    expect(split.cash_refunded).toBe(233.22);
  });

  it('treats a zero return as nothing to settle', () => {
    expect(refundSettlement(0, 500)).toEqual({
      total: 0,
      debt_cancelled: 0,
      cash_refunded: 0,
    });
  });

  it('clamps a negative remaining to zero (defensive)', () => {
    expect(refundSettlement(150, -20)).toEqual({
      total: 150,
      debt_cancelled: 0,
      cash_refunded: 150,
    });
  });
});
