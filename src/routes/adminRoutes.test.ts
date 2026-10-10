import { describe, expect, it } from 'vitest';
import { matchRoutes, type RouteObject } from 'react-router-dom';
import { ADMIN_ROUTES } from './adminPaths';
import { ROUTES } from './paths';

/**
 * Route-resolution guard for the admin tree.
 *
 * ============================================================================
 * WHY THIS TEST EXISTS
 * ============================================================================
 * `/admin/*` and the pharmacy app share ONE router. The pharmacy tree ends with
 * a catch-all (`{ path: '*' }` → redirect to the pharmacy login) inside
 * `AppLayout`/`RequireAuth`. If an admin URL ever matched THAT branch instead of
 * the admin tree, a signed-out admin would be bounced to the PHARMACY login — a
 * confusing dead end that looks like a routing bug, not a missing session.
 *
 * React Router ranks a literal segment above `*`, so `/admin/pharmacies` should
 * win on ranking alone. The admin tree is nonetheless declared FIRST in
 * `router.tsx` so that correctness does not depend on a ranking subtlety nobody
 * will remember in six months. This test pins BOTH properties:
 *
 *   1. every admin path resolves into the admin branch, and
 *   2. the router's own ranking agrees, even when the pharmacy catch-all is
 *      declared first (the adversarial ordering).
 *
 * It exercises `matchRoutes` — the same function `RouterProvider` uses to
 * resolve a location — against a structural replica of the real tree. That
 * catches the ordering class of bug without rendering React, which would need a
 * DOM environment this suite deliberately does not have.
 *
 * The replica must mirror `router.tsx`. If a route is added there and not here,
 * the test does not fail loudly — so the assertion below checks the FULL admin
 * path set, and `ADMIN_ROUTES` is the single source for both.
 */

/** Sentinel element names — the test only ever inspects which branch won. */
const PHARMACY_CATCH_ALL = 'PHARMACY_CATCH_ALL';
const PHARMACY_LOGIN = 'PHARMACY_LOGIN';
const ADMIN_LOGIN = 'ADMIN_LOGIN';

/**
 * A structural replica of the two overlapping trees.
 *
 * `adminFirst` toggles declaration order so the test can prove the resolution is
 * stable under both — the real tree uses `adminFirst: true`, but the pharmacy
 * catch-all winning on ranking is what an adversarial order would expose.
 */
function buildTree(adminFirst: boolean): RouteObject[] {
  const adminLogin = {
    path: ADMIN_ROUTES.login,
    element: ADMIN_LOGIN,
  };
  const adminPages = [
    ADMIN_ROUTES.dashboard,
    ADMIN_ROUTES.pharmacies,
    ADMIN_ROUTES.medicines,
    ADMIN_ROUTES.medicineRequests,
    ADMIN_ROUTES.categories,
    ADMIN_ROUTES.inventory,
    ADMIN_ROUTES.patients,
    ADMIN_ROUTES.users,
    ADMIN_ROUTES.logs,
    ADMIN_ROUTES.settings,
  ].map((path) => ({ path, element: `ADMIN_PAGE:${path}` }));
  const adminUnknown = { path: 'admin/*', element: 'ADMIN_NOT_FOUND' };

  const adminBranch: RouteObject[] = [
    adminLogin,
    ...adminPages,
    adminUnknown,
  ];

  const pharmacyBranch: RouteObject[] = [
    { path: ROUTES.login, element: PHARMACY_LOGIN },
    { path: '*', element: PHARMACY_CATCH_ALL },
  ];

  return adminFirst
    ? [...adminBranch, ...pharmacyBranch]
    : [...pharmacyBranch, ...adminBranch];
}

/** The element string of the winning match, or `null` for no match. */
function resolve(tree: RouteObject[], pathname: string): string | null {
  const matches = matchRoutes(tree, pathname);
  if (!matches || matches.length === 0) return null;
  const leaf = matches[matches.length - 1];
  const element = (leaf.route as { element?: unknown }).element;
  return typeof element === 'string' ? element : null;
}

describe('admin route resolution', () => {
  const everyAdminPath = Object.values(ADMIN_ROUTES);

  it.each(everyAdminPath.map((p) => [p]))(
    '%s resolves into the admin tree (admin declared first)',
    (path) => {
      const winner = resolve(buildTree(true), path);
      expect(winner).not.toBeNull();
      // The pharmacy catch-all must never be the winner for an admin URL.
      expect(winner).not.toBe(PHARMACY_CATCH_ALL);
      expect(winner).not.toBe(PHARMACY_LOGIN);
    },
  );

  it.each(everyAdminPath.map((p) => [p]))(
    '%s still resolves into the admin tree when the pharmacy catch-all is declared FIRST',
    (path) => {
      // The adversarial order: if this passes, the admin tree's position in
      // `router.tsx` is belt-and-braces rather than load-bearing. If React
      // Router's ranking ever changed, this is the assertion that would break —
      // which is exactly the signal we want before the ordering stops helping.
      const winner = resolve(buildTree(false), path);
      expect(winner).not.toBeNull();
      expect(winner).not.toBe(PHARMACY_CATCH_ALL);
    },
  );

  it('an unknown /admin/* path lands on the admin 404, not the pharmacy catch-all', () => {
    const winner = resolve(buildTree(true), '/admin/definitely-not-a-page');
    expect(winner).toBe('ADMIN_NOT_FOUND');
  });

  it('a genuine pharmacy path still reaches the pharmacy login', () => {
    const winner = resolve(buildTree(true), ROUTES.login);
    expect(winner).toBe(PHARMACY_LOGIN);
  });

  it('an unknown non-admin path still falls through to the pharmacy catch-all', () => {
    // `admin/*` must stay scoped to `/admin` — it must not swallow `/anything`.
    const winner = resolve(buildTree(true), '/some/unknown/path');
    expect(winner).toBe(PHARMACY_CATCH_ALL);
  });
});
