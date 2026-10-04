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
  medicines: '/medicines',
  inquiries: '/inquiries',
  alternatives: '/alternatives',
  ratings: '/ratings',
  profile: '/profile',
  /** Accounting is behind a feature flag in the backend; the route exists here. */
  accounting: '/accounting',
  notFound: '*',
} as const;

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
