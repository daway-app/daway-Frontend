import { useState, type FormEvent } from 'react';
import { AR } from '@/lib/i18n';

/**
 * Pharmacy password change — port of `resources/views/auth/password-change.blade.php` (B4).
 *
 * Blade notes that shaped this port:
 * - It is a FULL standalone document (`<html dir="rtl">` + its own `@vite` CSS list),
 *   NOT a child of the app layout. React therefore renders it inside `AuthLayout`,
 *   reusing the same two-column `auth-container` shell as Login.
 * - `localStorage.getItem('theme') === 'dark'` is read inline before paint in Blade.
 *   React already applies the theme pre-paint from `index.html` + `src/lib/theme.ts`,
 *   so the duplicate snippet is deliberately not reproduced (documented divergence).
 * - Client-side validation mirrors Blade's `required` / `minlength="8"` attributes,
 *   but Blade relies on the browser + server. We validate before "submitting" so the
 *   screen is self-contained with no API (B3: no integration this phase).
 */

const copy = AR.pharmacy.password.change;

type FieldErrors = Partial<Record<'current' | 'next' | 'confirm', string>>;

export function PasswordChangePage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!current) found.current = copy.current_required;
    if (!next) found.next = copy.new_required;
    else if (next.length < 8) found.next = copy.too_short;
    else if (next === current) found.next = copy.same_as_current;
    if (confirm !== next) found.confirm = copy.mismatch;
    return found;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setSubmitted(Object.keys(found).length === 0);
  }

  return (
    <form className="password-change" onSubmit={handleSubmit} noValidate>
      <h1 className="form-title">{copy.heading}</h1>
      <p className="form-subtitle">{copy.subtitle}</p>

      {submitted ? (
        <div className="info-hint info-hint--success" role="status" style={{ marginBottom: 18 }}>
          {copy.success}
        </div>
      ) : null}

      <div className="fg">
        <label className="fl" htmlFor="currentPasswordInput">
          {copy.current_label}
        </label>
        <div className="fc-wrapper">
          <input
            className="fc"
            type="password"
            id="currentPasswordInput"
            name="current_password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            aria-invalid={errors.current ? true : undefined}
            aria-describedby={errors.current ? 'currentPasswordError' : undefined}
            required
            autoFocus
          />
        </div>
        {errors.current ? (
          <div className="error-message" id="currentPasswordError">
            {errors.current}
          </div>
        ) : null}
      </div>

      <div className="fg">
        <label className="fl" htmlFor="passwordInput">
          {copy.new_label}
        </label>
        <div className="fc-wrapper">
          <input
            className="fc"
            type={showNext ? 'text' : 'password'}
            id="passwordInput"
            name="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            aria-invalid={errors.next ? true : undefined}
            aria-describedby={errors.next ? 'passwordError' : undefined}
            required
          />
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setShowNext((v) => !v)}
            aria-label={copy.show_password}
          >
            {showNext ? copy.hide : copy.show}
          </button>
        </div>
        <div className="info-hint" role="note">
          💡 {copy.rules}
        </div>
        {errors.next ? (
          <div className="error-message" id="passwordError">
            {errors.next}
          </div>
        ) : null}
      </div>

      <div className="fg">
        <label className="fl" htmlFor="passwordConfirmInput">
          {copy.confirm_label}
        </label>
        <div className="fc-wrapper">
          <input
            className="fc"
            type={showConfirm ? 'text' : 'password'}
            id="passwordConfirmInput"
            name="password_confirmation"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={8}
            aria-invalid={errors.confirm ? true : undefined}
            required
          />
          <button
            type="button"
            className="toggle-btn"
            onClick={() => setShowConfirm((v) => !v)}
            aria-label={copy.show_password}
          >
            {showConfirm ? copy.hide : copy.show}
          </button>
        </div>
        {errors.confirm ? <div className="error-message">{errors.confirm}</div> : null}
      </div>

      <div className="fg" style={{ marginTop: 24 }}>
        <button type="submit" className="btn-p">
          {copy.submit}
        </button>
      </div>

      <div className="auth-footer">
        {/*
          Blade posts to `route('logout')` inside an inline form. React has no such
          route yet in this phase, so the affordance is kept but inert — documented
          divergence, not a silent omission.
        */}
        <button type="button" className="auth-footer__link">
          {copy.logout_instead}
        </button>
      </div>
    </form>
  );
}
