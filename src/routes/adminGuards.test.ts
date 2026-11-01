import { describe, expect, it } from 'vitest';
import { adminGuardRedirect, adminPostLoginDestination } from './adminRouting';
import { ADMIN_ROUTES } from './adminPaths';
import { ROUTES } from './paths';

describe('admin password-change route guard', () => {
  it('sends an authenticated admin with a required change to the password screen', () => {
    expect(adminGuardRedirect(true, true, ADMIN_ROUTES.dashboard)).toBe(
      ADMIN_ROUTES.profilePassword,
    );
  });

  it('allows the required password screen without redirecting back to itself', () => {
    expect(adminGuardRedirect(true, true, ADMIN_ROUTES.profilePassword)).toBeNull();
  });

  it('allows regular admins to visit dashboard and the optional password screen', () => {
    expect(adminGuardRedirect(true, false, ADMIN_ROUTES.dashboard)).toBeNull();
    expect(adminGuardRedirect(true, false, ADMIN_ROUTES.profilePassword)).toBeNull();
  });

  it('sends unauthenticated visitors to the unified login', () => {
    expect(adminGuardRedirect(false, true, ADMIN_ROUTES.dashboard)).toBe(ROUTES.login);
  });

  it('routes flagged login responses to password change and regular admins to the requested page', () => {
    expect(adminPostLoginDestination(true)).toBe(
      ADMIN_ROUTES.profilePassword,
    );
    expect(adminPostLoginDestination(false)).toBe(
      ADMIN_ROUTES.dashboard,
    );
  });
});
