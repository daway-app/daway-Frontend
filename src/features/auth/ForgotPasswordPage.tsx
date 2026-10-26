import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/lang/useLang';
import { Btn } from '@/components/ui';
import { useApi } from '@/auth/authHooks';
import { ROUTES } from '@/routes/paths';

/**
 * Forgot-password REQUEST — the public sibling of `/register`.
 *
 * ============================================================================
 * 🔴 THIS FILES A REQUEST, IT DOES NOT RESET ANYTHING
 * ============================================================================
 * `POST /api/pharmacy/password-reset-requests` answers 202 with the SAME
 * message whether the Pharmacy ID + phone match a real pharmacy or not. That
 * is deliberate: one response for both cases means the endpoint cannot be used
 * to enumerate accounts. Nothing is issued here either — the request only
 * queues a `pending` item an admin reviews; on approval a NEW password is
 * generated and delivered through the approved channel (shown once in the
 * admin panel), and until then the CURRENT password keeps working.
 *
 * So the success state repeats the server's exact wording and says plainly
 * what happens next. A screen that says "check your inbox for a code" would be
 * a lie — there is no OTP, no SMS code, no instant reset on this flow.
 *
 * Any thrown error here is a TRANSPORT failure (offline, 5xx, timeout). A 422
 * would mean the input shape is wrong — never "no such pharmacy", because the
 * server does not answer that question. The UI must not invent a distinction
 * the backend deliberately refuses to make.
 */

/**
 * Same source-of-truth pattern as `RegisterPage`: the brand tag lives in the
 * unified-login block because that screen serves both roles — reading it here
 * is deliberate, and it keeps the brand from drifting between screens.
 */

type FieldName = 'pharmacy_id' | 'phone';
type FieldErrors = Partial<Record<FieldName, string>>;

export function ForgotPasswordPage() {
  const { STR } = useLang();
  const Rt = STR.forgot_password;
  const brandTag = STR.admin.unified.brand_tag;
  const api = useApi();

  const [pharmacyId, setPharmacyId] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!pharmacyId.trim()) found.pharmacy_id = Rt.err_pharmacy_id_required;
    if (!phone.trim()) found.phone = Rt.err_phone_required;
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner(null);

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSubmitting(true);
    try {
      await api.auth.requestPasswordReset({
        pharmacy_id: pharmacyId.trim().toUpperCase(),
        phone: phone.trim(),
      });
      setDone(true);
    } catch {
      // See the header comment: any failure is transport-level. The backend's
      // anti-enumeration contract means a "wrong details" answer does not
      // exist — surfacing one here would leak information it withholds.
      setBanner(Rt.err_generic);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Success: the request was FILED, nothing was reset ────────────────────
  if (done) {
    return (
      <div className="auth-container">
        <div className="auth-form-side">
          <h1 className="form-title">{Rt.success_title}</h1>
          <p className="form-subtitle">{Rt.success_body}</p>

          {/* The load-bearing sentence: what happens next, and that the current
              password keeps working until an admin approves. Without it the
              user either waits for a code that will never come, or assumes the
              account was cut off immediately. */}
          <div className="info-hint info-hint--success" role="status">
            ℹ️ {Rt.success_note}
          </div>

          <div className="fg" style={{ marginTop: 24 }}>
            <Btn to={ROUTES.login} variant="primary" className="auth-submit">
              {Rt.success_go_login}
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
                alt={`شعار ${brandTag}`}
                className="brand-logo-img"
              />
            </div>
            <span className="hero-subtitle-tag">{brandTag}</span>
            <h2 className="hero-title">{Rt.hero_title}</h2>
            <p className="hero-desc">{Rt.hero_desc}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-form-side">
        <h1 className="form-title">{Rt.heading}</h1>
        <p className="form-subtitle">{Rt.subtitle}</p>

        <form id="forgotPasswordForm" onSubmit={handleSubmit} noValidate>
          <div className="fg">
            <label className="fl" htmlFor="forgotPharmacyIdInput">
              {Rt.pharmacy_id_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="text"
                id="forgotPharmacyIdInput"
                name="pharmacy_id"
                value={pharmacyId}
                onChange={(e) => setPharmacyId(e.target.value)}
                placeholder={Rt.pharmacy_id_placeholder}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                dir="ltr"
                maxLength={32}
                aria-invalid={errors.pharmacy_id ? true : undefined}
                aria-describedby={errors.pharmacy_id ? 'forgotPharmacyIdError' : undefined}
                disabled={submitting}
                required
              />
            </div>
            <div className="info-hint" role="note">
              💡 {Rt.pharmacy_id_hint}
            </div>
            {errors.pharmacy_id ? (
              <div className="error-message" id="forgotPharmacyIdError" role="alert">
                {errors.pharmacy_id}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="forgotPhoneInput">
              {Rt.phone_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="tel"
                id="forgotPhoneInput"
                name="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                dir="ltr"
                maxLength={20}
                aria-invalid={errors.phone ? true : undefined}
                aria-describedby={errors.phone ? 'forgotPhoneError' : undefined}
                disabled={submitting}
                required
              />
            </div>
            <div className="info-hint" role="note">
              💡 {Rt.phone_hint}
            </div>
            {errors.phone ? (
              <div className="error-message" id="forgotPhoneError" role="alert">
                {errors.phone}
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
              id="forgotSubmitBtn"
              className="auth-submit"
              disabled={submitting}
            >
              {submitting ? Rt.submitting : Rt.submit}
            </Btn>
          </div>
        </form>

        <div className="auth-footer">
          {Rt.have_account}{' '}
          <Link to={ROUTES.login} className="auth-footer__link">
            {Rt.login_link}
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
              alt={`شعار ${brandTag}`}
              className="brand-logo-img"
            />
          </div>
          <span className="hero-subtitle-tag">{brandTag}</span>
          <h2 className="hero-title">{Rt.hero_title}</h2>
          <p className="hero-desc">{Rt.hero_desc}</p>
        </div>
      </div>
    </div>
  );
}

