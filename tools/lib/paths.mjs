/**
 * Shared argument sanitisers for the QA tools.
 *
 * WHY THIS EXISTS
 * ---------------
 * The QA tools are invoked from Git Bash (MSYS) on Windows, and MSYS rewrites a
 * `/`-leading argument into a Windows path BEFORE Node ever sees it. Observed
 * manglings, all from real runs:
 *
 *   "/"          → "C:/Program Files/Git/"
 *   "/inventory" → "C:/Program Files/Git/inventory"
 *   "/api/..."   → "C:/Users/…/binaries/PortableGit/versions/1.2.0/api/..."
 *
 * The result is a confusing failure far from the cause: Chrome rejects it as
 * "Cannot navigate to invalid URL", and `fetch` throws ERR_INVALID_URL with a
 * URL that has a drive path glued to the host.
 *
 * Every tool here only ever talks to our own dev server, so repairing the value
 * is always correct — and each caller also exposes an env-var escape hatch
 * (`NAV_PATHS`, `PROBE_ROUTE`, `SHAPE_PATH`) for the rare case this gets it
 * wrong.
 */

/**
 * Repair a route that MSYS may have rewritten into a filesystem path.
 *
 * @param {string} raw
 * @returns {string} a value starting with `/`
 */
export function sanitizeRoute(raw) {
  if (typeof raw !== 'string') return '/';

  // Already a clean route (and not a drive-letter path like `C:/...`).
  if (raw.startsWith('/') && !/^\/[A-Za-z]:/.test(raw)) return raw;

  // Drop a leading Windows drive (`C:/` or `C:\`).
  let s = raw.replace(/^[A-Za-z]:[\\/]/, '');

  // Drop everything up to and including a Git / PortableGit install dir,
  // with or without a `versions/<ver>` segment.
  s = s.replace(/^.*?(?:PortableGit|Git)(?:[\\/]versions[\\/][^\\/]+)?[\\/]?/i, '');

  s = s.replace(/\\/g, '/').replace(/^\/+/, '');
  return '/' + s;
}

/**
 * Split, sanitise and de-duplicate a comma-separated route list.
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function sanitizeRouteList(raw) {
  const seen = new Set();
  const out = [];
  for (const part of String(raw || '').split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const route = sanitizeRoute(trimmed);
    if (seen.has(route)) continue;
    seen.add(route);
    out.push(route);
  }
  return out;
}
