import { describe, expect, it } from 'vitest';
import type { ApiCustomer } from '@/api/pharmacyTypes';
import { pickExactCustomer } from './customerPicker';

function customer(over: Partial<ApiCustomer> = {}): ApiCustomer {
  return {
    id: 1,
    name: 'Ahmad Ali',
    phone: null,
    email: null,
    notes: null,
    current_balance: 0,
    credit_limit: 0,
    credit_limit_label: '',
    is_active: true,
    exceeds_credit_limit: false,
    created_at: null,
    ...over,
  };
}

describe('pickExactCustomer', () => {
  it('returns the customer for a unique exact name match', () => {
    const target = customer({ id: 7, name: 'Ahmad Ali' });
    const result = pickExactCustomer([customer({ id: 1, name: 'Sami' }), target], 'Ahmad Ali');

    expect(result).toBe(target);
  });

  it('ignores case and surrounding whitespace on both sides', () => {
    const target = customer({ id: 7, name: '  AHMAD ALI  ' });
    const result = pickExactCustomer([target], '  ahmad ali  ');

    expect(result).toBe(target);
  });

  it('returns null when nothing matches', () => {
    expect(pickExactCustomer([customer({ name: 'Sami' })], 'Ahmad Ali')).toBeNull();
  });

  it('returns null for duplicate names because the match is ambiguous', () => {
    const customers = [
      customer({ id: 1, name: 'Ahmad Ali' }),
      customer({ id: 2, name: 'ahmad ali' }),
    ];

    expect(pickExactCustomer(customers, 'Ahmad Ali')).toBeNull();
  });

  it('returns null for an empty term', () => {
    expect(pickExactCustomer([customer()], '')).toBeNull();
    expect(pickExactCustomer([customer()], '   ')).toBeNull();
  });

  it('returns null for a non-exact partial name', () => {
    expect(pickExactCustomer([customer({ name: 'Ahmad Ali' })], 'Ahmad')).toBeNull();
  });
});
