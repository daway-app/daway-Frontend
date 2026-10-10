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
  inventory: '/admin/inventory',
  patients: '/admin/patients',
  users: '/admin/users',
  logs: '/admin/logs',
  settings: '/admin/settings',
} as const;

export type AdminRoutePath = (typeof ADMIN_ROUTES)[keyof typeof ADMIN_ROUTES];
