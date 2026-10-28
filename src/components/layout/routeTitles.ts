import { AR } from '@/lib/i18n';
import type { Strings } from '@/lib/lang/types';
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

type Entry = {
  path: string;
  title: string;
  /**
   * Match ONLY the exact path, never as a prefix.
   *
   * Needed for `ADMIN_ROUTES.dashboard` (`/admin`): it is a literal prefix of
   * every other admin route, so a typo like `/admin/userz` used to resolve to
   * the dashboard title — harmless for the topbar (which falls back to the same
   * string anyway) but wrong for the DOCUMENT title, where the 404 screen would
   * announce itself as the dashboard.
   */
  exactOnly?: boolean;
};

/**
 * `/admin/users/<id>/edit` — the only admin route whose path cannot be written
 * as a static string.
 *
 * WHY A REGEX AND NOT AN ENTRY
 * ----------------------------
 * `match()` is a longest-prefix table over literal strings, which works for
 * every other route because they are constants. `ADMIN_ROUTES.userEdit` is a
 * BUILDER FUNCTION (`(id) => `/admin/users/${id}/edit``), so there is no string
 * to put in the table — and a bare `/admin/users` entry already matches every
 * `/admin/users/...` path, so both form screens silently inherited the users
 * LIST title ("المستخدمون" / "Users") while showing a completely different
 * screen.
 *
 * Kept deliberately narrow (`[^/]+` for the id, anchored end) so it cannot
 * swallow `/admin/users/create` or any future sub-route.
 */
const ADMIN_USER_EDIT_PATH = /^\/admin\/users\/[^/]+\/edit$/;

export interface TopbarTitle {
  title: string;
  subtitle: string;
}

/** Matches `pathname` against an entry list, longest path first. */
function match(entries: Entry[], pathname: string): string | null {
  const sorted = [...entries].sort((a, b) => b.path.length - a.path.length);
  for (const e of sorted) {
    if (pathname === e.path) return e.title;
    if (!e.exactOnly && pathname.startsWith(`${e.path}/`)) return e.title;
  }
  return null;
}

/** Admin nav labels. `match()` sorts by path length, so the order here is cosmetic. */
function adminEntries(STR: Strings): Entry[] {
  return [
    { path: ADMIN_ROUTES.dashboard, title: STR.admin.nav.dashboard, exactOnly: true },
    { path: ADMIN_ROUTES.pharmacies, title: STR.admin.nav.pharmacies },
    { path: ADMIN_ROUTES.medicines, title: STR.admin.nav.medicines },
    { path: ADMIN_ROUTES.medicineRequests, title: STR.admin.nav.medicine_requests },
    { path: ADMIN_ROUTES.categories, title: STR.admin.nav.categories },
    { path: ADMIN_ROUTES.users, title: STR.admin.nav.users },
    { path: ADMIN_ROUTES.logs, title: STR.admin.nav.activity_log },
    { path: ADMIN_ROUTES.settings, title: STR.admin.nav.system_settings },
    { path: ADMIN_ROUTES.paymentBanks, title: STR.admin.nav.payment_banks },
    { path: ADMIN_ROUTES.payments, title: STR.admin.nav.payments },
    { path: ADMIN_ROUTES.paymentProblems, title: STR.admin.nav.payment_problems },
    { path: ADMIN_ROUTES.profile, title: STR.admin.nav.profile },
  ];
}

/** Pharmacy nav labels. */
function pharmacyEntries(STR: Strings): Entry[] {
  return [
    { path: ROUTES.inventoryImport, title: STR.pharmacyImport.title },
    { path: ROUTES.medicines, title: STR.pharmacy.medicines.index.heading_page },
    { path: ROUTES.inquiries, title: STR.pharmacy.inquiries.heading },
    { path: ROUTES.alternatives, title: STR.pharmacy.alternatives.index.heading_page },
    { path: ROUTES.ratings, title: STR.pharmacy.ratings.heading_page },
    { path: ROUTES.profile, title: STR.pharmacy.profile.heading_page },
    { path: ROUTES.accounting, title: STR.accounting.sidebar.section_title },
  ];
}

/**
 * The page title for `pathname`, or `null` when the path has NO entry.
 *
 * WHY THIS IS NULLABLE, AND WHY IT IS EXPORTED
 * `topbarTitleFor` must always render something, so it falls back to the
 * dashboard pair — which means its OUTPUT cannot tell "this is the dashboard"
 * apart from "nothing matched". The DOCUMENT title needs that distinction: an
 * unknown path renders the 404 screen, and a browser tab reading
 * "لوحة الإحصائيات" on a 404 page is simply wrong. Both callers now share this
 * resolver: the topbar adds the fallback, the document title turns `null` into
 * the 404 label.
 *
 * User CREATE / EDIT resolve BEFORE the prefix table — a form screen is not the
 * list screen, but every `/admin/users/...` path matches `/admin/users`.
 */
export function routeTitleFor(pathname: string, STR: Strings = AR): string | null {
  if (pathname === ADMIN_ROUTES.login) return STR.admin.login.title;

  if (pathname === ADMIN_ROUTES.userCreate) return STR.admin.users.form.create_title;
  if (ADMIN_USER_EDIT_PATH.test(pathname)) return STR.admin.users.action_edit;

  if (pathname.startsWith('/admin')) return match(adminEntries(STR), pathname);
  if (pathname === ROUTES.dashboard) return STR.topbar.dashboard_title;

  return match(pharmacyEntries(STR), pathname);
}

/**
 * Title + subtitle for the topbar. Falls back to the Blade pair when the route
 * has no entry (the dashboard, or any screen added later).
 *
 * Behaviour is unchanged by the `routeTitleFor` extraction above — the fallbacks
 * live HERE because only the topbar has to render something unconditionally.
 */
export function topbarTitleFor(pathname: string, STR: Strings = AR): TopbarTitle {
  if (pathname === ADMIN_ROUTES.login) {
    return { title: STR.admin.login.title, subtitle: STR.admin.login.subtitle };
  }

  /**
   * User CREATE / EDIT resolve BEFORE the prefix table.
   *
   * A form screen is not the list screen, but every `/admin/users/...` path
   * matches the `/admin/users` entry below, so without these two checks both
   * forms announced themselves as "Users". Checked first because they are more
   * specific than any entry the table can express.
   *
   * The edit title uses `users.action_edit` ("تعديل المستخدم" / "Edit User")
   * rather than `users.form.edit_title`, which is `"تعديل المستخدم: {name}"`:
   * this function receives only a pathname, so it has no user record to fill
   * `{name}` from, and emitting a literal `{name}` (or a bare `…`) into the
   * topbar would be worse than the generic form. The page's own `<h1>` still
   * carries the real name.
   */
  if (pathname === ADMIN_ROUTES.userCreate) {
    return {
      title: STR.admin.users.form.create_title,
      subtitle: STR.admin.nav.panel_subtitle,
    };
  }
  if (ADMIN_USER_EDIT_PATH.test(pathname)) {
    return {
      title: STR.admin.users.action_edit,
      subtitle: STR.admin.nav.panel_subtitle,
    };
  }

  if (pathname.startsWith('/admin')) {
    return {
      title: match(adminEntries(STR), pathname) ?? STR.admin.nav.dashboard,
      subtitle: STR.admin.nav.panel_subtitle,
    };
  }

  if (pathname === ROUTES.dashboard) {
    return {
      title: STR.topbar.dashboard_title,
      subtitle: STR.topbar.dashboard_subtitle,
    };
  }

  const matchedTitle = match(pharmacyEntries(STR), pathname);
  return {
    title: matchedTitle ?? STR.topbar.dashboard_title,
    subtitle: matchedTitle ? STR.pharmacy.sidebar.section_title : STR.topbar.dashboard_subtitle,
  };
}
