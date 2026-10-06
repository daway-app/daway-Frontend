import { useEffect, useState } from 'react';
import { AR } from '@/lib/i18n';
import { AsyncBoundary } from '@/components/ui';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { thumbUrl } from '@/lib/format';
import type { ApiDayKey, ApiPharmacyProfile } from '@/api/pharmacyTypes';
import { API_DAYS, buildHoursPayload, isDayOpen, type DayState } from './hours';

/**
 * Pharmacy profile — complete. Live against `GET/POST /api/profile/pharmacy`.
 *
 * Port of `resources/views/pharmacy/profile/complete.blade.php`.
 * CSS family: `users_create.css` + `src/styles/pages/profile-complete.css`.
 *
 * The Blade inline JS provided `setDay` / `closeDay` / `copyDay` / `applyPreset`
 * / `togglePass` — all reproduced with React state. Leaflet is not pulled in;
 * the map keeps its `.complete-map` box with a static placeholder.
 *
 * Hours use the shared contract in `./hours.ts`: short day keys, `null` times
 * meaning closed, and a FULL-REPLACE save that must send all seven days.
 */
const P = AR.pharmacy.profile;
const C = P.complete;
const HQ = P.hours_quick;

type Row = { closed: boolean; open: string; close: string };

function initRows(profile: ApiPharmacyProfile | null): Record<ApiDayKey, Row> {
  const out = {} as Record<ApiDayKey, Row>;
  for (const d of API_DAYS) {
    const row = profile?.working_hours?.[d.key];
    out[d.key] = {
      closed: !isDayOpen(row ?? undefined),
      open: row?.open ?? '',
      close: row?.close ?? '',
    };
  }
  return out;
}

export function ProfileCompletePage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const query = useApiQuery<ApiPharmacyProfile>((signal) => api.profile(signal), [], {
    isEmpty: () => false,
  });
  const profile = query.data;

  const [rows, setRows] = useState<Record<ApiDayKey, Row>>(() => initRows(null));
  const [form, setForm] = useState({
    pharmacy_name: '',
    phone_number: '',
    address: '',
    region: '',
  });
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [logo, setLogo] = useState('');
  const [saved, setSaved] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConf, setShowConf] = useState(false);

  const save = useApiMutation((body: Record<string, unknown>) => api.updateProfile(body));

  // Hydrate once the profile lands (and re-sync after a successful save).
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
    setRows(initRows(profile));
  }, [profile]);

  const setDay = (key: ApiDayKey, open: string, close: string, closed = false) =>
    setRows((prev) => ({
      ...prev,
      [key]: { closed, open: closed ? '' : open, close: closed ? '' : close },
    }));

  /** Blade `copyDay` — copy this day onto every other day. */
  const copyDay = (key: ApiDayKey) =>
    setRows((prev) => {
      const src = prev[key];
      const next = { ...prev };
      for (const d of API_DAYS) if (d.key !== key) next[d.key] = { ...src };
      return next;
    });

  /** Blade `applyPreset`. */
  const applyPreset = (mode: 'unified' | '24h' | 'friday_off' | 'clear') => {
    setRows((prev) => {
      const next = { ...prev };
      for (const d of API_DAYS) {
        if (mode === 'clear') next[d.key] = { closed: true, open: '', close: '' };
        else if (mode === '24h') next[d.key] = { closed: false, open: '00:00', close: '23:59' };
        else
          next[d.key] = {
            closed: mode === 'friday_off' && d.key === 'fri',
            open: '09:00',
            close: '17:00',
          };
      }
      return next;
    });
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    try {
      await save.run({
        /**
         * Field names are the API contract, not the DB column names — see the
         * longer note in `ProfilePage.tsx`. The controller translates `name` →
         * `pharmacy_name`, `phone` → `phone_number`, `logo_url` → `logo`.
         * Sending the DB names means those three fail validation and are
         * silently dropped.
         */
        name: form.pharmacy_name,
        phone: form.phone_number,
        address: form.address,
        region: form.region,
        latitude: lat === '' ? null : Number(lat),
        longitude: lng === '' ? null : Number(lng),
        logo_url: logo || null,
        // FULL REPLACE — all seven days, or untouched days become closed.
        working_hours: buildHoursPayload(
          Object.fromEntries(
            API_DAYS.map((d) => [
              d.key,
              { ...rows[d.key], h24: rows[d.key].open === '00:00' && rows[d.key].close === '23:59' },
            ]),
          ) as Record<ApiDayKey, DayState>,
        ),
      });
      setSaved(true);
      query.refetch();
    } catch {
      // `save.error` renders below.
    }
  }

  const avatarSrc = thumbUrl(logo, 88, 88);
  const initial = (form.pharmacy_name || 'ص').slice(0, 1);

  return (
    <div className="page-wrapper" style={{ maxWidth: 1100 }}>
      <div className="main-card">
        <div className="card-header-modern">
          <div className="header-title-area">
            <h2>{C.heading}</h2>
            <p>{C.subtitle.replace(':pharmacy', form.pharmacy_name || user?.name || '')}</p>
          </div>
          <div className="header-icon">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        </div>

        <AsyncBoundary
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={query.refetch}
          loadingRows={6}
        >
          <div className="complete-layout">
          {/* العمود الأول: بيانات الصيدلية + كلمة المرور */}
          <div className="complete-col">
            <div className="complete-hero">
              <div className="complete-avatar" style={{ overflow: 'hidden' }}>
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={form.pharmacy_name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span>{initial}</span>
                )}
              </div>
              <div className="complete-hero-text">
                <strong>{form.pharmacy_name || '—'}</strong>
                <span className="complete-badge">{C.title}</span>
              </div>
            </div>

            {saved && (
              <div className="ph-alt-notice" style={{ marginBlockEnd: 14 }}>
                <i className="fas fa-circle-check" aria-hidden="true" /> {C.success}
              </div>
            )}

            {save.error && (
              <div className="ph-error" style={{ marginBlockEnd: 14 }}>
                <i className="fas fa-circle-exclamation" aria-hidden="true" />
                <p>{save.error.message}</p>
              </div>
            )}

            <form action="#" method="POST" onSubmit={submit}>
              <div className="form-group">
                <label>
                  {P.phone_label} <span>*</span>
                </label>
                <div className="input-with-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <input
                    type="text"
                    name="phone_number"
                    id="phone_number"
                    className="form-control"
                    value={form.phone_number}
                    onChange={(e) => setForm((f) => ({ ...f, phone_number: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>
                  {P.address_label} <span>*</span>
                </label>
                <div className="input-with-icon input-with-icon-top">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <textarea
                    name="address"
                    id="address"
                    className="form-control"
                    rows={2}
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>
                  {C.region_label} <span>*</span>
                </label>
                <div className="input-with-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <input
                    type="text"
                    name="region"
                    id="region"
                    className="form-control"
                    value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label>{C.logo_label}</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    id="completeLogoPreview"
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 16,
                      background: '#E3F0F8',
                      color: '#155E85',
                      display: 'grid',
                      placeItems: 'center',
                      overflow: 'hidden',
                      flexShrink: 0,
                      boxShadow: '0 2px 8px rgba(28,114,166,.15)',
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="file"
                      name="logo"
                      id="logoInput"
                      accept=".jpg,.jpeg,.png,.webp"
                      className="form-control"
                      style={{ padding: '9px 12px' }}
                    />
                    <p className="hint-under">{C.logo_hint}</p>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label>{P.email_label}</label>
                <div className="input-with-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input type="email" name="email" id="email" className="form-control" />
                </div>
                <p className="hint-under">{C.email_hint}</p>
              </div>

              <div className="complete-security-head">
                <div className="lock-ic">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h3>{C.password_section}</h3>
                  <p>{C.password_optional_hint}</p>
                </div>
              </div>

              <div className="form-group">
                <label>{C.new_password}</label>
                <div className="input-with-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type={showNew ? 'text' : 'password'}
                    name="password"
                    id="newPass"
                    className="form-control"
                    minLength={8}
                    autoComplete="new-password"
                    placeholder={C.password_optional_placeholder}
                  />
                  <button
                    type="button"
                    className={`eye-toggle ${showNew ? 'eye-active' : ''}`}
                    onClick={() => setShowNew((v) => !v)}
                    tabIndex={-1}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>{C.confirm_password}</label>
                <div className="input-with-icon">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    type={showConf ? 'text' : 'password'}
                    name="password_confirmation"
                    id="confPass"
                    className="form-control"
                    autoComplete="new-password"
                    placeholder={C.password_optional_placeholder}
                  />
                  <button
                    type="button"
                    className={`eye-toggle ${showConf ? 'eye-active' : ''}`}
                    onClick={() => setShowConf((v) => !v)}
                    tabIndex={-1}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* العمود الثاني: الموقع + ساعات العمل */}
          <div className="complete-col">
            <div className="complete-card">
              <div className="complete-card-head">
                <span className="complete-card-ic">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </span>
                <h3>{P.location_title}</h3>
              </div>
              <div className="complete-card-body">
                <div
                  className="complete-map"
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
                {/* الحقلان يحملان مركز الخريطة الافتراضي كقيمة ابتدائية — نفس Blade. */}
                <input type="hidden" name="latitude" id="latitude" defaultValue={lat} />
                <input
                  type="hidden"
                  name="longitude"
                  id="longitude"
                  defaultValue={lng}
                />
                <p className="hint-under">{C.location_default_hint}</p>
              </div>
            </div>

            <div className="complete-card">
              <div className="complete-card-head">
                <span className="complete-card-ic">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </span>
                <h3>
                  {P.hours_title} <span style={{ color: '#ef4444' }}>*</span>
                </h3>
              </div>
              <div className="complete-card-body">
                <div className="complete-hours-quickbar">
                  <button type="button" className="btn-quick" onClick={() => applyPreset('unified')}>
                    {HQ.unified}
                  </button>
                  <button type="button" className="btn-quick" onClick={() => applyPreset('24h')}>
                    {HQ.h24}
                  </button>
                  <button type="button" className="btn-quick" onClick={() => applyPreset('friday_off')}>
                    {HQ.friday_off}
                  </button>
                  <button
                    type="button"
                    className="btn-quick btn-quick-ghost"
                    onClick={() => applyPreset('clear')}
                  >
                    {HQ.clear}
                  </button>
                </div>

                {API_DAYS.map((d) => {
                  const r = rows[d.key];
                  return (
                    <div className="complete-day-row" key={d.key}>
                      <label className="complete-day-label">
                        <input
                          type="checkbox"
                          name={`hours[${d.key}][is_closed]`}
                          value="1"
                          checked={r.closed}
                          onChange={(e) => setDay(d.key, '', '', e.target.checked)}
                        />
                        {d.name}
                      </label>
                      <div className="complete-day-times">
                        <input
                          type="time"
                          name={`hours[${d.key}][open_time]`}
                          className="form-control"
                          value={r.open}
                          disabled={r.closed}
                          onChange={(e) => setDay(d.key, e.target.value, r.close)}
                        />
                        <span className="complete-day-sep">–</span>
                        <input
                          type="time"
                          name={`hours[${d.key}][close_time]`}
                          className="form-control"
                          value={r.close}
                          disabled={r.closed}
                          onChange={(e) => setDay(d.key, r.open, e.target.value)}
                        />
                      </div>
                      <div className="complete-day-quick">
                        <button
                          type="button"
                          className="btn-mini"
                          title={HQ.copy_title}
                          onClick={() => copyDay(d.key)}
                        >
                          {HQ.copy}
                        </button>
                        <button
                          type="button"
                          className="btn-mini"
                          title={HQ.h24}
                          onClick={() => setDay(d.key, '00:00', '23:59')}
                        >
                          24h
                        </button>
                        <button
                          type="button"
                          className="btn-mini btn-mini-danger"
                          title={HQ.closed_title}
                          onClick={() => setDay(d.key, '', '', true)}
                        >
                          {HQ.closed}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="complete-footer">
              <button type="submit" className="btn-submit" disabled={save.isPending}>
                <i className="fas fa-save" /> {C.save_button}
              </button>
            </div>
          </div>
          </div>
        </AsyncBoundary>
      </div>
    </div>
  );
}
