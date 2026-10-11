import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Btn, FormField, LoadingState, Notice } from '@/components/ui';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { thumbUrl } from '@/lib/format';
import type { AdminUserDetail } from '@/api/adminTypes';

/**
 * Admin users — create / edit, one screen for both.
 *
 * Mirrors `users/create.blade.php` and `users/edit.blade.php`. The two Blade
 * views look nothing alike (create uses `users-create.css` with a dark
 * header card; edit is styled entirely inline), but they submit the same
 * fields and differ only in whether a password is required and whether a
 * status is shown. One component with a `mode` keeps the behaviour in a single
 * place, which is what actually matters — the styling is the same `.form-grid`
 * / `.form-control` vocabulary either way.
 *
 * THREE THINGS THE BLADE FORMS DO THAT THIS KEEPS, AND WHY
 * --------------------------------------------------------
 *  1. **The phone is normalised on input.** `+970…` / `970…` is rewritten to a
 *     leading `0` as it is typed — the paste path is the one that actually
 *     happens, and the API enforces `unique:users`.
 *  2. **Password strength is shown, not enforced.** The backend only requires
 *     `min:8`. The meter is guidance, so a weak-but-accepted password is still
 *     submittable — matching Blade rather than inventing a new rule.
 *  3. **`status` is a boolean, and on create it is always `true`.** The API's
 *     `store` has no `status` field at all (a new account is active), while
 *     `update` requires it. The form therefore omits it on create and always
 *     sends it on edit — sending it on create would be a 422.
 *
 * 🔴 SELF-EDIT GUARDS
 * -------------------
 * The API refuses a self role change (422 with `errors.role`) and refuses a
 * role change on a pharmacy-linked account. The role select is therefore
 * DISABLED for those two cases rather than allowed to fail — the same
 * principle as the users list. The status select is left enabled: an admin
 * deactivating themselves is blocked by `toggle-status`, but `update` has no
 * such guard, so the honest move is to let the server answer.
 */
export function AdminUserFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const api = useAdminApi();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = mode === 'edit';
  const F = AR.admin.users.form;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'pharmacy' | 'patient'>('patient');
  const [status, setStatus] = useState(true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]> | null>(null);

  /* ---- load (edit only) ------------------------------------------------- */
  const detail = useApiQuery<AdminUserDetail>(
    (signal) => api.admin.user(Number(id), signal),
    [id, isEdit],
    { enabled: isEdit && Number.isFinite(Number(id)) },
  );

  const seeded = useRef(false);
  useEffect(() => {
    if (!isEdit || seeded.current || !detail.data) return;
    seeded.current = true;
    const u = detail.data.user;
    setName(u.name ?? '');
    setPhone(u.phone ?? '');
    setEmail(u.email ?? '');
    setRole((u.role as typeof role) ?? 'patient');
    setStatus(Boolean(u.is_active));
  }, [isEdit, detail.data]);

  /**
   * The role select is disabled for a pharmacy-linked account.
   *
   * WHY ONLY THIS CASE IS HARD-DISABLED: the API 422s a role change on a
   * pharmacy-linked user AND on yourself, but the detail payload only exposes
   * the first — there is no "is this me?" flag on `AdminUserDetail`, and
   * importing the auth context just for an id would duplicate state the page
   * does not otherwise need. So the pharmacy case is prevented up front and the
   * self case is left to the server, whose 422 lands under the select via
   * `serverError('role')`. Both end up on screen with a reason; neither is
   * silently swallowed.
   */
  const pharmacyLinked = isEdit && detail.data?.user != null && detail.data.user.pharmacy != null;
  const roleLocked = pharmacyLinked;

  /* ---- validation ------------------------------------------------------- */
  const nameError = touched.name && name.trim() === '' ? F.name_required : null;
  const phoneError = touched.phone && phone.trim() === '' ? F.phone_required : null;
  const emailError =
    touched.email && email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? F.email_invalid
      : null;
  const passwordError = !isEdit
    ? touched.password && password === ''
      ? F.password_required
      : touched.password && password.length < 8
        ? F.password_too_short
        : null
    : null;

  /**
   * Password strength, 0–100, computed from the same criteria as the Blade
   * meter (length, mixed case, digits, symbols). Kept as a pure derivation so
   * it can never disagree with what is displayed.
   */
  const strength = useMemo(() => {
    if (password === '') return null;
    let score = 0;
    if (password.length >= 6) score += 1;
    if (password.length >= 10) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score <= 2) return { pct: 33, color: '#ef4444', label: 'كلمة المرور ضعيفة جداً، عرضة للاختراق!' };
    if (score <= 4) return { pct: 66, color: '#f59e0b', label: 'كلمة المرور متوسطة، أضف رموزاً أو طولاً إضافياً للحماية' };
    return { pct: 100, color: '#10b981', label: 'كلمة مرور قوية وآمنة للغاية!' };
  }, [password]);

  /**
   * Rewrite a pasted `+970…` / `970…` number into local `0…` form.
   * Matches the Blade input handler exactly, including the `length >= 12`
   * condition on the bare `970` prefix.
   */
  function normalisePhone(raw: string): string {
    let v = raw.replace(/[^\d+]/g, '');
    if (v.startsWith('+970')) {
      v = v.replace('+970', '0');
    } else if (v.startsWith('970') && v.length >= 12) {
      v = v.replace('970', '0');
    }
    return v;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched({ name: true, phone: true, email: true, password: true });
    setFieldErrors(null);

    if (name.trim() === '' || phone.trim() === '') return;
    if (!isEdit && password.length < 8) return;

    setSaving(true);
    setError(null);

    try {
      if (isEdit) {
        // `update` REQUIRES `status`; `store` does not accept it at all.
        await api.admin.updateUser(Number(id), {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() === '' ? null : email.trim(),
          role,
          status,
        });
        toast.success(F.updated);
      } else {
        await api.admin.createUser({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() === '' ? null : email.trim(),
          role,
          password,
        });
        toast.success(F.created);
      }
      navigate(ADMIN_ROUTES.users);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : F.save_failed;
      setError(message);
      // A 422 carries per-field messages; surfacing them under the right input
      // is the difference between "something failed" and "this field is wrong".
      const errors = (err as { errors?: Record<string, string[]> })?.errors;
      if (errors) setFieldErrors(errors);
    } finally {
      setSaving(false);
    }
  }

  /** First message for a server-reported field, if any. */
  const serverError = (key: string): string | null => fieldErrors?.[key]?.[0] ?? null;

  if (isEdit && detail.isLoading) return <LoadingState rows={5} label={F.loading} />;

  const avatar = isEdit ? thumbUrl(detail.data?.user.avatar ?? null, 96, 96) : null;
  const currentName = detail.data?.user.name ?? '';

  return (
    <div className="admin-page">
      <div className="page-wrapper">
        <div className="main-card">
          <div className="card-header-modern">
            <div className="header-title-area">
              <h2>{isEdit ? F.edit_title.replace('{name}', currentName || '…') : F.create_title}</h2>
              <p>{AR.admin.users.main_description}</p>
            </div>
            {/* On edit the header carries the account's own avatar, matching
                `users/edit.blade.php`; on create it carries the users icon. */}
            {avatar ? (
              <img
                src={avatar}
                alt={currentName}
                className="header-avatar"
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="header-icon" aria-hidden="true">
                <i className="fas fa-user-plus" />
              </div>
            )}
          </div>

          <form onSubmit={submit} noValidate>
            <div className="card-body-modern">
              {error && (
                <div style={{ marginBlockEnd: 16 }}>
                  <Notice tone="error">{error}</Notice>
                </div>
              )}

              {roleLocked && (
                <div style={{ marginBlockEnd: 16 }}>
                  <Notice tone="warning">{F.pharmacy_role_locked}</Notice>
                </div>
              )}

              <div className="form-grid">
                <FormField
                  label={F.name_label}
                  id="name"
                  required
                  touched={touched.name}
                  error={nameError ?? serverError('name')}
                >
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                    maxLength={255}
                  />
                </FormField>

                <FormField
                  label={F.phone_label}
                  id="phone"
                  required
                  touched={touched.phone}
                  error={phoneError ?? serverError('phone')}
                >
                  <input
                    type="tel"
                    className="form-control"
                    value={phone}
                    onChange={(e) => setPhone(normalisePhone(e.target.value))}
                    onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                    placeholder="059-XXX-XXXX"
                    dir="ltr"
                  />
                </FormField>

                <FormField
                  label={F.email_label}
                  id="email"
                  touched={touched.email}
                  error={emailError ?? serverError('email')}
                >
                  <input
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    placeholder="name@example.com"
                    dir="ltr"
                  />
                </FormField>

                <FormField
                  label={F.role_label}
                  id="role"
                  required
                  hint={roleLocked ? F.pharmacy_role_locked : undefined}
                  error={serverError('role')}
                >
                  <select
                    className="form-control"
                    value={role}
                    onChange={(e) => setRole(e.target.value as typeof role)}
                    disabled={roleLocked}
                  >
                    <option value="admin">{AR.users.role_admin}</option>
                    <option value="pharmacy">{AR.users.role_pharmacy}</option>
                    <option value="patient">{AR.users.role_patient}</option>
                  </select>
                </FormField>

                {isEdit && (
                  <FormField label={F.status_label} id="status" error={serverError('status')}>
                    <select
                      className="form-control"
                      value={status ? '1' : '0'}
                      onChange={(e) => setStatus(e.target.value === '1')}
                    >
                      <option value="1">{AR.admin.users.status_active}</option>
                      <option value="0">{AR.admin.users.status_inactive}</option>
                    </select>
                  </FormField>
                )}

                {!isEdit && (
                  <div className="form-group full-width">
                    <FormField
                      label={F.password_label}
                      id="password"
                      required
                      hint={F.password_hint_create}
                      touched={touched.password}
                      error={passwordError ?? serverError('password')}
                    >
                      <div className="password-container">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="form-control"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="toggle-password"
                          onClick={() => setShowPassword((s) => !s)}
                          aria-label={showPassword ? AR.admin.profile.password.hide : AR.admin.profile.password.show}
                          title={showPassword ? AR.admin.profile.password.hide : AR.admin.profile.password.show}
                        >
                          <i
                            className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </FormField>

                    {/* The meter is guidance, not a gate: the API only requires
                        `min:8`, so a weak password is still submittable — the
                        same behaviour as the Blade form. */}
                    <div className="password-strength-meter">
                      <div className="strength-bar-container">
                        <div
                          className="strength-bar"
                          style={{
                            width: strength ? `${strength.pct}%` : '0%',
                            backgroundColor: strength?.color,
                          }}
                        />
                      </div>
                      <span className="strength-text" style={{ color: strength?.color }}>
                        {strength ? strength.label : 'الرجاء إدخال كلمة مرور قوية (أحرف، أرقام، ورموز)'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card-footer-modern">
              <Link to={ADMIN_ROUTES.users} className="btn-cancel">
                {F.cancel}
              </Link>
              <button type="submit" className="btn-submit" disabled={saving}>
                {saving ? AR.admin.common.loading : isEdit ? F.edit_submit : F.create_submit}
              </button>
            </div>
          </form>
        </div>

        <p className="med-form-back">
          <Btn to={ADMIN_ROUTES.users} variant="ghost" size="sm" icon="fas fa-arrow-right">
            {F.back}
          </Btn>
        </p>
      </div>
    </div>
  );
}
