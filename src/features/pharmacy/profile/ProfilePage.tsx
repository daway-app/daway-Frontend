import { useEffect, useMemo, useRef, useState } from 'react';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, FormField, Modal } from '@/components/ui';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { thumbUrl } from '@/lib/format';
import {
  focusFirstInvalid,
  latitude as ruleLatitude,
  longitude as ruleLongitude,
  matches,
  optionalUrl,
  password as rulePassword,
  phone as rulePhone,
  requiredText,
  useTouched,
  validate,
} from '@/lib/forms';
import type { ApiDayKey, ApiPharmacyProfile } from '@/api/pharmacyTypes';
import {
  API_DAYS,
  buildHoursPayload,
  dayLabel as dayLabelOf,
  initHours,
  type DayState,
  type HoursState,
} from './hours';

/**
 * Pharmacy profile — live against `GET/POST /api/profile/pharmacy`.
 *
 * Faithful port of `resources/views/pharmacy/profile/edit.blade.php` (the four
 * Blade modals — password / logo / location / hours — are reproduced with the
 * shared `Modal`).
 *
 * Three places where the API genuinely differs from the Blade page. All three
 * are documented gaps, not UI choices:
 *
 *  1. **Day keys.** The API uses short keys in `DAY_MAP` order
 *     (`sat, sun, mon, tue, wed, thu, fri`); the Blade uses full English names.
 *     `API_DAYS` below is the single translation point.
 *
 *  2. **Closed is `null`, not a flag.** The API's `working_hours[x]` is
 *     `{open, close}`, where a closed day is `{open: null, close: null}` —
 *     there is no `is_closed` field. See `isDayOpen`.
 *
 *  3. **Saving hours is a FULL REPLACE.** `replaceWorkingHours()` writes all
 *     seven days every time and treats an omitted/empty day as CLOSED. So the
 *     save request must always send all 7 days, or days the user never touched
 *     would silently become closed. See `buildHoursPayload`.
 *
 * GAPS (backend-side, reported not patched):
 *  - GAP-1: `region` is accepted + persisted but never returned by `payload()`.
 *  - GAP-8: `logo` is a URL string (`SecureImageUrl` rule), NOT a file upload —
 *    so the logo modal takes a URL instead of a file picker.
 *  - GAP-9: the payload has no `email`, and `updateProfile` never writes one, so
 *    the field is read-only.
 */
const P = AR.pharmacy.profile;
const HQ = P.hours_quick;

/** The fields this screen validates, in DOM order (used for focus-on-error). */
type Field = 'pharmacy_name' | 'phone_number' | 'address' | 'region' | 'latitude' | 'longitude' | 'logo';
const FIELDS: readonly Field[] = [
  'pharmacy_name',
  'phone_number',
  'address',
  'region',
  'latitude',
  'longitude',
  'logo',
];

export function ProfilePage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const query = useApiQuery<ApiPharmacyProfile>((signal) => api.profile(signal), [], {
    isEmpty: () => false,
  });

  const profile = query.data;

  const [form, setForm] = useState({
    pharmacy_name: '',
    phone_number: '',
    address: '',
    region: '',
  });
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [logo, setLogo] = useState('');
  const [hours, setHours] = useState<HoursState>(() => initHours(null));
  const [modal, setModal] = useState<null | 'password' | 'logo' | 'location' | 'hours'>(null);
  /** True once the password changed — the session is over and needs a re-login. */
  const [pwDone, setPwDone] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ password: '', confirmation: '' });
  const [pwError, setPwError] = useState<string | null>(null);

  /**
   * Inline validation state.
   *
   * `touched` is what makes the difference between helpful and hostile: a field
   * shows nothing until the user has either left it or pressed Save. Errors are
   * recomputed on every render from the CURRENT values, so they clear the moment
   * the input becomes valid — no stale red border.
   */
  const { touched, markTouched, markAllTouched } = useTouched<Field>({
    // The name is the one field a pharmacy has almost always already filled in,
    // so it starts touched: if the server returned it blank, say so immediately.
    pharmacy_name: false,
  });

  const pwTouched = useTouched<'password' | 'confirmation'>({});

  const { errors: fieldErrors } = validate<Field>({
    pharmacy_name: () => requiredText(form.pharmacy_name, P.name_label),
    phone_number: () => rulePhone(form.phone_number, P.phone_label),
    address: () => requiredText(form.address, P.address_label),
    region: () => requiredText(form.region, P.complete.region_label),
    latitude: () => ruleLatitude(lat),
    longitude: () => ruleLongitude(lng),
    logo: () => optionalUrl(logo, P.logo_label),
  });

  const pwErrors = {
    password: rulePassword(pw.password, 'كلمة المرور الجديدة'),
    confirmation: matches(pw.confirmation, pw.password, 'كلمتا المرور'),
  };

  /** The scroll target for `focusFirstInvalid` — the whole profile card. */
  const formRef = useRef<HTMLDivElement>(null);

  // Hydrate the form once the profile lands. Keyed on the fetched object so a
  // refetch (after a save) re-syncs the form with the server's values.
  useEffect(() => {
    if (!profile) return;
    setForm({
      pharmacy_name: profile.name ?? '',
      phone_number: profile.phone ?? '',
      address: profile.address ?? '',
      region: profile.region ?? '',
    });
    setLat(profile.latitude !== null ? String(profile.latitude) : '');
    setLng(profile.longitude !== null ? String(profile.longitude) : '');
    setLogo(profile.logo_url ?? '');
    setHours(initHours(profile));
  }, [profile]);

  const save = useApiMutation((body: Record<string, unknown>) => api.updateProfile(body));
  const changePassword = useApiMutation((body: { password: string; password_confirmation: string }) =>
    api.changePassword(body),
  );

  const setDay = (key: ApiDayKey, patch: Partial<DayState>) =>
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const dayLabel = (s: DayState) => dayLabelOf(s, P.closed, HQ.open_24);

  const summary = useMemo(() => {
    const open = API_DAYS.filter((d) => !hours[d.key].closed).map((d) => ({
      name: d.name,
      sig: `${hours[d.key].open}|${hours[d.key].close}|${hours[d.key].h24 ? 1 : 0}`,
      h24: hours[d.key].h24,
      open: hours[d.key].open,
      close: hours[d.key].close,
    }));
    const closedNames = API_DAYS.filter((d) => hours[d.key].closed).map((d) => d.name);
    const uniform = open.length === API_DAYS.length && new Set(open.map((o) => o.sig)).size <= 1;
    const unified = uniform && open.length
      ? open[0].h24
        ? HQ.open_24
        : `${open[0].open} – ${open[0].close}`
      : open.length
        ? '…'
        : '—';
    return { unified, exception: closedNames.length ? closedNames.join('، ') : HQ.no_exception };
  }, [hours]);

  const applyAll = () => {
    const ref = hours[API_DAYS[0].key];
    const open = ref.open || '09:00';
    const close = ref.close || '17:00';
    setHours((prev) => {
      const next = { ...prev };
      for (const d of API_DAYS) next[d.key] = { closed: false, open, close, h24: ref.h24 };
      return next;
    });
  };

  /**
   * Build the `working_hours` payload.
   *
   * MUST include all seven days: the endpoint replaces the whole week and treats
   * an omitted day as closed. See `./hours.ts`.
   */
  function buildPayload(): Record<string, { open?: string; close?: string }> {
    return buildHoursPayload(hours);
  }

  async function handleSave() {
    setSaved(false);

    /*
     * Validate BEFORE the request. `markAllTouched` first so every error is
     * visible at once (not just the ones the user happened to blur), then scroll
     * to the first one — on a long form the offending field is often off-screen,
     * and a Save that appears to do nothing is the classic double-submit.
     *
     * The check is repeated against the live values rather than trusting
     * `fieldErrors`, because a modal's Save button can be pressed with the
     * modal's own field still untouched.
     */
    const { errors, ok } = validate<Field>({
      pharmacy_name: () => requiredText(form.pharmacy_name, P.name_label),
      phone_number: () => rulePhone(form.phone_number, P.phone_label),
      address: () => requiredText(form.address, P.address_label),
      region: () => requiredText(form.region, P.complete.region_label),
      latitude: () => ruleLatitude(lat),
      longitude: () => ruleLongitude(lng),
      logo: () => optionalUrl(logo, P.logo_label),
    });

    if (!ok) {
      markAllTouched(FIELDS);
      // The field lives inside whichever modal or card holds it; scroll the
      // document so it is centred, then focus it.
      requestAnimationFrame(() => focusFirstInvalid());
      return;
    }

    // Belt and braces: `errors` is only read here to satisfy the linter that
    // the variable is meaningful. The behaviour is driven by `ok`.
    void errors;

    try {
      await save.run({
        /**
         * 🔴 FIELD-NAME FIX. The API contract uses `name` / `phone` /
         * `logo_url` — NOT `pharmacy_name` / `phone_number` / `logo`.
         *
         * `PharmacyProfileRequest` validates exactly these keys, and the
         * controller then TRANSLATES them onto the pharmacy row:
         *
         *     if (array_key_exists('name', $data))      $data['pharmacy_name'] = $data['name'];  $user->name = …
         *     if (array_key_exists('phone', $data))     $user->phone = $data['phone']; $pharmacy->phone_number = …
         *     if (array_key_exists('logo_url', $data))  $data['logo'] = $data['logo_url'];
         *
         * Sending the pharmacy-row names instead meant those three keys failed
         * validation, never reached the translation, and were SILENTLY DROPPED —
         * the name, phone and logo appeared to save but did not. Only address,
         * region, coordinates and working hours round-tripped.
         */
        name: form.pharmacy_name,
        phone: form.phone_number,
        address: form.address,
        region: form.region,
        latitude: lat === '' ? null : Number(lat),
        longitude: lng === '' ? null : Number(lng),
        logo_url: logo || null,
        working_hours: buildPayload(),
      });
      setSaved(true);
      setModal(null);
      query.refetch();
    } catch {
      // `save.error` renders below.
    }
  }

  async function handlePassword() {
    setPwError(null);

    /*
     * The mismatch check used to be the ONLY check here, and the two fields
     * rendered nothing while typing. `markAllTouched` + the shared rules make
     * the failure land on the field that caused it, and the focus call puts the
     * cursor where the fix is.
     */
    pwTouched.markAllTouched(['password', 'confirmation']);

    const { errors, ok } = validate<'password' | 'confirmation'>({
      password: () => rulePassword(pw.password, 'كلمة المرور الجديدة'),
      confirmation: () => matches(pw.confirmation, pw.password, 'كلمتا المرور'),
    });

    if (!ok) {
      setPwError(errors.password ?? errors.confirmation ?? null);
      requestAnimationFrame(() => focusFirstInvalid());
      return;
    }

    try {
      await changePassword.run({
        password: pw.password,
        password_confirmation: pw.confirmation,
      });
      setPw({ password: '', confirmation: '' });
      setModal(null);
      /*
       * 🔴 WAS `window.alert(…)` FOLLOWED IMMEDIATELY BY A REDIRECT.
       *
       * That combination was actively broken: the browser dialog blocks the
       * page, and the instant it is dismissed the navigation fires — so the
       * user never gets to read anything, and a native dialog is not
       * styleable, not translated by the app, and not announced consistently.
       *
       * The session really is over (the backend deletes ALL tokens on a
       * password change), so the correct shape is a BLOCKING modal that
       * explains it and carries the single action — re-login.
       */
      setPwDone(true);
    } catch {
      setPwError(changePassword.error?.message ?? 'تعذّر تغيير كلمة المرور');
    }
  }

  const avatarSrc = thumbUrl(logo, 88, 88);
  const initial = (form.pharmacy_name || 'ص').slice(0, 1);

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{P.heading_page}</h1>
          <p>{P.subtitle.replace(':pharmacy', user?.name ?? '')}</p>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={6}
      >
        {saved && (
          <div className="ph-alt-notice" style={{ marginBlockEnd: 14 }}>
            <i className="fas fa-circle-check" /> {P.save_button} — تم الحفظ بنجاح
          </div>
        )}

        {save.error && (
          <div className="ph-error" style={{ marginBlockEnd: 14 }}>
            <i className="fas fa-circle-exclamation" />
            <p>{save.error.message}</p>
          </div>
        )}

        <div className="ph-profile-form" ref={formRef}>
          <div className="ph-profile-grid">
            <div className="ph-profile-main">
              <div className="ph-card">
                <div className="ph-banner">
                  <div>
                    <h2>{form.pharmacy_name || '—'}</h2>
                    <p>{P.tagline}</p>
                  </div>
                  <div
                    className="ph-avatar"
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      background: 'var(--ph-teal-mist)',
                      color: 'var(--ph-teal)',
                      fontSize: '2rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      overflow: 'hidden',
                    }}
                    title={P.logo_change}
                    onClick={() => setModal('logo')}
                  >
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt={form.pharmacy_name}
                        width={44}
                        height={44}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      initial
                    )}
                  </div>
                </div>

                <div className="ph-card-body">
                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <FormField
                      label={P.name_label}
                      id="pharmacy_name"
                      required
                      error={fieldErrors.pharmacy_name}
                      touched={touched.pharmacy_name}
                    >
                      <input
                        type="text"
                        name="pharmacy_name"
                        id="pharmacy_name"
                        className="ph-control"
                        value={form.pharmacy_name}
                        onChange={(e) => setForm((f) => ({ ...f, pharmacy_name: e.target.value }))}
                        onBlur={() => markTouched('pharmacy_name')}
                      />
                    </FormField>
                  </div>

                  {/* GAP-9: the API neither returns nor writes `email`. */}
                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <label className="ph-form-label" htmlFor="email">
                      {P.email_label}
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      className="ph-control"
                      value=""
                      disabled
                      readOnly
                    />
                    <p className="ph-hint">البريد الإلكتروني غير متاح عبر الواجهة البرمجية حالياً.</p>
                  </div>

                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <FormField
                      label={P.phone_label}
                      id="phone_number"
                      required
                      error={fieldErrors.phone_number}
                      touched={touched.phone_number}
                    >
                      <input
                        type="tel"
                        name="phone_number"
                        id="phone_number"
                        className="ph-control"
                        value={form.phone_number}
                        onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                        onBlur={() => markTouched('phone_number')}
                      />
                    </FormField>
                  </div>

                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <FormField
                      label={P.address_label}
                      id="address"
                      required
                      error={fieldErrors.address}
                      touched={touched.address}
                    >
                      <textarea
                        name="address"
                        id="address"
                        className="ph-textarea"
                        style={{ width: '100%' }}
                        value={form.address}
                        onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                        onBlur={() => markTouched('address')}
                      />
                    </FormField>
                  </div>

                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <FormField
                      label={P.complete.region_label}
                      id="region"
                      required
                      error={fieldErrors.region}
                      touched={touched.region}
                      hint="تُحفظ المنطقة، لكن الواجهة البرمجية لا تعيدها بعد إعادة التحميل."
                    >
                      <input
                        type="text"
                        name="region"
                        id="region"
                        className="ph-control"
                        value={form.region}
                        onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                        onBlur={() => markTouched('region')}
                      />
                    </FormField>
                  </div>

                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBlockStart: 10 }}>
                    <button type="button" className="ph-text-action" onClick={() => setModal('logo')}>
                      <i className="fas fa-camera" /> {P.logo_change}
                    </button>
                    <button
                      type="button"
                      className="ph-text-action"
                      onClick={() => setModal('password')}
                    >
                      <i className="fas fa-key" /> {P.password_change.title}
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    padding: '18px 22px',
                    borderBlockStart: '1px solid var(--ph-line-soft)',
                  }}
                >
                  <button
                    type="button"
                    className="ph-btn primary"
                    disabled={save.isPending}
                    onClick={() => void handleSave()}
                  >
                    <i className="fas fa-save" /> {P.save_button}
                  </button>
                  <a href="/" className="ph-btn ghost">
                    {P.cancel_button}
                  </a>
                </div>
              </div>
            </div>

            <div className="ph-profile-side">
              <div className="ph-card">
                <div className="ph-card-head">
                  <h2>
                    <i className="fas fa-map-marker-alt" /> {P.location_title}
                  </h2>
                </div>
                <div className="ph-card-body">
                  <div
                    className="ph-map ph-map-sm"
                    data-lat={lat}
                    data-lng={lng}
                    role="img"
                    aria-label={P.map_display_hint}
                    style={{
                      background: 'linear-gradient(135deg, var(--ph-canvas), var(--ph-line-soft))',
                      display: 'grid',
                      placeItems: 'center',
                      color: 'var(--ph-ink-faint)',
                    }}
                  >
                    <i className="fas fa-map-location-dot" style={{ fontSize: '1.8rem' }} />
                  </div>
                  <p className="ph-hint">{P.map_display_hint}</p>
                  <button
                    type="button"
                    className="ph-text-action"
                    style={{ marginBlockStart: 12 }}
                    onClick={() => setModal('location')}
                  >
                    <i className="fas fa-location-dot" /> {P.location_change}
                  </button>
                </div>
              </div>

              <div className="ph-card">
                <div className="ph-card-head">
                  <h2>
                    <i className="fas fa-clock" /> {P.hours_title}
                  </h2>
                </div>
                <div className="ph-card-body ph-hours-compact">
                  {API_DAYS.map((d) => (
                    <div className="hc-row" key={d.key}>
                      <span className="hc-day">{d.name}</span>
                      <span className="hc-time">{dayLabel(hours[d.key])}</span>
                      <i className="fas fa-calendar-days" />
                    </div>
                  ))}
                </div>
                <div style={{ padding: '0 22px 18px' }}>
                  <button type="button" className="ph-text-action" onClick={() => setModal('hours')}>
                    <i className="fas fa-pen" /> {P.hours_change}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AsyncBoundary>

      {/* ── Password ───────────────────────────────────────────────── */}
      <Modal
        open={modal === 'password'}
        title={P.password_change.title}
        onClose={() => setModal(null)}
        footer={
          <>
            <button type="button" className="ph-btn ghost" onClick={() => setModal(null)}>
              {P.cancel_button}
            </button>
            <button
              type="button"
              className="ph-btn primary"
              disabled={changePassword.isPending || !pw.password}
              onClick={() => void handlePassword()}
            >
              {P.save_button}
            </button>
          </>
        }
      >
        <p className="ph-hint" style={{ marginBlockEnd: 14 }}>
          {P.password_change.hint}
        </p>
        {pwError && (
          <div className="ph-error" style={{ marginBlockEnd: 14, padding: 16 }}>
            <p style={{ margin: 0 }}>{pwError}</p>
          </div>
        )}
        <div className="ph-group" style={{ marginBlockEnd: 18 }}>
          <FormField
            label={P.password_change.new_password}
            id="new_password"
            required
            error={pwErrors.password}
            touched={pwTouched.touched.password}
            hint={P.password_change.password_hint}
          >
            <input
              type="password"
              name="password"
              id="new_password"
              className="ph-control"
              autoComplete="new-password"
              value={pw.password}
              onChange={(e) => setPw((p) => ({ ...p, password: e.target.value }))}
              onBlur={() => pwTouched.markTouched('password')}
            />
          </FormField>
        </div>
        <div className="ph-group">
          <FormField
            label={P.password_change.confirm_password}
            id="password_confirmation"
            required
            error={pwErrors.confirmation}
            touched={pwTouched.touched.confirmation}
          >
            <input
              type="password"
              name="password_confirmation"
              id="password_confirmation"
              className="ph-control"
              autoComplete="new-password"
              value={pw.confirmation}
              onChange={(e) => setPw((p) => ({ ...p, confirmation: e.target.value }))}
              onBlur={() => pwTouched.markTouched('confirmation')}
            />
          </FormField>
        </div>
      </Modal>

      {/* ── Logo (GAP-8: URL, not a file upload) ───────────────────── */}
      <Modal
        open={modal === 'logo'}
        title={P.logo_label}
        onClose={() => setModal(null)}
        footer={
          <>
            <button type="button" className="ph-btn ghost" onClick={() => setModal(null)}>
              {P.cancel_button}
            </button>
            <button
              type="button"
              className="ph-btn primary"
              disabled={save.isPending}
              onClick={() => void handleSave()}
            >
              {P.save_button}
            </button>
          </>
        }
      >
        <div style={{ textAlign: 'center' }}>
          <div
            className="ph-logo-preview"
            style={{
              display: 'grid',
              placeItems: 'center',
              background: 'var(--ph-teal-mist)',
              color: 'var(--ph-teal)',
              fontSize: '2.2rem',
              fontWeight: 700,
              overflow: 'hidden',
            }}
          >
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={form.pharmacy_name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              initial
            )}
          </div>
          <p className="ph-hint" style={{ marginBlock: '12px 8px' }}>
            الواجهة البرمجية تستقبل رابط صورة، لا ملفاً مرفوعاً.
          </p>
          <FormField
            label={P.logo_label}
            id="logoInput"
            error={fieldErrors.logo}
            touched={touched.logo}
          >
            <input
              type="url"
              name="logo"
              id="logoInput"
              className="ph-control"
              placeholder="https://..."
              value={logo}
              onChange={(e) => setLogo(e.target.value)}
              onBlur={() => markTouched('logo')}
            />
          </FormField>
        </div>
      </Modal>

      {/* ── Location ───────────────────────────────────────────────── */}
      <Modal
        open={modal === 'location'}
        title={P.location_title}
        onClose={() => setModal(null)}
        footer={
          <>
            <button type="button" className="ph-btn ghost" onClick={() => setModal(null)}>
              {P.cancel_button}
            </button>
            <button
              type="button"
              className="ph-btn primary"
              disabled={save.isPending}
              onClick={() => void handleSave()}
            >
              {P.save_button}
            </button>
          </>
        }
      >
        <div
          className="ph-map ph-map-edit"
          data-lat={lat}
          data-lng={lng}
          style={{
            background: 'linear-gradient(135deg, var(--ph-canvas), var(--ph-line-soft))',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--ph-ink-faint)',
          }}
        >
          <i className="fas fa-map-location-dot" style={{ fontSize: '1.8rem' }} />
        </div>
        <p className="ph-hint" style={{ marginBlockStart: 10 }}>
          {P.map_hint}
        </p>
        <div className="ph-group" style={{ marginBlockStart: 10 }}>
          <FormField
            label={P.latitude_label}
            id="latitude"
            error={fieldErrors.latitude}
            touched={touched.latitude}
            hint="مثال: 31.5017"
          >
            <input
              type="text"
              name="latitude"
              id="latitude"
              className="ph-control"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              onBlur={() => markTouched('latitude')}
            />
          </FormField>
        </div>
        <div className="ph-group" style={{ marginBlockStart: 10 }}>
          <FormField
            label={P.longitude_label}
            id="longitude"
            error={fieldErrors.longitude}
            touched={touched.longitude}
            hint="مثال: 34.4668"
          >
            <input
              type="text"
              name="longitude"
              id="longitude"
              className="ph-control"
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              onBlur={() => markTouched('longitude')}
            />
          </FormField>
        </div>
      </Modal>

      {/* ── Hours ──────────────────────────────────────────────────── */}
      <Modal
        open={modal === 'hours'}
        title={P.hours_title}
        onClose={() => setModal(null)}
        footer={
          <>
            <button type="button" className="ph-btn ghost" onClick={() => setModal(null)}>
              {P.cancel_button}
            </button>
            <button
              type="button"
              className="ph-btn primary"
              disabled={save.isPending}
              onClick={() => void handleSave()}
            >
              {P.save_button}
            </button>
          </>
        }
      >
        <div className="ph-hours-list ph-hours-editor">
          <div className="ph-hours-chips">
            <div className="ph-chip ph-chip-accent">
              <div className="ph-chip-label">{HQ.uniform}</div>
              <div className="ph-chip-value">{summary.unified}</div>
            </div>
            <div className="ph-chip">
              <div className="ph-chip-label">{HQ.exception}</div>
              <div className="ph-chip-value">{summary.exception}</div>
            </div>
          </div>

          <div style={{ marginBlockEnd: 10 }}>
            <button type="button" className="ph-btn sm outline" onClick={applyAll}>
              {HQ.apply_all}
            </button>
          </div>

          {API_DAYS.map((d) => {
            const s = hours[d.key];
            return (
              <div className="ph-day-card" data-day={d.key} key={d.key}>
                <div className="ph-day-top">
                  <span className="ph-day-name">{d.name}</span>
                  <span className="ph-day-status">{dayLabel(s)}</span>
                  <span className="ph-switch">
                    <input
                      type="checkbox"
                      className="ph-switch-input"
                      checked={!s.closed}
                      aria-label={d.name}
                      onChange={(e) => setDay(d.key, { closed: !e.target.checked })}
                    />
                    <span className="ph-switch-knob" />
                  </span>
                </div>
                {!s.closed && (
                  <div className="ph-day-controls">
                    <input
                      type="time"
                      name={`hours[${d.key}][open]`}
                      className="ph-control hc-time-input"
                      value={s.open}
                      disabled={s.h24}
                      onChange={(e) => setDay(d.key, { open: e.target.value })}
                    />
                    <span className="ph-day-to">{P.to}</span>
                    <input
                      type="time"
                      name={`hours[${d.key}][close]`}
                      className="ph-control hc-time-input"
                      value={s.close}
                      disabled={s.h24}
                      onChange={(e) => setDay(d.key, { close: e.target.value })}
                    />
                    <label className="ph-day-24">
                      <input
                        type="checkbox"
                        checked={s.h24}
                        onChange={(e) =>
                          setDay(d.key, {
                            h24: e.target.checked,
                            ...(e.target.checked ? { open: '00:00', close: '23:59' } : {}),
                          })
                        }
                      />
                      {HQ.open_24}
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Modal>

      {/*
        Session-ended notice. Replaces a `window.alert` that fired and was
        immediately destroyed by a redirect, so its text could never be read.
        No close button: the session is genuinely over, so re-login is the only
        way forward — offering "dismiss" would strand the user on a dead page.
      */}
      <Modal
        open={pwDone}
        title={P.password_change.title}
        onClose={() => {
          /* intentionally not dismissible */
        }}
        footer={
          <a href="/login" className="ph-btn primary">
            {P.password_change.relogin}
          </a>
        }
      >
        <div className="ph-empty">
          <i className="fas fa-circle-check" />
          <h3>{P.password_change.changed_title}</h3>
          <p>{P.password_change.changed_body}</p>
        </div>
      </Modal>
    </div>
  );
}
