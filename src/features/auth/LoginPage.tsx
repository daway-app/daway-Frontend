import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/authHooks';
import { useAdminAuth } from '@/auth/adminContext';
import { ApiError } from '@/api/errors';
import { AR } from '@/lib/i18n';
import { ROUTES } from '@/routes/paths';
import { ADMIN_ROUTES } from '@/routes/adminPaths';

/**
 * Unified login — ONE screen for both principals, with a segmented role switch.
 *
 * ============================================================================
 * WHY ONE SCREEN INSTEAD OF TWO
 * ============================================================================
 * The Blade app shipped a single login with an "account type" select. The React
 * port dropped it and split the two roles into `/login` (pharmacy) and
 * `/admin/login` (admin), because the two authenticate against different
 * endpoints with different credential shapes:
 *
 *   · pharmacy → `POST /api/login/pharmacy` { pharmacy_id, password } → daway.auth.token
 *   · admin    → `POST /api/login/admin`    { email, password }       → daway.admin.token
 *
 * Both endpoints and both stacks still exist and are unchanged. This screen
 * merely puts the CHOICE back in one place, so a person who knows they are "an
 * admin" does not have to know the URL `/admin/login` to find the door.
 *
 * ============================================================================
 * 🔴 THE SWITCH CHANGES THE ENDPOINT, NOT JUST THE LABEL
 * ============================================================================
 * The single most important property of this screen: flipping the switch
 * decides WHICH `login()` runs, and therefore which stack stores the token and
 * which session the guards will see. A version that only swapped the label text
 * would send an admin's email to the pharmacy endpoint and fail with a
 * confusing error — the label and the behaviour must move together.
 *
 * `useAuth()` and `useAdminAuth()` are BOTH called unconditionally (rules of
 * hooks: never call a hook inside a branch). Only which one is INVOKED depends
 * on the role.
 *
 * ============================================================================
 * WHY THE IDENTITY FIELD IS CLEARED ON A REAL SWITCH
 * ============================================================================
 * A Pharmacy ID ("PH-1234") is meaningless as an email and vice versa. Carrying
 * the value across would submit a guaranteed-wrong credential. The value is
 * cleared only when the role ACTUALLY changes, so re-clicking the current role
 * never wipes what the user typed.
 *
 * Error messages are shown as the server sends them (they are already Arabic),
 * which keeps the deliberately-generic "invalid credentials" wording intact on
 * both paths — the backend uses one sentence for "unknown account" and "wrong
 * password" so it cannot be used to enumerate accounts.
 */

type Role = 'pharmacy' | 'admin';

/**
 * How long the spinner may run before the user is offered a way out.
 *
 * The API reads from a remote managed MySQL and a single request has been
 * measured at 5–12 s, so this is deliberately generous — it is a dead-request
 * escape hatch, not a request deadline. Blade used 15 s; the value is kept.
 */
const LOGIN_TIMEOUT_MS = 15_000;

export function LoginPage() {
  const pharmacyAuth = useAuth();
  const adminAuth = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [role, setRole] = useState<Role>('pharmacy');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Safety net, ported from Blade: if the response never arrives the spinner
  // would otherwise spin forever and strand the user. After LOGIN_TIMEOUT_MS
  // the form is restored and an explicit retry is offered.
  const [timedOut, setTimedOut] = useState(false);

  const L = AR.admin.unified;
  const isAdmin = role === 'admin';

  const redirectTo =
    (location.state as { from?: string } | null)?.from ??
    (isAdmin ? ADMIN_ROUTES.dashboard : ROUTES.dashboard);

  function selectRole(next: Role) {
    if (next === role) return;
    setRole(next);
    // The two credential shapes are not interchangeable — see the header note.
    setIdentity('');
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setTimedOut(false);

    if (!identity.trim() || !password) {
      setError(isAdmin ? L.missing_admin : L.missing_pharmacy);
      return;
    }

    setIsSubmitting(true);
    const timer = window.setTimeout(() => setTimedOut(true), LOGIN_TIMEOUT_MS);

    try {
      if (isAdmin) {
        await adminAuth.login(identity.trim(), password);
      } else {
        await pharmacyAuth.login(identity.trim(), password);
      }
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        // The admin response distinguishes "disabled" / "not an admin" via 403
        // codes; the pharmacy response returns a ready-made Arabic message.
        // Both are already user-facing, so they are shown as-is.
        setError(caught.message || 'تعذّر تسجيل الدخول، حاول مرة أخرى.');
      } else {
        setError('تعذّر تسجيل الدخول، حاول مرة أخرى.');
      }
    } finally {
      window.clearTimeout(timer);
      setTimedOut(false);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div
        className={`loader-overlay${isSubmitting ? ' active' : ''}${timedOut ? ' show-timeout' : ''}`}
        role="status"
        aria-live="polite"
        aria-busy={isSubmitting && !timedOut}
        aria-hidden={!isSubmitting}
      >
        {timedOut ? (
          /* The request outlived the grace period. The form is behind this
             overlay, so the retry has to live here. */
          <div className="loader-timeout">
            <span className="loader-timeout-icon" aria-hidden="true">
              ⏳
            </span>
            <p className="loader-timeout-msg">
              تأخّر الخادم في الرد. قد يكون الاتصال بطيئاً.
            </p>
            <button
              type="button"
              className="loader-timeout-btn"
              onClick={() => {
                setTimedOut(false);
                setIsSubmitting(false);
              }}
            >
              إعادة المحاولة
            </button>
          </div>
        ) : (
          <>
            <div className="loader-spinner-box">
              <div className="spinner" />
              <span className="loader-icon" aria-hidden="true">
                {isAdmin ? '🛡️' : '💊'}
              </span>
            </div>
            <div className="loader-text">{L.submitting}</div>
          </>
        )}
      </div>

      {/* الجانب الأول: النموذج */}
      <div className="auth-form-side">
        <h1 className="form-title">{L.title}</h1>
        <p className="form-subtitle">{L.subtitle}</p>

        {/* مُبدِّل نوع الحساب — المؤشّر عنصر منفصل ينزلق بـ transform. */}
        <div className="fg">
          <span className="fl" id="roleSwitchLabel">
            {L.switch_label}
          </span>
          <div
            className="role-switch"
            data-role={role}
            role="group"
            aria-labelledby="roleSwitchLabel"
          >
            <span className="role-switch__thumb" aria-hidden="true" />
            <button
              type="button"
              className="role-switch__option"
              aria-pressed={!isAdmin}
              onClick={() => selectRole('pharmacy')}
              disabled={isSubmitting}
            >
              <i className="fas fa-store" aria-hidden="true" />
              {L.switch_pharmacy}
            </button>
            <button
              type="button"
              className="role-switch__option"
              aria-pressed={isAdmin}
              onClick={() => selectRole('admin')}
              disabled={isSubmitting}
            >
              <i className="fas fa-user-shield" aria-hidden="true" />
              {L.switch_admin}
            </button>
          </div>
        </div>

        <form id="loginForm" onSubmit={handleSubmit} noValidate>
          <div className="fg">
            <label className="fl" htmlFor="identityInput">
              {isAdmin ? L.identity_admin : L.identity_pharmacy}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={isAdmin ? 'email' : 'text'}
                id="identityInput"
                name={isAdmin ? 'email' : 'pharmacy_id'}
                value={identity}
                onChange={(event) => setIdentity(event.target.value)}
                placeholder={isAdmin ? L.identity_admin_placeholder : L.identity_pharmacy_placeholder}
                autoComplete="username"
                autoCapitalize={isAdmin ? 'none' : 'characters'}
                spellCheck={false}
                dir="ltr"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'identityError' : undefined}
                disabled={isSubmitting}
              />
            </div>
            <div className="info-hint" role="note">
              💡 {isAdmin ? L.identity_admin_hint : L.identity_pharmacy_hint}
            </div>
          </div>

          <div className="fg">
            <label className="fl" htmlFor="passwordInput">
              {L.password_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={showPassword ? 'text' : 'password'}
                id="passwordInput"
                name="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'passwordError' : undefined}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-controls="passwordInput"
                aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? 'إخفاء' : 'إظهار'}
              </button>
            </div>
          </div>

          {error ? (
            <div className="error-message" id="passwordError" role="alert">
              {error}
            </div>
          ) : null}

          <div className="form-footer-options">
            <label className="remember-label">
              <span>{L.remember}</span>
              <input type="checkbox" name="remember" />
            </label>
            <span className="forgot-hint">{L.forgot}</span>
          </div>

          <button type="submit" className="btn-p" id="submitBtn" disabled={isSubmitting}>
            {isSubmitting
              ? L.submitting
              : isAdmin
                ? L.submit_admin
                : L.submit_pharmacy}
          </button>
        </form>

        <div className="auth-footer">{L.no_account}</div>
      </div>

      {/* الجانب الآخر: الهوية البصرية — النصّ يتبع الدور. */}
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

          <span className="hero-subtitle-tag">{L.brand_tag}</span>
          <h2 className="hero-title">{L.hero_title}</h2>
          <p className="hero-desc">{isAdmin ? L.hero_admin : L.hero_pharmacy}</p>
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
