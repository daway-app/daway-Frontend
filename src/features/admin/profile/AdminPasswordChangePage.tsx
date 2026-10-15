import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn, Card, Modal, PageHeader } from '@/components/ui';
import { useAdminApi, useAdminAuth } from '@/auth/adminContext';
import { useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/LanguageContext';
import { ADMIN_ROUTES } from '@/routes/adminPaths';

/**
 * Admin password change — `POST /api/admin/change-password`.
 *
 * ============================================================================
 * 🔴 SUCCESS ENDS THE SESSION — BY DESIGN
 * ============================================================================
 * `ProfileController@changePassword` deletes EVERY token for the user after a
 * successful change (`$user->tokens()->delete()`), including the one this
 * request arrived on. That is correct: a password change must invalidate any
 * session an attacker may already hold.
 *
 * The consequence the UI must handle: the token in localStorage is now dead, so
 * the very next request would 401. The screen therefore does NOT "continue" —
 * it blocks with a modal explaining the re-login and offers that single action.
 * Redirecting first and explaining afterwards (the pharmacy page's ORIGINAL bug,
 * a `window.alert` immediately destroyed by a redirect) is exactly what this
 * avoids.
 *
 * ============================================================================
 * VALIDATION LAYERS
 * ============================================================================
 *  · Client-side, before sending: required / min 8 / mismatch / same-as-current.
 *    Cheap, instant, and keeps a pointless round-trip off the wire.
 *  · Server-side, on 422: `errors.current_password` and `errors.password`.
 *    Mapped back ONTO the field that caused them — a generic banner for "the
 *    current password is wrong" makes the user hunt for which input is at
 *    fault.
 * The client checks are a convenience; the server is the authority and its
 * message always wins when it disagrees.
 */
type FieldKey = 'current' | 'next' | 'confirm';
type FieldErrors = Partial<Record<FieldKey, string>>;

export function AdminPasswordChangePage() {
  const { STR } = useLang();
  const P = STR.admin.profile.password;
  const api = useAdminApi();
  const navigate = useNavigate();
  const { logout } = useAdminAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);

  const changePassword = useApiMutation(
    (body: { current_password: string; password: string; password_confirmation: string }) =>
      api.admin.changePassword(body),
  );

  /** Client-side rules — mirrors the server's `Password::min(8)` + `confirmed`. */
  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!current) found.current = P.current_required;
    if (!next) found.next = P.new_required;
    else if (next.length < 8) found.next = P.too_short;
    else if (next === current) found.next = P.same_as_current;
    if (confirm !== next) found.confirm = P.mismatch;
    return found;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    try {
      await changePassword.run({
        current_password: current,
        password: next,
        password_confirmation: confirm,
      });
      // Server success — every token is gone, so the session is already over.
      setDone(true);
    } catch {
      /*
       * Prefer the server's FIELD errors. The API returns Laravel's `errors`
       * map for a 422, so the message lands on the input it belongs to; the
       * generic `message` is the fallback when there is no field to attach to
       * (a network drop, a 500).
       */
      const fieldErrors = changePassword.error?.errors;
      if (fieldErrors) {
        setErrors({
          current: fieldErrors.current_password?.[0],
          next: fieldErrors.password?.[0],
        });
        return;
      }
      setErrors({ current: changePassword.error?.message ?? P.failed });
    }
  }

  async function handleRelogin() {
    // Clear the dead token before navigating so the guard does not bounce back
    // into an authenticated route with a token the server has already revoked.
    await logout();
    navigate(ADMIN_ROUTES.login, { replace: true });
  }

  return (
    <div className="admin-page">
      <PageHeader
        title={P.title}
        subtitle={P.subtitle}
        icon="fas fa-key"
      />

      <Card>
        <form className="admin-password-form" onSubmit={handleSubmit} noValidate>
          <div className="fg">
            <label className="fl" htmlFor="admin-current-password">
              {P.current_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type="password"
                id="admin-current-password"
                name="current_password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                aria-invalid={errors.current ? true : undefined}
                aria-describedby={errors.current ? 'admin-current-password-error' : undefined}
                required
                autoFocus
              />
            </div>
            {errors.current ? (
              <div className="error-message" id="admin-current-password-error" role="alert">
                {errors.current}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="admin-new-password">
              {P.new_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={showNext ? 'text' : 'password'}
                id="admin-new-password"
                name="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                aria-invalid={errors.next ? true : undefined}
                aria-describedby={errors.next ? 'admin-new-password-error' : undefined}
                required
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowNext((v) => !v)}
                aria-label={showNext ? P.hide : P.show}
              >
                {showNext ? P.hide : P.show}
              </button>
            </div>
            <div className="info-hint" role="note">
              {P.rules}
            </div>
            {errors.next ? (
              <div className="error-message" id="admin-new-password-error" role="alert">
                {errors.next}
              </div>
            ) : null}
          </div>

          <div className="fg">
            <label className="fl" htmlFor="admin-confirm-password">
              {P.confirm_label}
            </label>
            <div className="fc-wrapper">
              <input
                className="fc"
                type={showConfirm ? 'text' : 'password'}
                id="admin-confirm-password"
                name="password_confirmation"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                minLength={8}
                aria-invalid={errors.confirm ? true : undefined}
                aria-describedby={errors.confirm ? 'admin-confirm-password-error' : undefined}
                required
              />
              <button
                type="button"
                className="toggle-btn"
                onClick={() => setShowConfirm((v) => !v)}
                aria-label={
                  showConfirm ? P.hide : P.show
                }
              >
                {showConfirm
                  ? P.hide
                  : P.show}
              </button>
            </div>
            {errors.confirm ? (
              <div className="error-message" id="admin-confirm-password-error" role="alert">
                {errors.confirm}
              </div>
            ) : null}
          </div>

          <div className="admin-password-actions">
            <Btn type="submit" variant="primary" disabled={changePassword.isPending}>
              {P.submit}
            </Btn>
            <Btn variant="outline" to={ADMIN_ROUTES.profile}>
              {P.back}
            </Btn>
          </div>
        </form>
      </Card>

      {/*
        Session-ended modal. Deliberately NOT dismissible: the token is dead, so
        "close" would strand the user on a page where nothing loads. One action,
        one way forward.
      */}
      <Modal
        open={done}
        title={P.changed_title}
        onClose={() => {
          /* intentionally not dismissible — the session is over */
        }}
        footer={
          <Btn variant="primary" onClick={() => void handleRelogin()}>
            {P.relogin}
          </Btn>
        }
      >
        <div className="admin-password-done">
          <i className="fas fa-circle-check" aria-hidden="true" />
          <p>{P.changed_body}</p>
        </div>
      </Modal>
    </div>
  );
}
