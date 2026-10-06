/**
 * Mapping between URLs the API returns and routes inside this SPA.
 *
 * Several accounting endpoints build their `href` fields with Laravel's
 * `url()` helper, so they arrive as ABSOLUTE links to the Blade app:
 *
 *   http://127.0.0.1:8000/pharmacy/accounting/sales
 *
 * Rendering that in a `<Link to={...}>` would navigate the user out of the SPA
 * and into the Blade dashboard — a real defect, and an easy one to miss because
 * the link "works". It must be converted to the SPA's own route first.
 *
 * The SPA mirrors the Blade pharmacy paths without the `/pharmacy` prefix
 * (`/pharmacy/accounting/sales` → `/accounting/sales`).
 */

/** Known Blade → SPA path corrections, applied after the prefix strip. */
const PATH_ALIASES: Record<string, string> = {
  '/': '/',
};

/**
 * Convert an API-returned `href` into an in-app route.
 *
 * Returns `null` for a missing value so callers can fall back to a non-link.
 * A relative href (`/pharmacy/accounting/sales`) is handled too, since the
 * backend may emit either form.
 */
export function toAppRoute(href: string | null | undefined): string | null {
  if (!href) return null;

  // Drop scheme + host for absolute / protocol-relative URLs.
  let path = href.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');

  // A bare host with no path (e.g. "http://host") collapses to ''.
  if (path === '') return '/';

  if (!path.startsWith('/')) path = `/${path}`;

  // The SPA does not carry the `/pharmacy` prefix.
  path = path.replace(/^\/pharmacy(?=\/|$)/, '');

  if (path === '') return '/';

  return PATH_ALIASES[path] ?? path;
}

/**
 * Is this href one the SPA can navigate to?
 *
 * Guards against rendering an internal `<Link>` for a genuinely external URL
 * (a different host, a CDN, docs) — those must stay plain anchors.
 */
export function isInternalHref(href: string | null | undefined): boolean {
  if (!href) return false;
  // Relative paths are internal by definition.
  if (href.startsWith('/')) return true;

  try {
    const url = new URL(href);
    // Same-origin absolute URLs are internal; anything else is not.
    return url.origin === window.location.origin;
  } catch {
    return false;
  }
}
