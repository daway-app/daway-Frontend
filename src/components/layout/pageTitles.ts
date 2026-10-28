import type { Strings } from '@/lib/lang/types';
import { ROUTES } from '@/routes/paths';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { routeTitleFor } from './routeTitles';

/**
 * Browser-tab title per route.
 *
 * WHY THIS EXISTS
 * ---------------
 * `document.title` used to be written ONCE, by `lib/lang/store.ts`, whenever the
 * language was applied — so every screen in the app shared a single tab title
 * ("دواك — الصيدلية" / "Daway — Pharmacy"). The tab, the window title, the
 * history entry and every bookmark were therefore indistinguishable, and a
 * screen-reader user switching tabs had no way to tell which page they were on.
 *
 * WHAT IS REUSED (and what is NOT duplicated)
 * -------------------------------------------
 * Page names come from the SAME translations the sidebar, the page headers and
 * the topbar already use:
 *   · admin + pharmacy routes → `routeTitleFor()` (the topbar's own resolver)
 *   · auth screens           → their existing headings
 * No new copy is introduced apart from the 404 label, which had no key at all.
 *
 * WHY THE BRAND SUFFIX IS `admin.unified.brand_tag`
 * That key already holds the product name in both dictionaries ("منصة دواك" /
 * "Dawak") and is already rendered on the login screen — reusing it keeps ONE
 * source of truth instead of adding a second, drifting brand string.
 */

/**
 * Collapse a trailing slash so `/login/` resolves like `/login`.
 * React Router keeps whatever the visitor typed, and without this the tab would
 * claim "page not found" on a perfectly valid URL.
 */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.replace(/\/+$/, '') || '/';
  }
  return pathname;
}

/**
 * The page name alone (no brand suffix).
 *
 * Auth screens are resolved BEFORE the shared table on purpose: they are not in
 * the topbar mapping (they have no topbar), and falling through to it would
 * label `/login` as the dashboard.
 */
export function pageTitleFor(pathname: string, STR: Strings): string {
  const path = normalize(pathname);

  if (path === ROUTES.login) return STR.admin.unified.title;
  if (path === ROUTES.register) return STR.register.heading;
  if (path === ROUTES.forgotPassword) return STR.forgot_password.heading;
  if (path === ROUTES.password) return STR.pharmacy.password.change.title;

  // Legacy `/admin/login` immediately redirects to `/login`, but it renders for
  // one frame first — and that frame must not be titled "page not found".
  if (path === ADMIN_ROUTES.login) return STR.admin.login.title;

  // `null` means "no route entry", i.e. the 404 screen — NOT the dashboard.
  return routeTitleFor(path, STR) ?? STR.topbar.not_found_title;
}

/** Full document title: `Page name | Brand`. */
export function documentTitleFor(pathname: string, STR: Strings): string {
  return `${pageTitleFor(pathname, STR)} | ${STR.admin.unified.brand_tag}`;
}
