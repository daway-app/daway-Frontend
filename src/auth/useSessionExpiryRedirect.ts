import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Redirect to the login route whenever the session ends (refresh failed, a
 * terminal 401, or logout). Mounted once, inside the router.
 */
export function useSessionExpiryRedirect(loginPath = '/login') {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = () => navigate(loginPath, { replace: true });
    window.addEventListener('daway:session-expired', handler);
    return () => window.removeEventListener('daway:session-expired', handler);
  }, [navigate, loginPath]);
}
