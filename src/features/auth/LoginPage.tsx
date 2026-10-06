import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/authHooks';
import { ApiError } from '@/api/errors';
import { ROUTES } from '@/routes/paths';

/**
 * Pharmacy login — port of `auth/login.blade.php`.
 *
 * Blade builds this screen from a SPLIT layout:
 *   .auth-container
 *     .auth-form-side   (form: account type, identity, password, submit)
 *     .auth-hero        (logo + radar graphic)
 *
 * All styling comes from the ported `pages/auth-forms.css` (the same file
 * Blade loads via `@vite(['resources/css/auth/forms.css'])`), so the class
 * names here MUST match Blade's verbatim — swapping in ad-hoc names such as
 * `login__title` would render an unstyled page.
 *
 * The previous revision of this file was an intentionally plain P0 stub
 * ("visual design is P1"); this is that P1 pass.
 *
 * Documented divergences from Blade (all deliberate):
 *   1. Blade posts to `route('login')` and relies on the server session +
 *      full-page redirect. React calls the Daway API through `useAuth()`,
 *      matching `POST /api/login/pharmacy` (pharmacy_id + password).
 *   2. Blade renders an admin option in the account-type select. The React
 *      app is pharmacy-scoped by definition, so only the pharmacy branch is
 *      offered — the admin concept does not exist in this client.
 *   3. Blade's `.loader-overlay` is driven by a 15s timeout script. Here the
 *      spinner is driven by the real in-flight request state, and a rejected
 *      request always restores the form (no silent hang).
 *   4. The "not a member yet?" footer link points at the Blade register
 *      route; this SPA has no register screen, so it is rendered as an inert
 *      hint rather than a dead link.
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [pharmacyId, setPharmacyId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? ROUTES.dashboard;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!pharmacyId.trim() || !password) {
      setError('يرجى إدخال معرّف الصيدلية وكلمة المرور');
      return;
    }

    setIsSubmitting(true);
    try {
      await login(pharmacyId.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (caught) {
      // Server messages are Arabic — display as-is, never translate.
      if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError('تعذّر تسجيل الدخول، يرجى المحاولة مرة أخرى');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      {/* Progress loader — driven by the real request state, not a timer
          (see divergence #3). `active` is what auth-forms.css fades in. */}
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
            💊
          </span>
        </div>
        <div className="loader-text">جاري التحقق والدخول...</div>
      </div>

      {/* الجانب الأول: النموذج */}
      <div className="auth-form-side">
        <h1 className="form-title">تسجيل الدخول</h1>
        <p className="form-subtitle">
          أدخل بياناتك للوصول إلى لوحة الصيدلية.
        </p>

        <form id="loginForm" onSubmit={handleSubmit} noValidate>
          {/* معرف الصيدلية / البريد */}
          <div className="fg">
            <label className="fl" htmlFor="identityInput">
              معرف الصيدلية (Pharmacy ID)
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="text"
                id="identityInput"
                name="pharmacy_id"
                value={pharmacyId}
                onChange={(event) => setPharmacyId(event.target.value)}
                placeholder="أدخل Pharmacy ID الخاص بالصيدلية"
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                dir="ltr"
                required
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'identityError' : undefined}
                disabled={isSubmitting}
              />
            </div>
            <div className="info-hint" id="infoHint" role="note">
              💡 <strong>صيدلية:</strong> استخدم Pharmacy ID الذي منحه الأدمن.
            </div>
          </div>

          {/* كلمة المرور */}
          <div className="fg">
            <label className="fl" htmlFor="passwordInput">
              كلمة المرور
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
              <span>تذكرني</span>
              <input type="checkbox" name="remember" />
            </label>
            {/* لا يوجد مسار استعادة كلمة مرور في هذا العميل — نص إرشادي
                بدل رابط ميّت (نفس نهج Blade). */}
            <span className="forgot-hint">
              نسيت كلمة المرور؟ تواصل مع إدارة النظام
            </span>
          </div>

          <button type="submit" className="btn-p" id="submitBtn" disabled={isSubmitting}>
            {isSubmitting ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="auth-footer">
          ليس لديك حساب؟ تواصل مع إدارة النظام لإنشاء حساب صيدلية.
        </div>
      </div>

      {/* الجانب الآخر: الهوية البصرية ورادار الموقع */}
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
          <h2 className="hero-title">مرحباً بك مجدداً</h2>
          <p className="hero-desc">
            إدارة الصيدليات، الأدوية، والطلبات ومتابعة كافة العمليات من مكان
            واحد بسهولة وأمان.
          </p>
        </div>

        {/* جرافيك الرادار والدبوس */}
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
