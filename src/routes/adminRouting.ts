import { ADMIN_ROUTES } from './adminPaths';
import { ROUTES } from './paths';

export function adminGuardRedirect(
  isAuthenticated: boolean,
  mustChangePassword: boolean,
  pathname: string,
): string | null {
  if (!isAuthenticated) return ROUTES.login;
  if (mustChangePassword && pathname !== ADMIN_ROUTES.profilePassword) {
    return ADMIN_ROUTES.profilePassword;
  }
  return null;
}

export function adminPostLoginDestination(
  mustChangePassword: boolean,
): string {
  return mustChangePassword ? ADMIN_ROUTES.profilePassword : ADMIN_ROUTES.dashboard;
}
