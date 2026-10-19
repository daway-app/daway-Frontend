import { describe, expect, it } from 'vitest';
import {
  ADJUSTMENT_MAX_AMOUNT,
  buildCashAdjustmentBody,
  resolveAdjustmentDirection,
} from './cashAdjustment';

describe('resolveAdjustmentDirection', () => {
  it('forces `in` for a deposit regardless of the chosen direction', () => {
    expect(resolveAdjustmentDirection('deposit', 'out')).toBe('in');
    expect(resolveAdjustmentDirection('deposit', 'in')).toBe('in');
  });

  it('forces `out` for a withdrawal regardless of the chosen direction', () => {
    expect(resolveAdjustmentDirection('withdrawal', 'in')).toBe('out');
    expect(resolveAdjustmentDirection('withdrawal', 'out')).toBe('out');
  });

  it('lets an adjustment pick its own direction', () => {
    expect(resolveAdjustmentDirection('adjustment', 'in')).toBe('in');
    expect(resolveAdjustmentDirection('adjustment', 'out')).toBe('out');
  });
});

describe('buildCashAdjustmentBody', () => {
  const valid = {
    kind: 'adjustment' as const,
    amount: 120.5,
    reason: 'تسوية فرق جرد',
    direction: 'out' as const,
  };

  it('accepts a valid adjustment and trims the reason', () => {
    const outcome = buildCashAdjustmentBody({ ...valid, reason: '  تسوية فرق جرد  ' });

    expect(outcome).toEqual({
      ok: true,
      body: {
        direction: 'out',
        kind: 'adjustment',
        amount: 120.5,
        reason: 'تسوية فرق جرد',
      },
    });
  });

  it('derives the direction for deposit/withdrawal (never a conflicting body)', () => {
    const deposit = buildCashAdjustmentBody({ ...valid, kind: 'deposit', direction: 'out' });
    expect(deposit).toEqual({
      ok: true,
      body: { direction: 'in', kind: 'deposit', amount: 120.5, reason: 'تسوية فرق جرد' },
    });

    const withdrawal = buildCashAdjustmentBody({ ...valid, kind: 'withdrawal', direction: 'in' });
    expect(withdrawal).toEqual({
      ok: true,
      body: { direction: 'out', kind: 'withdrawal', amount: 120.5, reason: 'تسوية فرق جرد' },
    });
  });

  it('rejects a zero, negative, non-finite or oversized amount', () => {
    for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, ADJUSTMENT_MAX_AMOUNT + 1]) {
      const outcome = buildCashAdjustmentBody({ ...valid, amount });
      expect(outcome).toEqual({ ok: false, errors: ['amount'] });
    }
  });

  it('rejects the backend minimum boundary: an amount above the ceiling only', () => {
    expect(buildCashAdjustmentBody({ ...valid, amount: ADJUSTMENT_MAX_AMOUNT })).toEqual({
      ok: true,
      body: { direction: 'out', kind: 'adjustment', amount: ADJUSTMENT_MAX_AMOUNT, reason: 'تسوية فرق جرد' },
    });
  });

  it('rejects a reason shorter than 3 or longer than 500 chars (after trim)', () => {
    expect(buildCashAdjustmentBody({ ...valid, reason: '  س  ' })).toEqual({
      ok: false,
      errors: ['reason'],
    });
    expect(buildCashAdjustmentBody({ ...valid, reason: 'س'.repeat(501) })).toEqual({
      ok: false,
      errors: ['reason'],
    });
  });

  it('rejects an adjustment with no direction chosen', () => {
    // The page passes `''` before a direction is picked; the pure module treats
    // anything that is not in/out as missing.
    const outcome = buildCashAdjustmentBody({ ...valid, direction: '' as never });
    expect(outcome).toEqual({ ok: false, errors: ['direction'] });
  });

  it('collects ALL field errors together, not just the first', () => {
    const outcome = buildCashAdjustmentBody({
      kind: 'adjustment',
      amount: -1,
      reason: 'س',
      direction: '' as never,
    });
    expect(outcome).toEqual({ ok: false, errors: ['amount', 'reason', 'direction'] });
  });
});
