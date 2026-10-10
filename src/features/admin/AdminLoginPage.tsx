import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '@/auth/adminContext';
import { ApiError } from '@/api/errors';
import { AR } from '@/lib/i18n';
import { ADMIN_ROUTES } from '@/routes/adminPaths';

/**
 * Admin login — email + password against `POST /api/login/admin`.
 *
 * ============================================================================
 * WHY THIS EXISTS AT ALL
 * ============================================================================
 * The pharmacy login sends a `pharmacy_id` and hits `/api/login/pharmacy`,
 * whose controller looks up a `pharmacies` row. An admin has no such row, so
 * that endpoint can never authenticate one. This screen is the only way an
 * admin obtains a token.
 *
 * ============================================================================
 * ERROR MESSAGES ARE MAPPED, NOT ECHOED BLINDLY
 * ============================================================================
 * The backend deliberately returns the SAME message for "unknown email" and
 * "wrong password" (so it cannot be used to enumerate accounts). The UI keeps
 * that behaviour: it shows the server's generic sentence for both. The only
 * case where it says something different is a 403, because the admin already
 * proved they own the password — telling them "your account is disabled" then
 * leaks nothing and is genuinely more useful than "invalid credentials".
 */
export function AdminLoginPage() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const L = AR.admin.login;

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? ADMIN_ROUTES.dashboard;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError(L.invalid);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        // 403 carries the precise reason; anything else stays generic.
        if (caught.status === 403) {
          setError(caught.code === 'account_inactive' ? L.inactive : L.not_admin);
        } else {
          setError(L.invalid);
        }
      } else {
        setError(L.generic_error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div
        className={`loader-overlay${isSubmitting ? ' active' : ''}`}
        role="status"
        aria-live="polite"
        aria-busy={isSubmitting}
        aria-hidden={!isSubmitting}
      >
        <div className="loader-spinner-box">
          <div className="spinner" />
          <span className="loader-icon" aria-hidden="true">
            🛡️
          </span>
        </div>
        <div className="loader-text">{L.submitting}</div>
      </div>

      <div className="auth-form-side">
        <h1 className="form-title">{L.title}</h1>
        <p className="form-subtitle">{L.subtitle}</p>

        <form onSubmit={handleSubmit} noValidate>
          <div className="fg">
            <label className="fl" htmlFor="adminEmail">
              {L.email_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="email"
                id="adminEmail"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={L.email_placeholder}
                autoComplete="username"
                spellCheck={false}
                dir="ltr"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'adminLoginError' : undefined}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="adminPassword">
              {L.password_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={showPassword ? 'text' : 'password'}
                id="adminPassword"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={L.password_placeholder}
                autoComplete="current-password"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'adminLoginError' : undefined}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-controls="adminPassword"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {error ? (
            <div className="error-message" id="adminLoginError" role="alert">
              {error}
            </div>
          ) : null}

          <button type="submit" className="btn-p" disabled={isSubmitting}>
            {isSubmitting ? L.submitting : L.submit}
          </button>
        </form>

        <div className="auth-footer">
          <Link to="/login">{L.back_to_pharmacy}</Link>
        </div>
      </div>

      <div className="auth-hero">
        <div className="hero-content">
          <div className="logo-wrapper">
            <img
              src="/images/dawak-logo-384.jpg"
              srcSet="/images/dawak-logo-256.jpg 256w, /images/dawak-logo-384.jpg 384w"
              sizes="92px"
              width={92}
              height={92}
              fetchPriority="high"
              decoding="async"
              alt="شعار دوائي"
              className="brand-logo-img"
            />
          </div>
          <span className="hero-subtitle-tag">منصة دوائي</span>
          <h2 className="hero-title">{AR.admin.nav.panel_title}</h2>
          <p className="hero-desc">
            إدارة الصيدليات، الأدوية، الأقسام، الطلبات، والمستخدمين من مكان واحد.
          </p>
        </div>

        <div className="graphic-wrapper">
          <div className="radar-circle">
            <div className="radar-ripple-1" />
            <div className="radar-ripple-2" />
            <div className="pin-container">
              <div className="map-pin" />
              <div className="pin-base-platform" />
              <div className="pin-shadow" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
