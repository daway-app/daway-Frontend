import { describe, expect, it } from 'vitest';
import { shouldLoadSetupSales } from './setupSales';

describe('dashboard setup sales request', () => {
  it.each([
    [true, false, true],
    [false, false, false],
    [true, true, false],
    [false, true, false],
  ])('visible=%s dismissed=%s requests sales=%s', (visible, dismissed, expected) => {
    expect(shouldLoadSetupSales(visible, dismissed)).toBe(expected);
  });
});

// Exercise TanStack's real enabled/disabled behavior with a counted query.
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { vi } from 'vitest';

it('fetches sales only when the visible checklist needs it', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const fetchSales = vi.fn(async () => ({ pagination: { total: 3 } }));
  const observer = new QueryObserver(client, {
    queryKey: ['test', 'sales'], queryFn: fetchSales,
    enabled: shouldLoadSetupSales(false, false),
  });
  const unsubscribe = observer.subscribe(() => {});
  await Promise.resolve();
  expect(fetchSales).toHaveBeenCalledTimes(0);
  observer.setOptions({ queryKey: ['test', 'sales'], queryFn: fetchSales,
    enabled: shouldLoadSetupSales(true, false) });
  await vi.waitFor(() => expect(observer.getCurrentResult().data?.pagination.total).toBe(3));
  expect(fetchSales).toHaveBeenCalledTimes(1);
  unsubscribe();
  client.clear();
});
