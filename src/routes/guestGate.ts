/**
 * Guest-gate decision, as a PURE function.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS IS SEPARATE FROM `guards.tsx`
 * ─────────────────────────────────────────────────────────────────────────────
 * The decision below is the part that actually went wrong once, so it has to be
 * pinned by a test. `guards.tsx` renders React and installs DOM side effects,
 * and this suite runs in a plain `node` environment with no DOM — so the logic
 * lives here, React-free and directly callable, and the component is a thin
 * wrapper around it. Keeping the ORDER of the checks in one testable place is
 * the whole point: it is the order that produced the bug, not any single check.
 *
 * 🔴 THE BUG THIS ENCODES THE FIX FOR
 * `/login` serves BOTH roles. The original gate only asked the pharmacy store
 * ("is a `daway.auth.token` present?"), so an admin holding a valid
 * `daway.admin.token` was still shown the login screen. Worse, the layout never
 * redirected, so after a fresh admin sign-in the page sat there unchanged —
 * which the user reported as "nothing happens".
 *
 * So `signedIn` is true when EITHER session exists, and each role is sent to
 * its OWN landing page. Admin is checked FIRST deliberately: on the rare
 * occasion both tokens exist, the guest gate is irrelevant to the pharmacy
 * (it is not on a pharmacy-only path), and the more privileged session is the
 * safer thing to resume.
 */
import { ROUTES } from './paths';
import { ADMIN_ROUTES } from './adminPaths';

export interface GuestSessions {
  pharmacySignedIn: boolean;
  adminSignedIn: boolean;
}

/** Where the guest gate sends a visitor, or `null` to let them stay on /login. */
export function guestRedirect(sessions: GuestSessions): string | null {
  if (sessions.adminSignedIn) return ADMIN_ROUTES.dashboard;
  if (sessions.pharmacySignedIn) return ROUTES.dashboard;
  return null;
}
