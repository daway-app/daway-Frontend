import { describe, expect, it } from 'vitest';
import { ApiError } from '@/api/errors';
import { parseAmountUnmatched } from './paymentShared';

describe('parseAmountUnmatched', () => {
  it('returns null for non-ApiError', () => {
    expect(parseAmountUnmatched(new Error('something'))).toBeNull();
    expect(parseAmountUnmatched('string error')).toBeNull();
    expect(parseAmountUnmatched(null)).toBeNull();
  });

  it('returns null for errors without amount_unmatched code', () => {
    const err = new ApiError({
      kind: 'validation',
      status: 422,
      message: 'Validation failed.',
    });
    expect(parseAmountUnmatched(err)).toBeNull();
  });

  it('parses deficit from nested data.code (backend shape)', () => {
    const err = new ApiError({
      kind: 'validation',
      status: 422,
      message: 'مبلغ التحويل لا يطابق إجمالي الطلب.',
      data: {
        code: 'amount_unmatched',
        grand_total: 150.0,
        deficit: 50.0,
      },
    });

    const result = parseAmountUnmatched(err);
    expect(result).toEqual({
      code: 'amount_unmatched',
      grand_total: 150,
      deficit: 50,
    });
    expect(result?.overage).toBeUndefined();
  });

  it('parses overage from nested data.code (backend shape)', () => {
    const err = new ApiError({
      kind: 'validation',
      status: 422,
      message: 'مبلغ التحويل لا يطابق إجمالي الطلب.',
      data: {
        code: 'amount_unmatched',
        grand_total: 150.0,
        overage: 30.0,
      },
    });

    const result = parseAmountUnmatched(err);
    expect(result).toEqual({
      code: 'amount_unmatched',
      grand_total: 150,
      overage: 30,
    });
    expect(result?.deficit).toBeUndefined();
  });

  it('parses amount_unmatched from top-level code (future-proof)', () => {
    const err = new ApiError({
      kind: 'validation',
      status: 422,
      code: 'amount_unmatched',
      message: 'مبلغ التحويل لا يطابق إجمالي الطلب.',
      data: {
        grand_total: 150.0,
        deficit: 50.0,
      },
    });

    const result = parseAmountUnmatched(err);
    expect(result).toEqual({
      code: 'amount_unmatched',
      grand_total: 150,
      deficit: 50,
    });
  });

  it('returns null when grand_total is missing', () => {
    const err = new ApiError({
      kind: 'validation',
      status: 422,
      data: {
        code: 'amount_unmatched',
        deficit: 50.0,
      },
    });

    expect(parseAmountUnmatched(err)).toBeNull();
  });

  it('coerces string-valued numeric fields', () => {
    const err = new ApiError({
      kind: 'validation',
      status: 422,
      data: {
        code: 'amount_unmatched',
        grand_total: '150.00',
        deficit: '50.00',
      },
    });

    const result = parseAmountUnmatched(err);
    expect(result).toEqual({
      code: 'amount_unmatched',
      grand_total: 150,
      deficit: 50,
    });
  });
});
