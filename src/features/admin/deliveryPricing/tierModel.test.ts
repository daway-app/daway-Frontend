import { describe, expect, it } from 'vitest';
import { formatDistanceRange, validateTierDraft } from './tierModel';

describe('formatDistanceRange', () => {
  it('formats a bounded range in the supplied unit', () => {
    expect(formatDistanceRange(0, 1000, 'مفتوحة', 'م')).toBe('0 – 1000 م');
  });

  it('formats an open-ended range using the supplied labels', () => {
    expect(formatDistanceRange(2000, null, 'مفتوحة', 'م')).toBe('2000 م – مفتوحة');
  });

  it('is language-agnostic: both labels/unit come from the caller', () => {
    expect(formatDistanceRange(2000, null, 'Open', 'm')).toBe('2000 m – Open');
  });
});

describe('validateTierDraft', () => {
  it('accepts a valid bounded draft', () => {
    expect(
      validateTierDraft({ minDistanceMeters: '0', maxDistanceMeters: '1000', fee: '5' }),
    ).toEqual({});
  });

  it('accepts a valid open-ended draft (empty max) and a zero fee', () => {
    expect(
      validateTierDraft({ minDistanceMeters: '2000', maxDistanceMeters: '', fee: '0' }),
    ).toEqual({});
  });

  it('requires the minimum distance', () => {
    const errors = validateTierDraft({ minDistanceMeters: '', maxDistanceMeters: '', fee: '5' });
    expect(errors.minDistanceMeters).toBe('min_required');
  });

  it('rejects a non-integer minimum distance', () => {
    const errors = validateTierDraft({ minDistanceMeters: '1.5', maxDistanceMeters: '', fee: '5' });
    expect(errors.minDistanceMeters).toBe('min_integer');
  });

  it('rejects a negative minimum distance', () => {
    const errors = validateTierDraft({ minDistanceMeters: '-10', maxDistanceMeters: '', fee: '5' });
    expect(errors.minDistanceMeters).toBe('min_integer');
  });

  it('rejects a non-integer maximum distance', () => {
    const errors = validateTierDraft({ minDistanceMeters: '0', maxDistanceMeters: '2.5', fee: '5' });
    expect(errors.maxDistanceMeters).toBe('max_integer');
  });

  it('rejects a negative maximum distance', () => {
    const errors = validateTierDraft({ minDistanceMeters: '0', maxDistanceMeters: '-1', fee: '5' });
    expect(errors.maxDistanceMeters).toBe('max_integer');
  });

  it('rejects a maximum below the minimum', () => {
    const errors = validateTierDraft({
      minDistanceMeters: '1000',
      maxDistanceMeters: '500',
      fee: '5',
    });
    expect(errors.maxDistanceMeters).toBe('max_below_min');
  });

  it('requires the fee', () => {
    const errors = validateTierDraft({ minDistanceMeters: '0', maxDistanceMeters: '', fee: '' });
    expect(errors.fee).toBe('fee_required');
  });

  it('rejects a negative fee', () => {
    const errors = validateTierDraft({ minDistanceMeters: '0', maxDistanceMeters: '', fee: '-1' });
    expect(errors.fee).toBe('fee_negative');
  });

  it('rejects a non-numeric fee', () => {
    const errors = validateTierDraft({ minDistanceMeters: '0', maxDistanceMeters: '', fee: 'abc' });
    expect(errors.fee).toBe('fee_number');
  });
});
