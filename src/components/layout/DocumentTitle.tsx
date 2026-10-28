import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useLang } from '@/lib/lang/useLang';
import { documentTitleFor } from './pageTitles';

/**
 * Keeps `document.title` in sync with the current route and language.
 *
 * THE SINGLE WRITER
 * -----------------
 * `lib/lang/store.ts` used to assign `document.title` on every language change,
 * and this component also reacts to language changes — two writers, one tab.
 * The assignment was therefore REMOVED from the store so this is the only place
 * the document title is set. Nothing else in `src/` writes it (grep
 * `document.title` to verify).
 *
 * DEPENDENCY ON `pathname` ONLY
 * -----------------------------
 * Query-string changes (`?page=2`) keep the same page identity, so they must not
 * retitle the tab. `useLocation()` re-renders on every navigation, but the effect
 * re-runs only when `pathname` (or the dictionary) actually changes.
 *
 * BACK / FORWARD
 * --------------
 * `createBrowserRouter` maps popstate to a navigation, so `pathname` updates and
 * the effect re-runs — no extra popstate listener is needed (and adding one
 * would be a second, competing source of truth).
 *
 * Mounted as a sibling of `SessionExpiryWatcher` on the ROOT layout route: it is
 * inside the router (needs `useLocation`) and inside `LanguageProvider` (needs
 * `useLang`), and it renders nothing.
 */
export function DocumentTitle(): null {
  const { pathname } = useLocation();
  const { STR } = useLang();

  useEffect(() => {
    document.title = documentTitleFor(pathname, STR);
  }, [pathname, STR]);

  return null;
}
