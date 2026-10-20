import type { ApiCustomer } from '@/api/pharmacyTypes';

export function pickExactCustomer(
  customers: readonly ApiCustomer[],
  term: string,
): ApiCustomer | null {
  const needle = term.trim().toLowerCase();
  if (needle === '') {
    return null;
  }

  const matches = customers.filter(
    (customer) => customer.name.trim().toLowerCase() === needle,
  );

  return matches.length === 1 ? matches[0] : null;
}
