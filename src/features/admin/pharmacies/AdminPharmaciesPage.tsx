import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Btn,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/LanguageContext';
import { useUrlState } from '@/lib/urlState';
import { num, pageInfo, timeAgo } from '../shared';
import { CredentialsModal } from './CredentialsModal';
import type { AdminPharmaciesResponse, DeliveredCredentials } from '@/api/adminTypes';

/** What the map modal needs to draw a pin. */
interface MapTarget {
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
}

/**
 * Does this row carry a usable coordinate pair?
 *
 * The API returns `latitude`/`longitude` as `decimal:8` casts, so they arrive
 * as STRINGS, and a never-placed pharmacy sends `null`. `Number(null)` is `0`,
 * which is a *valid* coordinate (the Gulf of Guinea) — so a truthiness or
 * `Number()` check would happily offer a map for a pharmacy with no location.
 * Both bounds are therefore checked explicitly.
 */
function hasCoords(lat: number | string | null, lng: number | string | null): boolean {
  if (lat === null || lng === null || lat === '' || lng === '') return false;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

/**
 * Admin pharmacies — list, create, toggle, reset credentials, delete.
 *
 * Mirrors `pharmacies/index.blade.php` + `web/Pharmacy/PharmacyController`.
 *
 * ============================================================================
 * 🔴 THE CREDENTIALS FLOW IS THE POINT OF THIS SCREEN
 * ============================================================================
 * Two API responses can carry one-time credentials:
 *   · `POST /api/admin/pharmacies`            → always (a new account)
 *   · `PATCH .../toggle-status`               → only when activating a
 *                                               never-delivered pharmacy
 *   · `PATCH .../reset-credentials`           → always
 *
 * In every case they are captured into `credentials` STATE and shown in a modal.
 * They are never put in a URL, a toast, or a log — a toast would leak them into
 * the DOM briefly and any screenshot would expose them.
 *
 * ============================================================================
 * WHY A CARD GRID RATHER THAN THE TABLE PRIMITIVE
 * ============================================================================
 * Blade renders pharmacies as a card grid (name, id, item count, actions), not
 * a table, and each card carries 3–4 actions. DataTable is built for scannable
 * tabular data with one action column; forcing this screen into it would fight
 * the component. The grid keeps Blade's shape and the CSS that styles it.
 */
export function AdminPharmaciesPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();

  // Phase 3: filters + pagination in the URL (shareable, back/forward-safe).
  const { state, set } = useUrlState({
    q: { key: 'q', parse: String, serialize: String, default: '' },
    status: { key: 'status', parse: String, serialize: String, default: 'all' },
    page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  });

  /** The live input value; the URL `q` is the committed (debounced) term. */
  const [q, setQ] = useState(state.q as string);
  const committedQ = state.q as string;
  const status = state.status as 'all' | 'active' | 'disabled';
  const setStatus = (value: typeof status) => set({ status: value, page: 1 });
  const page = Math.max(1, Number(state.page) || 1);
  const setPage = (value: number | ((p: number) => number)) => {
    set({ page: typeof value === 'function' ? value(page) : value });
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [credentials, setCredentials] = useState<DeliveredCredentials | null>(null);
  const [mapTarget, setMapTarget] = useState<MapTarget | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'delete' | 'toggle' | 'reset'; id: number; name: string } | null
  >(null);

  /**
   * Copy a pharmacy id to the clipboard.
   *
   * `navigator.clipboard` is unavailable on insecure origins (plain `http://`
   * that is not localhost), so a naive `await copy()` throws and the button
   * silently does nothing. Fall back to the legacy path, and report failure
   * honestly rather than claiming a copy that did not happen.
   */
  async function copyId(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(C.copied);
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
        toast.success(C.copied);
      } catch {
        toast.error(C.copy_failed);
      }
    }
  }

  const C = STR.admin.pharmacies;

  // Debounce the search so typing does not fire a request per keystroke — and
  // only commit when the term changed, so a deep link is not rewritten on mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q !== committedQ) set({ q, page: 1 });
    }, 350);
    return () => clearTimeout(timer);
  }, [q, committedQ, set]);

  const query = useApiQuery<AdminPharmaciesResponse>(
    (signal) => api.admin.pharmacies({ q: committedQ, status, page, per_page: 50 }, signal),
    [committedQ, status, page],
    { queryKey: keys.pharmacies.list({ q: committedQ, status, page, per_page: 50 }) },
  );

  const data = query.data;
  const pagination = data?.pagination;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  /** See AdminMedicineRequestsPage — the recovery action only appears when a
   *  filter is actually responsible for the empty list. */
  const isFiltered = q.trim() !== '' || status !== 'all';
  function clearFilters() {
    setQ('');
    set({ q: '', status: 'all', page: 1 });
  }

  const createMutation = useApiMutation(async (name: string) =>
    api.admin.createPharmacy(name),
  );
  const toggleMutation = useApiMutation(async (id: number) => api.admin.togglePharmacy(id));
  const resetMutation = useApiMutation(async (id: number) =>
    api.admin.resetPharmacyCredentials(id),
  );
  const deleteMutation = useApiMutation(async (id: number) => api.admin.deletePharmacy(id));

  // ── طلبات استعادة كلمة المرور — قائمة مراجعة الأدمن ─────────────────────
  // الموافقة هنا ليست إشعاراً: تولّد كلمة مرور جديدة فعلاً وتُلغي الجلسات
  // القائمة، وتُعيدها في الرد مرة واحدة — فتُعرض عبر نفس `CredentialsModal`
  // الذي يعرض بيانات إنشاء الصيدلية (ولا تُمرَّر أبداً عبر toast أو URL).
  const resetRequestsQuery = useApiQuery<{
    success: boolean;
    data: Array<{
      id: number;
      status: 'pending';
      created_at: string | null;
      pharmacy: { id: number; name: string; pharmacy_id: string; phone: string | null };
    }>;
    pagination: { current_page: number; last_page: number; per_page: number; total: number };
  }>(
    (signal) => api.admin.pharmacyPasswordResetRequests(signal),
    ['pharmacy-password-reset-requests'],
    { queryKey: keys.pharmacies.passwordResetRequests },
  );
  const approveResetRequestMutation = useApiMutation((id: number) =>
    api.admin.approvePharmacyPasswordResetRequest(id),
  );
  const rejectResetRequestMutation = useApiMutation((id: number) =>
    api.admin.rejectPharmacyPasswordResetRequest(id),
  );

  async function reviewResetRequest(id: number, action: 'approve' | 'reject') {
    try {
      if (action === 'approve') {
        const result = await approveResetRequestMutation.run(id);
        setCredentials(result.data.credentials);
        toast.success('تمت الموافقة على الطلب وتوليد بيانات دخول جديدة.');
      } else {
        await rejectResetRequestMutation.run(id);
        toast.success('تم رفض طلب الاستعادة.');
      }
      resetRequestsQuery.refetch();
    } catch {
      // الرفض المتزامن من أدمن آخر يعود 409 — الرسالة العامة تغطيه.
      toast.error('تعذّرت مراجعة الطلب. قد يكون تمت مراجعته من مسؤول آخر.');
    }
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const response = await createMutation.run(name);
      setNewName('');
      setCreateOpen(false);
      // Show credentials BEFORE refetching — they only exist in this response.
      setCredentials(response.data.credentials);
      toast.success(C.created);
      query.refetch();
    } catch {
      toast.error('تعذّرت إضافة الصيدلية، حاول مرة أخرى.');
    }
  }

  async function handleConfirmedAction() {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);

    try {
      if (kind === 'delete') {
        await deleteMutation.run(id);
        toast.success(C.deleted);
        query.refetch();
      } else if (kind === 'toggle') {
        const result = await toggleMutation.run(id);
        toast.success(C.status_updated);
        // Activating a never-delivered pharmacy delivers credentials here.
        if (result.credentials) setCredentials(result.credentials);
        query.refetch();
      } else {
        const response = await resetMutation.run(id);
        toast.success(C.updated);
        setCredentials(response.data.credentials);
        query.refetch();
      }
    } catch {
      toast.error('تعذّر تنفيذ العملية، حاول مرة أخرى.');
    }
  }

  const isPending =
    toggleMutation.isPending || resetMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <PageHeader
        title={C.title}
        subtitle={STR.admin.nav.pharmacies}
        icon="fas fa-store"
        actions={
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>
            <i className="fas fa-plus" /> {C.add_button}
          </Btn>
        }
      />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {data && (
          <>
            <div className="ph-stats-grid">
              <StatCard
                tone="teal"
                icon="fas fa-store"
                value={num(data.stats.total)}
                label={C.stat_total}
              />
              <StatCard
                tone="green"
                icon="fas fa-circle-check"
                value={num(data.stats.active)}
                label={C.stat_active}
              />
              <StatCard
                tone="red"
                icon="fas fa-circle-xmark"
                value={num(data.stats.disabled)}
                label={C.stat_disabled}
              />
              <StatCard
                tone="blue"
                icon="fas fa-pills"
                value={num(data.stats.total_items)}
                label={C.stat_items}
              />
            </div>

            {/* ── طلبات استعادة كلمة المرور — مراجعة الأدمن ──────────────── */}
            <Card
              title="طلبات استعادة كلمة مرور الصيدليات"
              icon="fas fa-key"
              description="راجع الطلبات الواردة. عند الموافقة ستظهر كلمة المرور الجديدة مرة واحدة فقط."
            >
              {resetRequestsQuery.isLoading ? (
                <p className="admin-muted">جارٍ تحميل الطلبات…</p>
              ) : resetRequestsQuery.isError ? (
                <div className="admin-error-state">
                  <p>تعذّر تحميل طلبات الاستعادة.</p>
                  <Btn variant="outline" size="sm" onClick={resetRequestsQuery.refetch}>
                    إعادة المحاولة
                  </Btn>
                </div>
              ) : !resetRequestsQuery.data?.data.length ? (
                <p className="admin-muted">لا توجد طلبات استعادة معلّقة.</p>
              ) : (
                <div className="admin-list">
                  {resetRequestsQuery.data.data.map((item) => (
                    <div className="admin-list-row" key={item.id}>
                      <div className="admin-list-row__main">
                        <strong>{item.pharmacy.name}</strong>
                        <span dir="ltr">{item.pharmacy.pharmacy_id}</span>
                        <span dir="ltr">{item.pharmacy.phone ?? '—'}</span>
                        <small>
                          {item.created_at ? timeAgo(item.created_at) : 'وقت الطلب غير متاح'}
                        </small>
                      </div>
                      <div className="admin-list-row__actions">
                        <Btn
                          variant="primary"
                          size="sm"
                          disabled={
                            approveResetRequestMutation.isPending || rejectResetRequestMutation.isPending
                          }
                          onClick={() => reviewResetRequest(item.id, 'approve')}
                        >
                          الموافقة وإعادة التعيين
                        </Btn>
                        <Btn
                          variant="danger"
                          size="sm"
                          disabled={
                            approveResetRequestMutation.isPending || rejectResetRequestMutation.isPending
                          }
                          onClick={() => reviewResetRequest(item.id, 'reject')}
                        >
                          رفض
                        </Btn>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card
              headExtra={
                <div className="admin-filters">
                  <input
                    type="search"
                    className="admin-search"
                    placeholder={STR.admin.common.search}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label={STR.admin.common.search}
                  />
                  <div className="ph-pills">
                    {(['all', 'active', 'disabled'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`ph-pill${status === key ? ' active' : ''}`}
                        aria-pressed={status === key}
                        onClick={() => {
                          setStatus(key);
                          setPage(1);
                        }}
                      >
                        {key === 'all' ? C.filter_all : key === 'active' ? C.filter_active : C.filter_disabled}
                      </button>
                    ))}
                  </div>
                </div>
              }
            >
              {data.pharmacies.length === 0 ? (
                <EmptyState
                  icon="fas fa-store"
                  title={C.empty}
                  description={isFiltered ? STR.admin.common.empty_filtered_hint : C.empty_hint}
                  action={
                    isFiltered ? (
                      <Btn size="sm" variant="outline" onClick={clearFilters}>
                        <i className="fas fa-rotate-left" aria-hidden="true" />{' '}
                        {STR.admin.common.clear_filters}
                      </Btn>
                    ) : undefined
                  }
                />
              ) : (
                <div className="admin-card-grid">
                  {data.pharmacies.map((pharmacy) => {
                    /*
                     * Blade derives a THIRD state the API has no column for:
                     * a pharmacy that is inactive *and* was never delivered has
                     * not been rejected — it is still awaiting activation.
                     * `pharmacies/index.blade.php` computes exactly this
                     * (`$isPending = !$is_active && $delivered_at === null`)
                     * and paints it a distinct badge colour, so the admin can
                     * tell "not yet set up" apart from "switched off".
                     */
                    const isPending = !pharmacy.is_active && pharmacy.delivered_at === null;
                    const state = isPending
                      ? 'pending'
                      : pharmacy.is_active
                        ? 'active'
                        : 'disabled';

                    return (
                      <article key={pharmacy.id} className="pharmacy-card-pro">
                        {/* Head — brand avatar + name + phone, and the status badge */}
                        <div className="card-head">
                          <div className="pharmacy-brand">
                            <div className="avatar-glow-box" aria-hidden="true">
                              <span className="avatar-letter">
                                {pharmacy.pharmacy_name.trim().charAt(0)}
                              </span>
                            </div>
                            <div className="brand-text">
                              <h4 className="pharmacy-title">{pharmacy.pharmacy_name}</h4>
                              <span className="pharmacy-phone-tag">
                                <i className="fas fa-phone" aria-hidden="true" />
                                <span dir="ltr">
                                  {pharmacy.phone_number ?? C.phone_missing}
                                </span>
                              </span>
                            </div>
                          </div>

                          <div className={`status-indicator-badge ${state}`}>
                            <span className="status-pulse" aria-hidden="true" />
                            <span>
                              {isPending
                                ? C.status_pending
                                : pharmacy.is_active
                                  ? C.status_active
                                  : C.status_disabled}
                            </span>
                          </div>
                        </div>

                        {/* ID strip — code + copy, matching Blade's id-copy-strip */}
                        <div className="id-copy-strip">
                          <span className="strip-label">{C.col_id}</span>
                          <div className="strip-code-group">
                            <code className="code-text" dir="ltr">
                              {pharmacy.pharmacy_custom_id}
                            </code>
                            <button
                              type="button"
                              className="btn-copy-chip"
                              title={C.copy_tooltip}
                              aria-label={`${C.copy_tooltip} ${pharmacy.pharmacy_custom_id}`}
                              onClick={() => void copyId(pharmacy.pharmacy_custom_id)}
                            >
                              <i className="fas fa-copy" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        {/* Info grid — location (+ map) and item count */}
                        <div className="card-info-grid">
                          <div className="info-tile tile-location">
                            <div className="tile-content">
                              <div className="tile-header">
                                <span className="tile-icon">
                                  <i className="fas fa-location-dot" aria-hidden="true" />
                                </span>
                                <span className="tile-label">{C.col_location}</span>
                              </div>
                              <div
                                className="tile-address bidi-text"
                                title={pharmacy.address ?? undefined}
                              >
                                {pharmacy.address ?? C.address_not_specified}
                              </div>
                            </div>

                            {/*
                             * Only offered when there is a real coordinate pair.
                             * Blade renders the button unconditionally and hands
                             * `null,null` to the map modal, which opens an empty
                             * map — a control that looks broken. Hiding it when
                             * there is nothing to show is the honest version.
                             */}
                            {hasCoords(pharmacy.latitude, pharmacy.longitude) && (
                              <button
                                type="button"
                                className="btn-show-map"
                                title={C.show_map}
                                onClick={() =>
                                  setMapTarget({
                                    name: pharmacy.pharmacy_name,
                                    latitude: pharmacy.latitude,
                                    longitude: pharmacy.longitude,
                                  })
                                }
                              >
                                <i className="fas fa-map" aria-hidden="true" />
                                <span>{C.map}</span>
                              </button>
                            )}
                          </div>

                          <div className="info-tile tile-medicines">
                            <div className="tile-content">
                              <div className="tile-header">
                                <span className="tile-icon">
                                  <i className="fas fa-pills" aria-hidden="true" />
                                </span>
                                <span className="tile-label">{C.col_items}</span>
                              </div>
                              <span className="tile-val accent-teal">
                                {num(pharmacy.pharmacy_medicines_count)} {C.items_suffix}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Foot — relative time + icon actions */}
                        <div className="card-foot">
                          <span className="time-meta">
                            <i className="far fa-clock" aria-hidden="true" />
                            {timeAgo(pharmacy.delivered_at ?? undefined) || C.date_missing}
                          </span>

                          <div className="actions-flex">
                            <button
                              type="button"
                              className={`act-btn ${pharmacy.is_active ? 'act-pause' : 'act-play'}`}
                              title={pharmacy.is_active ? C.action_disable : C.action_activate}
                              aria-label={
                                pharmacy.is_active ? C.action_disable : C.action_activate
                              }
                              disabled={isPending}
                              onClick={() =>
                                setConfirmAction({
                                  kind: 'toggle',
                                  id: pharmacy.id,
                                  name: pharmacy.pharmacy_name,
                                })
                              }
                            >
                              <i
                                className={
                                  pharmacy.is_active ? 'fas fa-pause' : 'fas fa-play'
                                }
                                aria-hidden="true"
                              />
                            </button>

                            <button
                              type="button"
                              className="act-btn act-view"
                              title={C.action_reset}
                              aria-label={`${C.action_reset} — ${pharmacy.pharmacy_name}`}
                              disabled={isPending}
                              onClick={() =>
                                setConfirmAction({
                                  kind: 'reset',
                                  id: pharmacy.id,
                                  name: pharmacy.pharmacy_name,
                                })
                              }
                            >
                              <i className="fas fa-key" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              className="act-btn act-delete"
                              title={C.action_delete}
                              aria-label={`${C.action_delete} — ${pharmacy.pharmacy_name}`}
                              disabled={isPending}
                              onClick={() =>
                                setConfirmAction({
                                  kind: 'delete',
                                  id: pharmacy.id,
                                  name: pharmacy.pharmacy_name,
                                })
                              }
                            >
                              <i className="fas fa-trash" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}

              {pagination && pagination.last_page > 1 && (
                <div className="admin-pagination">
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {STR.admin.common.previous}
                  </Btn>
                  <span>{info?.label}</span>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {STR.admin.common.next}
                  </Btn>
                </div>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>

      {/* Create */}
      <Modal
        open={createOpen}
        title={C.add_title}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setCreateOpen(false)}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn
              variant="primary"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
            >
              {STR.admin.common.save}
            </Btn>
          </>
        }
      >
        <p className="admin-hint">{C.add_hint}</p>
        <label className="admin-field">
          <span>{C.name_label}</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            required
          />
        </label>
      </Modal>

      {/* Confirm toggle / reset / delete */}
      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.kind === 'delete'
            ? C.action_delete
            : confirmAction?.kind === 'reset'
              ? C.action_reset
              : C.action_activate
        }
        onClose={() => setConfirmAction(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmAction(null)}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn
              variant={confirmAction?.kind === 'delete' ? 'danger' : 'primary'}
              onClick={handleConfirmedAction}
              disabled={isPending}
            >
              {STR.admin.common.confirm}
            </Btn>
          </>
        }
      >
        <p>
          {confirmAction?.kind === 'delete'
            ? C.confirm_delete
            : confirmAction?.kind === 'reset'
              ? C.confirm_reset
              : C.confirm_toggle}
        </p>
        {confirmAction && <strong>{confirmAction.name}</strong>}
      </Modal>

      {/* Location map — mirrors Blade's `openMapModal` */}
      <Modal
        open={mapTarget !== null}
        title={`${C.map_title}${mapTarget ? ` — ${mapTarget.name}` : ''}`}
        onClose={() => setMapTarget(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setMapTarget(null)}>
              {STR.admin.common.close}
            </Btn>
            {mapTarget && (
              <a
                className="btn-external-gmaps"
                href={`https://www.google.com/maps?q=${encodeURIComponent(
                  `${mapTarget.latitude},${mapTarget.longitude}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <i className="fas fa-arrow-up-right-from-square" aria-hidden="true" />
                {C.open_in_maps}
              </a>
            )}
          </>
        }
      >
        {mapTarget && hasCoords(mapTarget.latitude, mapTarget.longitude) ? (
          /*
           * An OpenStreetMap embed rather than Google Maps: it needs no API key,
           * so this works in every environment (dev, preview, prod) with no
           * configuration. The "open in Google Maps" link in the footer covers
           * the case where the admin wants directions.
           */
          <iframe
            className="admin-map-frame"
            title={`${C.map_title} — ${mapTarget.name}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
              [
                Number(mapTarget.longitude) - 0.008,
                Number(mapTarget.latitude) - 0.005,
                Number(mapTarget.longitude) + 0.008,
                Number(mapTarget.latitude) + 0.005,
              ].join(','),
            )}&layer=mapnik&marker=${encodeURIComponent(
              `${mapTarget.latitude},${mapTarget.longitude}`,
            )}`}
          />
        ) : (
          <p className="admin-muted">{C.map_no_coords}</p>
        )}
      </Modal>

      {/* One-time credentials */}
      <CredentialsModal
        open={credentials !== null}
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
    </>
  );
}
