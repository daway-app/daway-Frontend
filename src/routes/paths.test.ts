import { describe, expect, it } from 'vitest';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { medicineEditPath, ROUTES, refundCreatePath } from './paths';

/**
 * Regression guard for the refund link.
 *
 * 🔴 The defect this pins: `ROUTES.accountingRefundsCreate` carries NO
 * `:saleNumber` token, so `ROUTES.accountingRefundsCreate.replace(':saleNumber',
 * n)` was a SILENT no-op. It produced `/accounting/refunds/create`, which React
 * Router then captured with `accounting/refunds/:id` (id = "create") — i.e. the
 * sales list's refund button and the invoice's refund button both opened the
 * refund DETAIL page for a refund that does not exist (blank/404) instead of
 * the refund form. `refundCreatePath` is the single builder both pages now use.
 */
describe('refundCreatePath', () => {
  it('appends the sale number to the create route', () => {
    expect(refundCreatePath('INV-1001')).toBe('/accounting/refunds/create/INV-1001');
  });

  it('never returns the bare create route (which is captured by refunds/:id)', () => {
    const path = refundCreatePath('INV-1001');
    expect(path).not.toBe(ROUTES.accountingRefundsCreate);
    expect(path.startsWith(`${ROUTES.accountingRefundsCreate}/`)).toBe(true);
  });

  it('encodes a sale number that needs it', () => {
    expect(refundCreatePath('INV 10/01')).toBe('/accounting/refunds/create/INV%2010%2F01');
  });
});

/**
 * Route-resolution guard, mirroring the `matchRoutes` convention used by
 * `adminRoutes.test.ts`. It resolves a real location against a structural
 * replica of the refunds sub-tree (identical to `router.tsx`) so the two entry
 * points — the sales log and the invoice — are proven to land on the CREATE
 * page, not the detail page. No React rendering / DOM needed.
 */
describe('refund-create link resolution', () => {
  const REFUNDS_LIST = 'REFUNDS_LIST';
  const REFUND_CREATE = 'REFUND_CREATE';
  const REFUND_SHOW = 'REFUND_SHOW';

  /** Child routes under the accounting section — mirrors `router.tsx`. */
  const tree: RouteObject[] = [
    { path: 'accounting/refunds', element: REFUNDS_LIST },
    { path: 'accounting/refunds/create/:saleNumber', element: REFUND_CREATE },
    { path: 'accounting/refunds/:id', element: REFUND_SHOW },
  ];

  function resolve(pathname: string): string | null {
    const matches = matchRoutes(tree, pathname);
    if (!matches || matches.length === 0) return null;
    const leaf = matches[matches.length - 1];
    const element = (leaf.route as { element?: unknown }).element;
    return typeof element === 'string' ? element : null;
  }

  it('the builder URL (used by the sales log AND the invoice) opens the refund form', () => {
    // Both pages call `refundCreatePath(sale.number)`; this is that URL.
    expect(resolve(refundCreatePath('INV-1001'))).toBe(REFUND_CREATE);
  });

  it('the OLD bare URL was captured by refunds/:id — the bug, pinned', () => {
    // `ROUTES.accountingRefundsCreate.replace(':saleNumber', n)` produced this,
    // and it resolved to the DETAIL page with id="create". Keeping this
    // assertion makes the failure mode explicit, so no one "simplifies" the
    // builder back into a `.replace` call.
    expect(ROUTES.accountingRefundsCreate).toBe('/accounting/refunds/create');
    expect(resolve(ROUTES.accountingRefundsCreate)).toBe(REFUND_SHOW);
  });

  it('the refunds list route is unaffected', () => {
    expect(resolve(ROUTES.accountingRefunds)).toBe(REFUNDS_LIST);
  });
});

describe('medicineEditPath', () => {
  it('builds the edit URL from the pharmacy-medicine id', () => {
    expect(medicineEditPath(23)).toBe('/medicines/23/edit');
  });

  it('encodes an id that needs it', () => {
    expect(medicineEditPath('23/edit')).toBe('/medicines/23%2Fedit/edit');
  });
});
