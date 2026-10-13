import { AR } from '@/lib/i18n';
import { ROUTES } from '@/routes/paths';
import { ADMIN_ROUTES } from '@/routes/adminPaths';

/**
 * Topbar title per route.
 *
 * WHY THIS EXISTS
 * ---------------
 * Blade renders ONE static pair — `topbar.dashboard_title` / `_subtitle` — on
 * every page (components/topbar.blade.php), so the bar said "لوحة الإحصائيات"
 * even while the user was on the inventory screen. The pages themselves carry
 * their own `<PageHeader>`, so the bar was a second, always-wrong title.
 *
 * The labels below are the SAME strings the sidebar and the page headers
 * already use — no new copy is introduced, so nothing needs translating twice.
 * Matching is longest-prefix-first, because `/admin` is a prefix of every admin
 * route and `/` is a prefix of everything.
 */

type Entry = { path: string; title: string };

const ADMIN_ENTRIES: Entry[] = [
  { path: ADMIN_ROUTES.dashboard, title: AR.admin.nav.dashboard },
  { path: ADMIN_ROUTES.pharmacies, title: AR.admin.nav.pharmacies },
  { path: ADMIN_ROUTES.medicines, title: AR.admin.nav.medicines },
  { path: ADMIN_ROUTES.medicineRequests, title: AR.admin.nav.medicine_requests },
  { path: ADMIN_ROUTES.categories, title: AR.admin.nav.categories },
  { path: ADMIN_ROUTES.users, title: AR.admin.nav.users },
  { path: ADMIN_ROUTES.logs, title: AR.admin.nav.activity_log },
  { path: ADMIN_ROUTES.settings, title: AR.admin.nav.system_settings },
  { path: ADMIN_ROUTES.profile, title: AR.admin.nav.profile },
];

const PHARMACY_ENTRIES: Entry[] = [
  { path: ROUTES.inventory, title: AR.pharmacy.sidebar.inventory },
  { path: ROUTES.medicines, title: AR.pharmacy.sidebar.manage_medicines },
  { path: ROUTES.inquiries, title: AR.pharmacy.sidebar.inquiries },
  { path: ROUTES.alternatives, title: AR.pharmacy.sidebar.manage_alternatives },
  { path: ROUTES.ratings, title: AR.pharmacy.sidebar.ratings },
  { path: ROUTES.profile, title: AR.pharmacy.sidebar.pharmacy_profile },
  { path: ROUTES.accounting, title: AR.accounting.sidebar.section_title },
];

export interface TopbarTitle {
  title: string;
  subtitle: string;
}

/** Matches `pathname` against an entry list, longest path first. */
function match(entries: Entry[], pathname: string): string | null {
  const sorted = [...entries].sort((a, b) => b.path.length - a.path.length);
  for (const e of sorted) {
    if (pathname === e.path || pathname.startsWith(`${e.path}/`)) return e.title;
  }
  return null;
}

/**
 * Title + subtitle for the topbar. Falls back to the Blade pair when the route
 * has no entry (the dashboard, or any screen added later).
 */
export function topbarTitleFor(pathname: string): TopbarTitle {
  if (pathname === ADMIN_ROUTES.login) {
    return { title: AR.admin.login.title, subtitle: AR.admin.login.subtitle };
  }
  if (pathname.startsWith('/admin')) {
    return {
      title: match(ADMIN_ENTRIES, pathname) ?? AR.admin.nav.dashboard,
      subtitle: AR.admin.nav.panel_subtitle,
    };
  }
  return {
    title: match(PHARMACY_ENTRIES, pathname) ?? AR.topbar.dashboard_title,
    subtitle:
      pathname === ROUTES.dashboard
        ? AR.topbar.dashboard_subtitle
        : AR.pharmacy.sidebar.section_title,
  };
}
