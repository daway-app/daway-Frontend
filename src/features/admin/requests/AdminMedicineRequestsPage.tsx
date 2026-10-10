import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  Modal,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { formatDate, num, pageInfo } from '../shared';
import type { AdminMedicineRequestsResponse, AdminMedicineRequest } from '@/api/adminTypes';

/**
 * Admin medicine requests — review, approve, reject.
 *
 * Mirrors `medicine_requests/index.blade.php` + `show.blade.php`, combined into
 * one screen with a modal. Blade splits them across two pages; the only reason
 * is that Blade has no client-side modal, and here the review form is small
 * enough that a full page navigation costs more than it explains.
 *
 * ============================================================================
 * 🔴 THE APPROVAL FORM IS DELIBERATELY MOSTLY EMPTY
 * ============================================================================
 * `POST .../approve` accepts optional overrides. The backend treats a MISSING
 * field as "keep the request's value" — so sending `trade_name: ''` would be
 * very different from omitting it. This form therefore only sends keys the admin
 * actually edited, and omits the rest. Sending the form wholesale (with blanks)
 * would overwrite good request data with empty strings and silently blank the
 * medicine's name.
 *
 * The reject path requires notes (validated server-side, max 2000) because a
 * rejection with no reason leaves the pharmacy unable to fix the submission.
 */
export function AdminMedicineRequestsPage() {
  const api = useAdminApi();

  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [reviewing, setReviewing] = useState<AdminMedicineRequest | null>(null);
  const [rejecting, setRejecting] = useState<AdminMedicineRequest | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');

  // Editable approval fields — seeded from the request when the modal opens.
  const [editName, setEditName] = useState('');
  const [editNameAr, setEditNameAr] = useState('');
  const [editIngredient, setEditIngredient] = useState('');

  const R = AR.admin.requests;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminMedicineRequestsResponse>(
    (signal) => api.admin.medicineRequests({ q: debouncedQ, status, page, per_page: 25 }, signal),
    [debouncedQ, status, page],
  );

  const rows = useMemo(() => query.data?.requests ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const stats = query.data?.stats;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  const approveMutation = useApiMutation(
    async (payload: { id: number; body: Record<string, unknown> }) =>
      api.admin.approveMedicineRequest(payload.id, payload.body),
  );
  const rejectMutation = useApiMutation(
    async (payload: { id: number; notes: string }) =>
      api.admin.rejectMedicineRequest(payload.id, payload.notes),
  );

  function openReview(request: AdminMedicineRequest) {
    setEditName(request.trade_name ?? '');
    setEditNameAr(request.trade_name_ar ?? '');
    setEditIngredient(request.active_ingredient ?? '');
    setReviewing(request);
  }

  async function handleApprove() {
    if (!reviewing) return;

    // Only send what the admin actually changed — see the note above.
    const body: Record<string, unknown> = {};
    if (editName.trim() && editName.trim() !== (reviewing.trade_name ?? '')) {
      body.trade_name = editName.trim();
    }
    if (editNameAr.trim() && editNameAr.trim() !== (reviewing.trade_name_ar ?? '')) {
      body.trade_name_ar = editNameAr.trim();
    }
    if (editIngredient.trim() && editIngredient.trim() !== (reviewing.active_ingredient ?? '')) {
      body.active_ingredient = editIngredient.trim();
    }

    try {
      await approveMutation.run({ id: reviewing.id, body });
      toast.success(R.approved_msg);
      setReviewing(null);
      query.refetch();
    } catch {
      toast.error('تعذّر اعتماد الطلب، حاول مرة أخرى.');
    }
  }

  async function handleReject() {
    if (!rejecting) return;
    if (!rejectNotes.trim()) {
      toast.error(R.reject_notes_required);
      return;
    }

    try {
      await rejectMutation.run({ id: rejecting.id, notes: rejectNotes.trim() });
      toast.success(R.rejected_msg);
      setRejecting(null);
      setRejectNotes('');
      query.refetch();
    } catch {
      toast.error('تعذّر رفض الطلب، حاول مرة أخرى.');
    }
  }

  function statusBadge(requestStatus: string) {
    if (requestStatus === 'approved') return { variant: 'ok' as const, label: R.status_approved };
    if (requestStatus === 'rejected') return { variant: 'out' as const, label: R.status_rejected };
    return { variant: 'new' as const, label: R.status_pending };
  }

  return (
    <>
      <PageHeader title={R.title} subtitle={AR.admin.nav.medicine_requests} icon="fas fa-clipboard" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <div className="ph-stats-grid">
              <StatCard tone="orange" icon="fas fa-hourglass-half" value={num(stats?.pending)} label={R.status_pending} />
              <StatCard tone="green" icon="fas fa-circle-check" value={num(stats?.approved)} label={R.status_approved} />
              <StatCard tone="red" icon="fas fa-circle-xmark" value={num(stats?.rejected)} label={R.status_rejected} />
            </div>

            <Card
              headExtra={
                <div className="admin-filters">
                  <input
                    type="search"
                    className="admin-search"
                    placeholder={R.search_hint}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label={R.search_hint}
                  />
                  <div className="ph-pills">
                    {(['pending', 'approved', 'rejected'] as const).map((key) => (
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
                        {key === 'pending'
                          ? R.filter_pending
                          : key === 'approved'
                            ? R.filter_approved
                            : R.filter_rejected}
                      </button>
                    ))}
                  </div>
                </div>
              }
            >
              {rows.length === 0 ? (
                <div className="admin-empty">
                  <p>{R.empty}</p>
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={R.title}
                  columns={[
                    R.col_medicine,
                    R.col_pharmacy,
                    R.col_category,
                    R.col_date,
                    R.col_status,
                    '',
                  ]}
                >
                  {rows.map((row) => {
                    const badge = statusBadge(row.status);
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.trade_name_ar ?? row.trade_name ?? '—'}
                          {row.active_ingredient && (
                            <small className="admin-sub">{row.active_ingredient}</small>
                          )}
                        </td>
                        <td>{row.pharmacy?.pharmacy_name ?? '—'}</td>
                        <td>
                          {row.category?.name_ar ?? '—'}
                          {row.subcategory?.name_ar && (
                            <small className="admin-sub">{row.subcategory.name_ar}</small>
                          )}
                        </td>
                        <td>{formatDate(row.created_at)}</td>
                        <td>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="ac-actions">
                          {row.status === 'pending' ? (
                            <Btn size="xs" variant="primary" onClick={() => openReview(row)}>
                              {R.action_view}
                            </Btn>
                          ) : (
                            <span className="admin-muted">
                              {row.admin_notes ?? '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              )}

              {pagination && pagination.last_page > 1 && (
                <div className="admin-pagination">
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {AR.admin.common.previous}
                  </Btn>
                  <span>{info?.label}</span>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {AR.admin.common.next}
                  </Btn>
                </div>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>

      {/* Review / approve */}
      <Modal
        open={reviewing !== null}
        title={R.approve_title}
        onClose={() => setReviewing(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setReviewing(null)}>
              {AR.admin.common.cancel}
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                setRejecting(reviewing);
                setReviewing(null);
              }}
            >
              {R.reject}
            </Btn>
            <Btn variant="primary" onClick={handleApprove} disabled={approveMutation.isPending}>
              {R.approve}
            </Btn>
          </>
        }
      >
        {reviewing && (
          <>
            <dl className="admin-detail-list">
              <div>
                <dt>{R.col_pharmacy}</dt>
                <dd>{reviewing.pharmacy?.pharmacy_name ?? '—'}</dd>
              </div>
              <div>
                <dt>{R.col_category}</dt>
                <dd>{reviewing.category?.name_ar ?? '—'}</dd>
              </div>
              <div>
                <dt>{R.col_date}</dt>
                <dd>{formatDate(reviewing.created_at)}</dd>
              </div>
            </dl>

            <p className="admin-hint">
              عدّل الحقول إن لزم — الحقول غير المعدّلة تبقى كما وردت في الطلب.
            </p>

            <label className="admin-field">
              <span>الاسم (لاتيني)</span>
              <input
                type="text"
                dir="ltr"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>الاسم (عربي)</span>
              <input
                type="text"
                value={editNameAr}
                onChange={(e) => setEditNameAr(e.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>المادة الفعّالة</span>
              <input
                type="text"
                value={editIngredient}
                onChange={(e) => setEditIngredient(e.target.value)}
              />
            </label>

            {approveMutation.fieldErrors && (
              <ul className="admin-errors">
                {Object.entries(approveMutation.fieldErrors).flatMap(([field, messages]) =>
                  messages.map((message) => (
                    <li key={`${field}-${message}`}>{message}</li>
                  )),
                )}
              </ul>
            )}
          </>
        )}
      </Modal>

      {/* Reject */}
      <Modal
        open={rejecting !== null}
        title={R.reject_title}
        onClose={() => {
          setRejecting(null);
          setRejectNotes('');
        }}
        footer={
          <>
            <Btn
              variant="outline"
              onClick={() => {
                setRejecting(null);
                setRejectNotes('');
              }}
            >
              {AR.admin.common.cancel}
            </Btn>
            <Btn
              variant="danger"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectNotes.trim()}
            >
              {R.reject}
            </Btn>
          </>
        }
      >
        {rejecting && (
          <>
            <p>
              <strong>{rejecting.trade_name_ar ?? rejecting.trade_name}</strong>
            </p>
            <label className="admin-field">
              <span>{R.reject_notes_label}</span>
              <textarea
                rows={4}
                maxLength={2000}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                required
              />
            </label>
            {!rejectNotes.trim() && <p className="admin-hint">{R.reject_notes_required}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
