import { describe, expect, it } from 'vitest';
import { guestRedirect } from './guestGate';
import { ROUTES } from './paths';
import { ADMIN_ROUTES } from './adminPaths';

/**
 * Regression test for the unified-login guest gate.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE BUG THIS LOCKS DOWN
 * ─────────────────────────────────────────────────────────────────────────────
 * The user reported: "I choose admin, I enter, nothing happens."
 *
 * `/login` hosts BOTH the pharmacy and the admin forms. Its gate originally
 * asked only the pharmacy store whether a session existed. An admin who held a
 * valid `daway.admin.token` therefore stayed on the login screen with no
 * redirect, so a fresh admin sign-in left the page apparently unchanged.
 *
 * The fix is that `guestRedirect` consults BOTH sessions and returns the
 * correct landing page for whichever one is present. These tests fail if that
 * requirement is ever narrowed back to a single session — which is the exact
 * shape of the original defect.
 */
describe('guest gate (unified /login)', () => {
  it('lets an anonymous visitor stay on the login screen', () => {
    expect(guestRedirect({ pharmacySignedIn: false, adminSignedIn: false })).toBeNull();
  });

  it('sends a signed-in ADMIN to the admin dashboard — not to a dead login screen', () => {
    // The regression: with only the pharmacy check, this returned `null` and
    // the admin was stranded on /login.
    const to = guestRedirect({ pharmacySignedIn: false, adminSignedIn: true });
    expect(to).toBe(ADMIN_ROUTES.dashboard);
  });

  it('sends a signed-in PHARMACY to the pharmacy dashboard', () => {
    const to = guestRedirect({ pharmacySignedIn: true, adminSignedIn: false });
    expect(to).toBe(ROUTES.dashboard);
  });

  it('never sends an admin into the pharmacy app, or a pharmacy into admin', () => {
    // Cross-contamination guard: the two landing pages must not be swapped.
    expect(guestRedirect({ pharmacySignedIn: false, adminSignedIn: true })).not.toBe(
      ROUTES.dashboard,
    );
    expect(guestRedirect({ pharmacySignedIn: true, adminSignedIn: false })).not.toBe(
      ADMIN_ROUTES.dashboard,
    );
  });

  it('prefers the admin session when both exist (documented ordering)', () => {
    expect(guestRedirect({ pharmacySignedIn: true, adminSignedIn: true })).toBe(
      ADMIN_ROUTES.dashboard,
    );
  });
});
