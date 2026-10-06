import { useEffect, useMemo, useState } from 'react';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Modal } from '@/components/ui';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { thumbUrl } from '@/lib/format';
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
  const [saved, setSaved] = useState(false);
  const [pw, setPw] = useState({ password: '', confirmation: '' });
  const [pwError, setPwError] = useState<string | null>(null);

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
    try {
      await save.run({
        pharmacy_name: form.pharmacy_name,
        phone_number: form.phone_number,
        address: form.address,
        region: form.region,
        latitude: lat === '' ? null : Number(lat),
        longitude: lng === '' ? null : Number(lng),
        logo: logo || null,
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
    if (pw.password !== pw.confirmation) {
      setPwError('كلمتا المرور غير متطابقتين');
      return;
    }
    try {
      await changePassword.run({
        password: pw.password,
        password_confirmation: pw.confirmation,
      });
      setPw({ password: '', confirmation: '' });
      setModal(null);
      // The backend deletes ALL tokens on a password change, so the session is
      // over by design — a re-login is required.
      window.alert('تم تغيير كلمة المرور. يرجى تسجيل الدخول مرة أخرى.');
      window.location.href = '/login';
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

        <div className="ph-profile-form">
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
                    <label className="ph-form-label" htmlFor="pharmacy_name">
                      {P.name_label}
                    </label>
                    <input
                      type="text"
                      name="pharmacy_name"
                      id="pharmacy_name"
                      className="ph-control"
                      value={form.pharmacy_name}
                      onChange={(e) => setForm((f) => ({ ...f, pharmacy_name: e.target.value }))}
                    />
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
                    <label className="ph-form-label" htmlFor="phone_number">
                      {P.phone_label}
                    </label>
                    <input
                      type="text"
                      name="phone_number"
                      id="phone_number"
                      className="ph-control"
                      value={form.phone_number}
                      onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                    />
                  </div>

                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <label className="ph-form-label" htmlFor="address">
                      {P.address_label}
                    </label>
                    <textarea
                      name="address"
                      id="address"
                      className="ph-textarea"
                      style={{ width: '100%' }}
                      value={form.address}
                      onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    />
                  </div>

                  <div className="ph-group" style={{ marginBlockEnd: 18 }}>
                    <label className="ph-form-label" htmlFor="region">
                      {P.complete.region_label}
                    </label>
                    <input
                      type="text"
                      name="region"
                      id="region"
                      className="ph-control"
                      value={form.region}
                      onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    />
                    <p className="ph-hint">
                      تُحفظ المنطقة، لكن الواجهة البرمجية لا تعيدها بعد إعادة التحميل.
                    </p>
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
          <label className="ph-form-label" htmlFor="new_password">
            {P.password_change.new_password}
          </label>
          <input
            type="password"
            name="password"
            id="new_password"
            className="ph-control"
            value={pw.password}
            onChange={(e) => setPw((p) => ({ ...p, password: e.target.value }))}
          />
          <p className="ph-hint">{P.password_change.password_hint}</p>
        </div>
        <div className="ph-group">
          <label className="ph-form-label" htmlFor="password_confirmation">
            {P.password_change.confirm_password}
          </label>
          <input
            type="password"
            name="password_confirmation"
            id="password_confirmation"
            className="ph-control"
            value={pw.confirmation}
            onChange={(e) => setPw((p) => ({ ...p, confirmation: e.target.value }))}
          />
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
          <input
            type="url"
            name="logo"
            id="logoInput"
            className="ph-control"
            placeholder="https://..."
            value={logo}
            onChange={(e) => setLogo(e.target.value)}
          />
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
          <label className="ph-form-label" htmlFor="latitude">
            {P.latitude_label}
          </label>
          <input
            type="text"
            name="latitude"
            id="latitude"
            className="ph-control"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="ph-group" style={{ marginBlockStart: 10 }}>
          <label className="ph-form-label" htmlFor="longitude">
            {P.longitude_label}
          </label>
          <input
            type="text"
            name="longitude"
            id="longitude"
            className="ph-control"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
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
    </div>
  );
}
