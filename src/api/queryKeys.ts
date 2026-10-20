/**
 * Hierarchical query keys — ALL scoped to authenticated identity.
 *
 * Every pharmacy key begins with ['pharmacy', pharmacyId, ...] and every
 * admin key with ['admin', adminId, ...], so:
 *   - two different pharmacists never share cache entries (isolation by identity)
 *   - invalidateQueries(['pharmacy', id]) tears down one user's data cleanly
 *   - logout calls queryClient.clear() and the keys are gone with it
 *
 * staleTime is NOT encoded in the key (it is a per-query option) but the
 * grouping convention here makes it easy to invalidate at the right grain.
 *
 * The `pharmacy(id)` / `admin(id)` factory functions exist so callers never
 * hardcode the identity prefix and accidentally drop it.
 */
import { PRESET_STALE_TIMES } from '@/api/queryClient';

// Mirrors the `Query` type in pharmacyApi.ts (string|number|boolean|undefined
// record) — kept inline to avoid a dependency on that module which would
// create a type-only circular import with queryClient.
type ListQuery = Record<string, string | number | boolean | undefined>;

/**
 * Build the full pharmacy key set for a given authenticated user.
 * Called inside components (which have the user id from auth state), NOT at
 * module scope — the id is only known after login.
 */
export function pharmacyKeys(id: string | number) {
  const base = ['pharmacy', String(id)] as const;
  return {
    all: [...base, 'all'] as const,
    dashboardStats: [...base, 'dashboard', 'stats'] as const,
    profile: [...base, 'profile'] as const,
    inventory: {
      all: [...base, 'inventory'] as const,
      list: (q?: ListQuery) => [...base, 'inventory', 'list', q] as const,
      detail: (medicineId: number) => [...base, 'inventory', 'detail', medicineId] as const,
    },
    inquiries: {
      all: [...base, 'inquiries'] as const,
      list: (q?: ListQuery) => [...base, 'inquiries', 'list', q] as const,
      detail: (id: number) => [...base, 'inquiries', 'detail', id] as const,
      messages: (id: number) => [...base, 'inquiries', 'messages', id] as const,
    },
    medicines: {
      search: (term: string) => [...base, 'medicines', 'search', term] as const,
    },
    alternatives: {
      all: [...base, 'alternatives'] as const,
      list: (q?: ListQuery) => [...base, 'alternatives', 'list', q] as const,
    },
    ratings: [...base, 'ratings'] as const,
    sales: (q?: ListQuery) => [...base, 'sales', q] as const,
    sale: (saleNumber: string) => [...base, 'sales', 'detail', saleNumber] as const,
    refundableItems: (saleNumber: string) =>
      [...base, 'sales', 'refund-items', saleNumber] as const,
    refunds: (q?: ListQuery) => [...base, 'refunds', q] as const,
    refund: (refundId: number) => [...base, 'refunds', 'detail', refundId] as const,
    accountingOverview: (range: string) => [...base, 'accounting', 'overview', range] as const,
    cash: (q?: ListQuery) => [...base, 'cash', q] as const,
    expenses: (q?: ListQuery) => [...base, 'expenses', q] as const,
    customers: [...base, 'customers'] as const,
    customersPicker: [...base, 'customers', 'picker'] as const,
    suppliers: [...base, 'suppliers'] as const,
    // Sidebar badges: unread inquiries + low stock
    sidebarCounts: [...base, 'sidebar', 'counts'] as const,
    // Phone-as-scanner: the active scan session, if one is open on this screen.
    scanSession: (sessionId: string) => [...base, 'scan-session', sessionId] as const,
  };
}

export function adminKeys(id: string | number) {
  const base = ['admin', String(id)] as const;
  return {
    all: [...base, 'all'] as const,
    dashboard: [...base, 'dashboard'] as const,
    profile: [...base, 'profile'] as const,
    pharmacies: {
      list: (q?: ListQuery) => [...base, 'pharmacies', 'list', q] as const,
      passwordResetRequests: [...base, 'pharmacies', 'password-reset-requests'] as const,
    },
    medicines: {
      list: (q?: ListQuery) => [...base, 'medicines', 'list', q] as const,
      detail: (medicineId: number) => [...base, 'medicines', 'detail', medicineId] as const,
    },
    medicineRequests: {
      list: (q?: ListQuery) => [...base, 'medicine-requests', 'list', q] as const,
    },
    categories: {
      list: (q?: ListQuery) => [...base, 'categories', 'list', q] as const,
      links: (categoryId: number, q?: ListQuery) =>
        [...base, 'categories', categoryId, 'links', q] as const,
    },
    users: {
      list: (q?: ListQuery) => [...base, 'users', 'list', q] as const,
      detail: (userId: number) => [...base, 'users', 'detail', userId] as const,
    },
    logs: {
      list: (q?: ListQuery) => [...base, 'logs', 'list', q] as const,
    },
    settings: [...base, 'settings'] as const,
    deliveryPricing: [...base, 'delivery-pricing'] as const,
  };
}

/** Public, unauthenticated endpoints — no identity prefix. */
export const publicKeys = {
  categories: ['public', 'categories'] as const,
  medicineByBarcode: (barcode: string) => ['public', 'medicine', barcode] as const,
} as const;

/** Re-export stale-time presets for co-location with keys. */
export { PRESET_STALE_TIMES };
