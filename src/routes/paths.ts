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
  /**
   * Pharmacy self-registration — a PUBLIC screen, the counterpart of `login`.
   *
   * It files an application, not an account: the backend stores the pharmacy as
   * `pending_approval` and the credentials (Pharmacy ID + password) only arrive
   * by SMS after an admin approves it. See `RegisterPage`.
   */
  register: '/register',
  /**
   * Forgot-password REQUEST — a PUBLIC screen, the sibling of `register`.
   *
   * It files a REVIEW REQUEST, not a reset: the backend queues a
   * `pending` item for an admin, answers 202 with the same message whether
   * the details match or not (anti-enumeration), and NO password is issued
   * here. See `ForgotPasswordPage`.
   */
  forgotPassword: '/forgot-password',
  dashboard: '/',
  /** Bulk inventory import (pharmacy/import/*). */
  inventoryImport: '/inventory/import',
  medicines: '/medicines',
  medicinesUncategorized: '/medicines/uncategorized',
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

export function medicineEditPath(id: number | string): string {
  return `/medicines/${encodeURIComponent(String(id))}/edit`;
}

/**
 * `/accounting/refunds/create/<saleNumber>` — the refund form for ONE sale.
 *
 * 🔴 Regression guard. `ROUTES.accountingRefundsCreate` intentionally carries NO
 * `:saleNumber` token, so calling `.replace(':saleNumber', n)` on it is a NO-OP:
 * it silently produced `/accounting/refunds/create`, which is then captured by
 * `accounting/refunds/:id` (id = "create") and rendered the refund DETAIL page
 * for a refund that does not exist — a blank/404 screen instead of the refund
 * form. Building the path here (and testing it) is why that cannot come back.
 */
export function refundCreatePath(saleNumber: string): string {
  return `${ROUTES.accountingRefundsCreate}/${encodeURIComponent(saleNumber)}`;
}
