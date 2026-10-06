/**
 * Route paths — the single place URLs are declared.
 *
 * Organised around pharmacy features, NOT mirrored 1:1 from Laravel's
 * `routes/web.php`. Where a public URL matters it is preserved.
 *
 * Pharmacy scope only. No patient routes exist here by design.
 */
export const ROUTES = {
  login: '/login',
  dashboard: '/',
  inventory: '/inventory',
  /** Bulk inventory import (pharmacy/import/*). */
  inventoryImport: '/inventory/import',
  medicines: '/medicines',
  medicineCreate: '/medicines/create',
  /** `pharmacy.medicines.request.create` — request a medicine absent from the catalogue. */
  medicineRequests: '/medicines/request',
  inquiries: '/inquiries',
  alternatives: '/alternatives',
  ratings: '/ratings',
  profile: '/profile',
  /** `pharmacy.profile.complete` — first-run profile completion wizard. */
  profileComplete: '/profile/complete',
  /** `pharmacy.password.change` — standalone password change screen (B4). */
  password: '/password',
  /** Accounting is behind a feature flag in the backend; the route exists here. */
  accounting: '/accounting',
  accountingSales: '/accounting/sales',
  accountingSalesCreate: '/accounting/sales/create',
  accountingRefunds: '/accounting/refunds',
  accountingRefundsCreate: '/accounting/refunds/create',
  accountingCash: '/accounting/cash',
  notFound: '*',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
