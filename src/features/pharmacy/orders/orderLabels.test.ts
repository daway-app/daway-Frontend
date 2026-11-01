import { describe, expect, it } from 'vitest';
import { orderStatusLabel, paymentStatusLabel } from './orderLabels';

const strings = {
  statuses: { ready: 'جاهز للاستلام أو التوصيل' },
  payments: { problem_reported: 'بلاغ مشكلة دفع' },
} as never;

describe('incoming order labels', () => {
  it('uses the server status keys and leaves unknown keys visible', () => {
    expect(orderStatusLabel('ready', strings)).toBe('جاهز للاستلام أو التوصيل');
    expect(orderStatusLabel('future_status', strings)).toBe('future_status');
  });

  it('makes a payment problem explicit to the pharmacy', () => {
    expect(paymentStatusLabel('problem_reported', strings)).toBe('بلاغ مشكلة دفع');
  });
});
