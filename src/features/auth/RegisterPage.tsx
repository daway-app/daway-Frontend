import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { Btn } from '@/components/ui';
import { ApiError } from '@/api/errors';
import { useApi } from '@/auth/authHooks';
import { ROUTES } from '@/routes/paths';

/**
 * Pharmacy self-registration — the public counterpart of `/login`.
 *
 * ============================================================================
 * 🔴 THIS IS AN APPLICATION, NOT A SIGNUP
 * ============================================================================
 * `POST /api/register/pharmacy` does NOT create a usable account. It stores the
 * pharmacy with `is_active = false` / `status = 'pending_approval'` (HTTP 201)
 * and returns NO token. The credentials — a Pharmacy ID and a password — are
 * issued later, by SMS, once an admin approves the request.
 *
 * So the success state must say that plainly. A screen that congratulates the
 * user and drops them on the login form would send them straight back to a
 * failing login with credentials that do not exist yet, and the natural
 * conclusion is "the app is broken" — which is exactly how the missing
 * `vercel.json` and the CORS mismatch both presented.
 *
 * ============================================================================
 * WHAT THE BACKEND VALIDATES (keep these in sync)
 * ============================================================================
 *   pharmacy_name  required | string | max:150
 *   phone          required | string | max:20 | unique:users,phone
 *   region         required | string | max:150
 *   password       required | string | min:8
 *
 * Field errors come back as a 422 with `errors: { <field>: string[] }`, already
 * in Arabic. They are mapped onto the matching inputs rather than dumped into
 * one banner, so the user can see WHICH field is wrong.
 */

/**
 * `register` sits at the TOP level of `AR`, alongside `users` and `accounting`
 * — not nested under `pharmacy`. Those feature blocks that grew large were
 * promoted to top level, and this one is an auth flow rather than a pharmacy
 * screen, so it follows them instead of inventing a third convention.
 */
const R = AR.register;

/**
 * The brand tag is read from the unified-login block on purpose: there is ONE
 * source of truth for the platform name. It lives under `admin.unified` because
 * that screen serves both roles — reading it here is deliberate, not a mistake,
 * and it is what stops the brand name drifting between screens (it already did
 * once: the login hero said "دوائي" while the admin panel said "دواك").
 */
const BRAND = AR.admin.unified.brand_tag;

type FieldName = 'pharmacy_name' | 'phone' | 'region' | 'password' | 'password_confirm';
type FieldErrors = Partial<Record<FieldName, string>>;

export function RegisterPage() {
  const api = useApi();

  const [pharmacyName, setPharmacyName] = useState('');
  const [phone, setPhone] = useState('');
  const [region, setRegion] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function validate(): FieldErrors {
    const found: FieldErrors = {};

    if (!pharmacyName.trim()) found.pharmacy_name = R.err_name_required;
    if (!phone.trim()) found.phone = R.err_phone_required;
    // Loose on purpose: the backend only caps the length, and phone formats
    // vary. A strict pattern here would reject valid numbers the API accepts.
    else if (phone.replace(/\D/g, '').length < 9) found.phone = R.err_phone_invalid;

    if (!region.trim()) found.region = R.err_region_required;

    if (!password) found.password = R.err_password_required;
    else if (password.length < 8) found.password = R.err_password_short;

    if (confirm !== password) found.password_confirm = R.err_confirm_mismatch;

    return found;
  }

  /** Map a 422 body onto the form; anything else becomes a banner. */
  function applyServerError(caught: unknown): void {
    if (caught instanceof ApiError && caught.kind === 'validation' && caught.errors) {
      const mapped: FieldErrors = {};
      for (const [key, messages] of Object.entries(caught.errors)) {
        const field = key as FieldName;
        if (field === 'pharmacy_name' || field === 'phone' || field === 'region' || field === 'password') {
          mapped[field] = messages[0];
        }
      }
      if (Object.keys(mapped).length > 0) {
        setErrors(mapped);
        setBanner(null);
        return;
      }
    }

    setBanner(
      caught instanceof ApiError && caught.message ? caught.message : R.err_generic,
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await api.auth.registerPharmacy({
        pharmacy_name: pharmacyName.trim(),
        phone: phone.trim(),
        region: region.trim(),
        password,
      });
      setDone(true);
    } catch (caught) {
      applyServerError(caught);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success: the application was filed, NOT an account created ───────────
  if (done) {
    return (
      <div className="auth-container">
        <div className="auth-form-side">
          <h1 className="form-title">{R.success_title}</h1>
          <p className="form-subtitle">{R.success_body}</p>

          {/* The load-bearing sentence. Without it the user goes and tries to
              log in immediately and reports the app as broken. */}
          <div className="info-hint info-hint--success" role="status">
            ℹ️ {R.success_note}
          </div>

          <div className="fg" style={{ marginTop: 24 }}>
            <Btn to={ROUTES.login} variant="primary" className="auth-submit">
              {R.success_go_login}
            </Btn>
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
                alt={`شعار ${BRAND}`}
                className="brand-logo-img"
              />
            </div>
            <span className="hero-subtitle-tag">{BRAND}</span>
            <h2 className="hero-title">{R.hero_title}</h2>
            <p className="hero-desc">{R.hero_desc}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-form-side">
        <h1 className="form-title">{R.heading}</h1>
        <p className="form-subtitle">{R.subtitle}</p>

        <form id="registerForm" onSubmit={handleSubmit} noValidate>
          <div className="fg">
            <label className="fl" htmlFor="pharmacyNameInput">
              {R.name_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="text"
                id="pharmacyNameInput"
                name="pharmacy_name"
                value={pharmacyName}
                onChange={(e) => setPharmacyName(e.target.value)}
                placeholder={R.name_placeholder}
                autoComplete="organization"
                maxLength={150}
                aria-invalid={errors.pharmacy_name ? true : undefined}
                aria-describedby={errors.pharmacy_name ? 'pharmacyNameError' : undefined}
                disabled={submitting}
                required
              />
            </div>
            {errors.pharmacy_name ? (
              <div className="error-message" id="pharmacyNameError" role="alert">
                {errors.pharmacy_name}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="registerPhoneInput">
              {R.phone_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="tel"
                id="registerPhoneInput"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={R.phone_placeholder}
                autoComplete="tel"
                inputMode="tel"
                dir="ltr"
                maxLength={20}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? 'registerPhoneError' : undefined}
                disabled={submitting}
                required
              />
            </div>
            <div className="info-hint" role="note">
              💡 {R.phone_hint}
            </div>
            {errors.phone ? (
              <div className="error-message" id="registerPhoneError" role="alert">
                {errors.phone}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="regionInput">
              {R.region_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="text"
                id="regionInput"
                name="region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={R.region_placeholder}
                autoComplete="address-level2"
                maxLength={150}
                aria-invalid={errors.region ? true : undefined}
                aria-describedby={errors.region ? 'regionError' : undefined}
                disabled={submitting}
                required
              />
            </div>
            {errors.region ? (
              <div className="error-message" id="regionError" role="alert">
                {errors.region}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="registerPasswordInput">
              {R.password_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={showPassword ? 'text' : 'password'}
                id="registerPasswordInput"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? 'registerPasswordError' : undefined}
                disabled={submitting}
                required
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-controls="registerPasswordInput"
                aria-label={showPassword ? R.hide_password : R.show_password}
              >
                {showPassword ? R.hide : R.show}
              </button>
            </div>
            <div className="info-hint" role="note">
              💡 {R.rules}
            </div>
            {errors.password ? (
              <div className="error-message" id="registerPasswordError" role="alert">
                {errors.password}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="registerConfirmInput">
              {R.confirm_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={showPassword ? 'text' : 'password'}
                id="registerConfirmInput"
                name="password_confirmation"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                aria-invalid={errors.password_confirm ? true : undefined}
                aria-describedby={errors.password_confirm ? 'registerConfirmError' : undefined}
                disabled={submitting}
                required
              />
            </div>
            {errors.password_confirm ? (
              <div className="error-message" id="registerConfirmError" role="alert">
                {errors.password_confirm}
              </div>
            ) : null}
          </div>

          {banner ? (
            <div className="error-message" role="alert">
              {banner}
            </div>
          ) : null}

          <div className="fg" style={{ marginTop: 24 }}>
            <Btn
              type="submit"
              variant="primary"
              id="registerSubmitBtn"
              className="auth-submit"
              disabled={submitting}
            >
              {submitting ? R.submitting : R.submit}
            </Btn>
          </div>
        </form>

        <div className="auth-footer">
          {R.have_account}{' '}
          <Link to={ROUTES.login} className="auth-footer__link">
            {R.login_link}
          </Link>
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
              alt={`شعار ${BRAND}`}
              className="brand-logo-img"
            />
          </div>
          <span className="hero-subtitle-tag">{BRAND}</span>
          <h2 className="hero-title">{R.hero_title}</h2>
          <p className="hero-desc">{R.hero_desc}</p>
        </div>
      </div>
    </div>
  );
}
