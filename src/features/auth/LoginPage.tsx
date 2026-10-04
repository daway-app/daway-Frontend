import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/authHooks';
import { ApiError } from '@/api/errors';
import { ROUTES } from '@/routes/paths';

/**
 * Pharmacy login — P0 foundation.
 *
 * Purpose: prove the auth flow end to end (login → token → guarded route).
 * It is intentionally plain; visual design is P1 and screens are P3+.
 *
 * Uses `pharmacy_id` + `password`, matching `POST /api/login/pharmacy`
 * exactly (verified: no email field, no remember-me).
 */
export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [pharmacyId, setPharmacyId] = useState('');
  const [password, setPassword] = useState('');
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
    <form className="login" onSubmit={handleSubmit} noValidate>
      <h1 className="login__title">تسجيل دخول الصيدلية</h1>

      <label className="login__field">
        <span>معرّف الصيدلية</span>
        <input
          type="text"
          name="pharmacy_id"
          value={pharmacyId}
          onChange={(event) => setPharmacyId(event.target.value)}
          autoComplete="username"
          dir="ltr"
          disabled={isSubmitting}
          required
        />
      </label>

      <label className="login__field">
        <span>كلمة المرور</span>
        <input
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          dir="ltr"
          disabled={isSubmitting}
          required
        />
      </label>

      {error ? (
        <p className="login__error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="login__submit" type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'جارٍ تسجيل الدخول…' : 'تسجيل الدخول'}
      </button>
    </form>
  );
}
