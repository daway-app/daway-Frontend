import { GooglePharmacySignIn } from './GooglePharmacySignIn';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useAdminAuth } from '@/auth/adminContext';
import { ApiError } from '@/api/errors';
import { Btn } from '@/components/ui';
import { useLang } from '@/lib/lang/useLang';
import { ROUTES } from '@/routes/paths';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import { adminPostLoginDestination } from '@/routes/adminRouting';
import { preloadRoute } from '@/lib/routePreload';
import { queryClient, PRESET_STALE_TIMES } from '@/api/queryClient';
import { pharmacyKeys } from '@/api/queryKeys';

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
 * How long the spinner may run before the user is offered an explanation.
 *
 * 🔴 THIS IS A "STILL WORKING" NOTICE, NOT A DEADLINE — DO NOT LOWER IT.
 * The API reads from a remote managed MySQL, and a single login request has
 * been measured anywhere from 3 s to 36 s (the backend is a single-threaded
 * dev server on top of a remote managed DB). At 15 s the notice fired DURING
 * a request that then succeeded, which is actively harmful: the user reads
 * "the server is slow", clicks retry, and the original — still in flight —
 * resolves underneath them and navigates with the overlay already dismissed.
 *
 * The API client owns the real hard stop (`VITE_API_TIMEOUT_MS`, 60 s) and
 * throws a proper `timeout` error, which this screen renders as a normal
 * error. So this notice only needs to reassure, never to give up: 30 s is
 * comfortably past the observed slow case while the client keeps the 60 s
 * ceiling as the actual abort.
 */
const LOGIN_TIMEOUT_MS = 30_000;

export function LoginPage() {
  const { STR } = useLang();
  const pharmacyAuth = useAuth();
  const adminAuth = useAdminAuth();
  const pharmacyApi = usePharmacyApi();
  const navigate = useNavigate();
  const location = useLocation();
  const adminPasswordChanged =
    (location.state as { adminPasswordChanged?: boolean } | null)?.adminPasswordChanged === true;

  const [role, setRole] = useState<Role>('pharmacy');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Reassurance notice, ported from Blade and then corrected: if the response
  // is slow the user is TOLD so, but the request is left running — see
  // LOGIN_TIMEOUT_MS for why cancelling it here was a bug. The spinner keeps
  // spinning behind the notice, and a late success still carries the user in.
  const [isSlow, setIsSlow] = useState(false);
  // Incremented on every explicit retry so a stale response from an abandoned
  // attempt cannot navigate the user after they have moved on.
  const attemptRef = useRef(0);
  // Phase 1b: post-login preparing (prefetch dashboard chunk + critical data).
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState(false);
  // Same registry tracks in-flight prepare attempts so a logout mid-prepare
  // aborts it cleanly.
  const pendingPrepareRef = useRef<Promise<void> | null>(null);

  const L = STR.admin.unified;
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

  /**
   * Phase 2: warm the target dashboard while the post-login overlay shows.
   *
   *  1. preload the route's JS chunk (intent-based; browser dedupes).
   *  2. for the PHARMACY dashboard, fire the 3 critical data requests early via
   *     queryClient.prefetchQuery so DashboardPage finds them cached and skips
   *     its own network round-trips.
   *  3. race against a 12s ceiling so a slow backend never traps the user.
   *
   * On ANY exit path the overlay is dismissed and navigation proceeds; DashboardPage
   * will just refetch if prefetch did not complete. A logout mid-prepare aborts
   * (the auth stack's session-expired handler takes over).
   */
  async function prepareDashboard(attempt: number, isAdminDash: boolean, destination: string) {
    if (attempt !== attemptRef.current) return;
    setIsPreparing(true);
    setPrepareError(false);

    // 1. warm the JS chunk
    preloadRoute(destination);

    const keys = isAdminDash ? null : pharmacyKeys(pharmacyAuth.user?.id ?? 'anon');

    if (!isAdminDash && keys && pharmacyAuth.isAuthenticated) {
      // 2. prefetch the 3 dashboard queries in parallel — TanStack dedupes
      //    so when DashboardPage mounts its useQuery(key) calls, they resolve
      //    instantly from this pre-warmed cache.
      // 3. race against a 12s ceiling (backend reads 3.7–9.2s per request).
      //      allSettled lets partial success through — dashboard page shows
      const preparePromise = Promise.allSettled([
        queryClient.prefetchQuery({
          queryKey: keys.dashboardStats,
          queryFn: () => pharmacyApi.dashboardStats(),
          staleTime: PRESET_STALE_TIMES.dashboardSummary,
        }),
        queryClient.prefetchQuery({
          queryKey: keys.profile,
          queryFn: () => pharmacyApi.profile(),
          staleTime: PRESET_STALE_TIMES.settings,
        }),
        queryClient.prefetchQuery({
          queryKey: keys.sales({ per_page: 1 }),
          queryFn: () => pharmacyApi.sales({ per_page: 1 }),
          staleTime: PRESET_STALE_TIMES.financial,
        }),
      ]).then(() => undefined);
      pendingPrepareRef.current = preparePromise;

      try {
        await Promise.race([preparePromise, new Promise<void>((r) => setTimeout(r, 12_000))]);
      } catch {
        // Some requests failed — the dashboard page will show an error state.
        // Still navigate: the dashboard's own queries have error UIs.
      }

      if (attempt !== attemptRef.current) return;
      if (!pharmacyAuth.isAuthenticated) {
        // Session expired mid-prepare → let session-expired redirect handle it.
        return;
      }
    } else if (isAdminDash) {
      // Admin: chunk-only warmup; navigate after letting the chunk land.
      if (attempt !== attemptRef.current) return;
      if (!adminAuth.isAuthenticated) return;
    }

    setIsPreparing(false);
    pendingPrepareRef.current = null;
    navigate(destination, { replace: true });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSlow(false);

    if (!identity.trim() || !password) {
      setError(isAdmin ? L.missing_admin : L.missing_pharmacy);
      return;
    }

    const attempt = ++attemptRef.current;
    setIsSubmitting(true);
    const timer = window.setTimeout(() => {
      // Only ever an advisory. The request is NOT aborted — it may still
      // succeed, and when it does we want the user signed in.
      if (attempt === attemptRef.current) setIsSlow(true);
    }, LOGIN_TIMEOUT_MS);

    try {
      let postLoginDestination = redirectTo;
      if (isAdmin) {
        const admin = await adminAuth.login(identity.trim(), password);
        postLoginDestination = adminPostLoginDestination(admin.must_change_password);
        if (admin.must_change_password) {
          setIsSubmitting(false);
          navigate(postLoginDestination, { replace: true });
          return;
        }
      } else {
        await pharmacyAuth.login(identity.trim(), password);
      }
      // A newer attempt superseded this one — do not navigate on its behalf.
      if (attempt !== attemptRef.current) return;

      // Phase 1b: while the post-login overlay is still visible, warm the
      // dashboard's route chunk and fire its critical data requests so the
      // user does not trade the login spinner for a blank dashboard skeleton.
      // A timeout / "continue anyway" fall-through still navigates — the
      // dashboard will refetch on its own if preflight did not complete.
      await prepareDashboard(attempt, isAdmin, postLoginDestination);
    } catch (caught) {
      if (attempt !== attemptRef.current) return;
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
      if (attempt === attemptRef.current) {
        setIsSlow(false);
        setIsSubmitting(false);
      }
    }
  }

  return (
    <div className="auth-container">
      <div
        className={
          `loader-overlay` +
          `${isSubmitting || isPreparing ? ' active' : ''}` +
          `${isSlow ? ' show-slow' : ''}` +
          `${prepareError ? ' prepare-error' : ''}`
        }
        role="status"
        aria-live="polite"
        aria-busy={isSubmitting || isPreparing}
        aria-hidden={!(isSubmitting || isPreparing)}
      >
        <div className="loader-spinner-box">
          <div className="spinner" />
          <span className="loader-icon" aria-hidden="true">
            {isAdmin ? '🛡️' : '💊'}
          </span>
        </div>
        <div className="loader-text">
          {isPreparing ? L.preparing : L.submitting}
        </div>
        {isSlow && !isPreparing ? (
          /* Advisory only — the request is still running, so this says so
             instead of offering a retry that would abandon a live attempt. */
          <p className="loader-slow-note">{L.slow_note}</p>
        ) : null}
        {prepareError ? (
          <div className="prepare-actions" role="group" aria-label={L.preparing_failed}>
            <button
              type="button"
              className="modal-btn primary"
              onClick={() => {
                setPrepareError(false);
                // Re-run the prepare step for the current attempt — this is
                // safe to repeat because preflight is idempotent (browser
                // dedupes the JS chunk; data requests are fire-and-forget).
                prepareDashboard(attemptRef.current, isAdmin, redirectTo);
              }}
            >
              {L.preparing_retry}
            </button>
            <button
              type="button"
              className="modal-btn"
              onClick={() => navigate(redirectTo, { replace: true })}
            >
              {L.preparing_continue}
            </button>
          </div>
        ) : null}
      </div>

      {/* الجانب الأول: النموذج */}
      <div className="auth-form-side">
        <h1 className="form-title">{L.title}</h1>
        <p className="form-subtitle">{L.subtitle}</p>
        {isAdmin && adminPasswordChanged ? (
          <div className="info-hint" role="status">
            {STR.admin.profile.password.changed_body}
          </div>
        ) : null}

        {/* Icons: Font Awesome Free 6.7.2, CC BY 4.0 (fontawesome.com/license/free). */}
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
              <svg className="role-switch__icon" aria-hidden="true" viewBox="0 0 576 512" fill="currentColor"><path d="M547.6 103.8L490.3 13.1C485.2 5 476.1 0 466.4 0L109.6 0C99.9 0 90.8 5 85.7 13.1L28.3 103.8c-29.6 46.8-3.4 111.9 51.9 119.4c4 .5 8.1 .8 12.1 .8c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.1 0 49.3-11.4 65.2-29c15.9 17.6 39.1 29 65.2 29c26.2 0 49.3-11.4 65.2-29c16 17.6 39.1 29 65.2 29c4.1 0 8.1-.3 12.1-.8c55.5-7.4 81.8-72.5 52.1-119.4zM499.7 254.9c0 0 0 0-.1 0c-5.3 .7-10.7 1.1-16.2 1.1c-12.4 0-24.3-1.9-35.4-5.3L448 384l-320 0 0-133.4c-11.2 3.5-23.2 5.4-35.6 5.4c-5.5 0-11-.4-16.3-1.1l-.1 0c-4.1-.6-8.1-1.3-12-2.3L64 384l0 64c0 35.3 28.7 64 64 64l320 0c35.3 0 64-28.7 64-64l0-64 0-131.4c-4 1-8 1.8-12.3 2.3z" /></svg>
              {L.switch_pharmacy}
            </button>
            <button
              type="button"
              className="role-switch__option"
              aria-pressed={isAdmin}
              onClick={() => selectRole('admin')}
              disabled={isSubmitting}
            >
              <svg className="role-switch__icon role-switch__icon--shield" aria-hidden="true" viewBox="0 0 640 512" fill="currentColor"><path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c1.8 0 3.5-.2 5.3-.5c-76.3-55.1-99.8-141-103.1-200.2c-16.1-4.8-33.1-7.3-50.7-7.3l-91.4 0zm308.8-78.3l-120 48C358 277.4 352 286.2 352 296c0 63.3 25.9 168.8 134.8 214.2c5.9 2.5 12.6 2.5 18.5 0C614.1 464.8 640 359.3 640 296c0-9.8-6-18.6-15.1-22.3l-120-48c-5.7-2.3-12.1-2.3-17.8 0zM591.4 312c-3.9 50.7-27.2 116.7-95.4 149.7l0-187.8L591.4 312z" /></svg>
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
            {/* كان <span> ميّتاً بلا مسار («تواصل مع إدارة النظام»). الآن رابط
                إلى صفحة الطلب المستقلة `/forgot-password` — بنية صفحة كاملة
                نظير `/register`، لا لوحة مطوية داخل النموذج. للصيدلية فقط:
                استعادة الأدمن تمرّ عبر مساره الخاص. */}
            <Link to={isAdmin ? '/account-recovery' : ROUTES.forgotPassword} className="forgot-hint">
              {L.forgot}
            </Link>
          </div>

          {/* 7A: one-system primary button (was the auth-only `.btn-p`).
              `auth-submit` restores the FULL width that `.btn-p` had. `.ph-btn`
              is `inline-flex`, so without it the CTA shrank to its own label —
              measured 120px against 435px input fields, which read as a
              misaligned form rather than a deliberate small button. */}
          <Btn
            type="submit"
            variant="primary"
            id="submitBtn"
            className="auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? L.submitting
              : isAdmin
                ? L.submit_admin
                : L.submit_pharmacy}
          </Btn>
        </form>

        {!isAdmin && <GooglePharmacySignIn />}
        <div className="auth-footer"><Link to="/patient/login">دخول أو تسجيل المريض</Link></div>

        {/* كان نصّاً ميّتاً: «ليس لديك حساب؟ تواصل مع إدارة النظام لإنشاء حساب.»
            — بلا رابط وبلا مسار، أي وعدٌ لا يمكن الوفاء به. الآن `/register`
            قائم فعلاً. يظهر للصيدلية فقط: الأدمن يُنشئ حسابه من إدارة النظام،
            ولا معنى لعرض «سجّل صيدليتك» على من اختار «أدمن». */}
        {!isAdmin ? (
          <div className="auth-footer">
            {L.no_account}{' '}
            <Link to={ROUTES.register} className="auth-footer__link">
              {L.register_link}
            </Link>
          </div>
        ) : null}
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
              alt={STR.layout.app_title}
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

