/**
 * Intent-based route preloading.
 *
 * A map of URL path → dynamic import() for each route page. Invoked on hover/focus
 * of sidebar nav links so the chunk arrives before the click resolves. The browser
 * deduplicates concurrent imports() of the same module, so calling this twice for
 * the same route is a no-op.
 *
 * Slow-connection guard: if `navigator.connection.saveData` is true we do nothing,
 * so preload-on-hover never burns bandwidth on metered/slow links.
 */
const PRELOAD_MAP: Record<string, () => Promise<unknown>> = {
  // Auth
  '/login': () => import('@/features/auth/LoginPage'),
  '/change-password': () => import('@/features/auth/PasswordChangePage'),

  // Pharmacy
  '/': () => import('@/features/pharmacy/dashboard/DashboardPage'),
  '/inventory': () => import('@/features/pharmacy/inventory/InventoryPage'),
  '/inventory/import': () => import('@/features/pharmacy/import/InventoryImportPage'),
  '/medicines': () => import('@/features/pharmacy/medicines/MedicinesPage'),
  '/medicines/create': () => import('@/features/pharmacy/medicines/MedicineRequestPage'),
  '/medicines/request': () => import('@/features/pharmacy/medicines/MedicineRequestPage'),
  '/inquiries': () => import('@/features/pharmacy/inquiries/InquiriesPage'),
  '/inquiries/:id/chat': () => import('@/features/pharmacy/inquiries/InquiryChatPage'),
  '/alternatives': () => import('@/features/pharmacy/alternatives/AlternativesPage'),
  '/alternatives/create': () => import('@/features/pharmacy/alternatives/AlternativeCreatePage'),
  '/ratings': () => import('@/features/pharmacy/ratings/RatingsPage'),
  '/profile': () => import('@/features/pharmacy/profile/ProfilePage'),
  '/profile/complete': () => import('@/features/pharmacy/profile/ProfileCompletePage'),

  // Accounting
  '/accounting': () => import('@/features/pharmacy/accounting/AccountingOverviewPage'),
  '/accounting/sales': () => import('@/features/pharmacy/accounting/AccountingSalesPage'),
  '/accounting/sales/create': () => import('@/features/pharmacy/accounting/AccountingSaleCreatePage'),
  '/accounting/refunds': () => import('@/features/pharmacy/accounting/AccountingRefundsPage'),
  '/accounting/refunds/create': () => import('@/features/pharmacy/accounting/AccountingRefundCreatePage'),
  '/accounting/cash': () => import('@/features/pharmacy/accounting/AccountingCashPage'),

  // Admin
  '/admin': () => import('@/features/admin/dashboard/AdminDashboardPage'),
  '/admin/pharmacies': () => import('@/features/admin/pharmacies/AdminPharmaciesPage'),
  '/admin/medicines': () => import('@/features/admin/medicines/AdminMedicinesPage'),
  '/admin/medicines/create': () => import('@/features/admin/medicines/AdminMedicineFormPage'),
  '/admin/requests': () => import('@/features/admin/requests/AdminMedicineRequestsPage'),
  '/admin/categories': () => import('@/features/admin/categories/AdminCategoriesPage'),
  '/admin/users': () => import('@/features/admin/users/AdminUsersPage'),
  '/admin/users/create': () => import('@/features/admin/users/AdminUserFormPage'),
  '/admin/logs': () => import('@/features/admin/logs/AdminLogsPage'),
  '/admin/settings': () => import('@/features/admin/settings/AdminSettingsPage'),
  '/admin/delivery-pricing': () =>
    import('@/features/admin/deliveryPricing/AdminDeliveryPricingPage'),
  '/admin/profile': () => import('@/features/admin/profile/AdminProfilePage'),
};

/** Returns true if the given path has a registered preload. */
export function canPreload(path: string): boolean {
  return path in PRELOAD_MAP;
}

/**
 * Fire-and-forget preload of a route's JS chunk.
 *
 * No-op when `save-data` is enabled by the browser. Safe to call multiple times;
 * the browser dedupes the import().
 */
export function preloadRoute(path: string): void {
  if (typeof navigator === 'undefined') return;
  // @ts-expect-error — connection is not yet in the TS DOM lib but widely supported.
  if (navigator.connection?.saveData) return;

  const loader = PRELOAD_MAP[path];
  if (loader) loader();
}
