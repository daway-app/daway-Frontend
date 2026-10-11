/**
 * Admin route paths.
 *
 * Namespaced under `/admin` so they can never collide with a pharmacy path —
 * which matters because both live in ONE router and one bundle. A collision
 * here would be a silent, hard-to-find routing bug.
 */
export const ADMIN_ROUTES = {
  login: '/admin/login',
  dashboard: '/admin',
  pharmacies: '/admin/pharmacies',
  medicines: '/admin/medicines',
  medicineRequests: '/admin/medicine-requests',
  categories: '/admin/categories',
  users: '/admin/users',
  logs: '/admin/logs',
  settings: '/admin/settings',
  profile: '/admin/profile',
  /**
   * Password change is a SEPARATE route, not a modal on the profile page.
   *
   * It is declared AFTER `profile` and as a distinct literal so the router
   * ranks it above any future `/admin/profile/*` catch-all. Keeping it its own
   * URL matters because a successful change ends the session — a redirected
   * re-login reads correctly from a dedicated screen but not from an overlay.
   */
  profilePassword: '/admin/profile/password',
} as const;

export type AdminRoutePath = (typeof ADMIN_ROUTES)[keyof typeof ADMIN_ROUTES];
