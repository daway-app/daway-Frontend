import { useEffect, useMemo, useState } from 'react';
import { AsyncBoundary, Notice } from '@/components/ui';
import { AR } from '@/lib/i18n';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { formatDate, formatTime } from '@/lib/format';
import { markInquiriesSeen } from '@/lib/pushPermission';
import type { ApiInquiry, ApiInquiryCounts, ApiInquiryStatus } from '@/api/pharmacyTypes';

/**
 * Pharmacy inquiries index — live against `GET /api/pharmacy/inquiries`.
 *
 * Structure still mirrors `resources/views/pharmacy/inquiries/index.blade.php`
 * 1:1 (same wrappers, same `.ph-*` classes).
 *
 * Behaviour change from the mock version: the row actions now PERSIST via
 * `PUT /api/pharmacy/inquiries/{id}` instead of mutating local state. The status
 * tabs remain client-side — the API paginates rather than filtering, so
 * filtering the loaded page keeps the visible rows consistent with the counts
 * the server returned for that page.
 */
const I = AR.pharmacy.inquiries;

type Tab = 'all' | ApiInquiryStatus;

const STATUS_TEXT: Record<ApiInquiryStatus, string> = {
  new: I.status_new,
  answered: I.status_answered,
  closed: I.status_closed,
};

/** Blade maps status → badge modifier class. */
const BADGE_CLASS: Record<ApiInquiryStatus, string> = {
  new: 'new',
  answered: 'ans',
  closed: 'closed',
};

export function InquiriesPage() {
  const api = usePharmacyApi();

  const [status, setStatus] = useState<Tab>('all');
  const [q, setQ] = useState('');
  /** Statuses changed in this session, applied over the fetched rows. */
  const [overrides, setOverrides] = useState<Record<number, ApiInquiryStatus>>({});
  /**
   * A status change that the server rejected.
   *
   * The update is optimistic, so on failure the badge silently flips back to
   * its old value. Without this, the user sees a control that "did nothing"
   * and reads it as a broken button — the revert needs an explanation.
   */
  const [statusError, setStatusError] = useState<string | null>(null);
  /** Confirmation of the last successful status change. */
  const [notice, setNotice] = useState<string | null>(null);

  // Visiting the inquiries screen is the push-banner usage signal — a new
  // inquiry is exactly what a push would announce (see lib/pushPermission.ts).
  useEffect(() => {
    markInquiriesSeen();
  }, []);

  const query = useApiQuery<{ data: ApiInquiry[]; counts: ApiInquiryCounts }>(
    (signal) => api.inquiries({ per_page: 50 }, signal),
    [],
    { isEmpty: (r) => r.data.length === 0 },
  );

  const update = useApiMutation((id: number, next: ApiInquiryStatus) =>
    api.updateInquiry(id, { status: next }),
  );

  const rows = useMemo(() => {
    const raw = query.data?.data ?? [];
    return raw.map((r) => ({ ...r, status: overrides[r.id] ?? r.status }));
  }, [query.data, overrides]);

  const counts = useMemo(() => {
    const base: ApiInquiryCounts = { new: 0, answered: 0, closed: 0 };
    for (const r of rows) base[r.status] += 1;
    return base;
  }, [rows]);

  const hasFilters = q !== '' || status !== 'all';

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (needle === '') return true;
      return (
        (r.user?.name ?? '').toLowerCase().includes(needle) ||
        (r.medicine?.trade_name ?? '').toLowerCase().includes(needle) ||
        (r.message ?? '').toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status]);

  async function setRowStatus(id: number, next: ApiInquiryStatus) {
    // Optimistic: the row flips immediately, then the server confirms.
    setOverrides((prev) => ({ ...prev, [id]: next }));
    setNotice(null);
    setStatusError(null);
    try {
      await update.run(id, next);
      // Confirm the write — this screen used to change a status silently.
      setNotice(I.status_saved.replace(':status', STATUS_TEXT[next]));
    } catch {
      // Revert on failure so the UI never claims a change that did not happen.
      setOverrides((prev) => {
        const next2 = { ...prev };
        delete next2[id];
        return next2;
      });
      // …and SAY so. Without this the badge silently flips back and the user
      // reads the control as a broken button. (This state existed but was never
      // wired — the comment above it described an intent nothing implemented.)
      setStatusError(I.status_failed);
    }
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{I.heading}</h1>
          <p>{I.subtitle}</p>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        <div className="ph-stats">
          <div className="ph-stat">
            <i className="fas fa-lock gray" />
            <div>
              <strong>{counts.closed}</strong>
              <span>{I.stat_closed}</span>
            </div>
          </div>
          <div className="ph-stat">
            <i className="fas fa-comment-dots blue" />
            <div>
              <strong>{counts.answered}</strong>
              <span>{I.stat_answered}</span>
            </div>
          </div>
          <div className="ph-stat">
            <i className="fas fa-envelope green" />
            <div>
              <strong>{counts.new}</strong>
              <span>{I.stat_new}</span>
            </div>
          </div>
        </div>

        <form className="ph-filters" onSubmit={(e) => e.preventDefault()}>
          <div className="ph-tabs">
            {(['all', 'closed', 'answered', 'new'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`ph-tab ${status === t ? 'active' : ''}`}
                onClick={() => setStatus(t)}
              >
                {t === 'all'
                  ? I.filter_all
                  : t === 'closed'
                    ? I.filter_closed
                    : t === 'answered'
                      ? I.filter_answered
                      : I.filter_new}
              </button>
            ))}
          </div>
          <div className="ph-search">
            <i className="fas fa-search" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={I.search_placeholder}
              autoComplete="off"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => {
                setQ('');
                setStatus('all');
              }}
            >
              <i className="fas fa-xmark" /> {AR.pharmacy.inventory.clear_filters}
            </button>
          )}
        </form>

        {notice && (
          <div style={{ marginBlockEnd: 16 }}>
            <Notice tone="success">{notice}</Notice>
          </div>
        )}

        {statusError && (
          <div style={{ marginBlockEnd: 16 }}>
            <Notice tone="warning">{statusError}</Notice>
          </div>
        )}

        {update.error && (
          <div className="ph-error" style={{ marginBlockEnd: 16 }} role="alert">
            <p>{update.error.message}</p>
          </div>
        )}

        <div className="ph-card ph-inquiry-table">
          <div className="ph-card-body ph-table-wrap" style={{ padding: 0 }}>
            <table className="ph-table">
              <thead>
                <tr>
                  <th>{I.col_patient}</th>
                  <th>{I.col_medicine}</th>
                  <th>{I.col_inquiry}</th>
                  <th>{I.col_date}</th>
                  <th>{I.col_status}</th>
                  <th>{I.col_action}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length > 0 ? (
                  visible.map((r) => {
                    const patientName = r.user?.name ?? '';
                    const initials = patientName.slice(0, 2);
                    return (
                      <tr key={r.id} data-status={r.status}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="ph-avatar-sm">{initials}</span>
                            <strong>{patientName}</strong>
                            {(r.unread_messages_count ?? 0) > 0 && (
                              <span className="ph-badge new">{r.unread_messages_count}</span>
                            )}
                          </div>
                        </td>
                        <td>{r.medicine?.trade_name ?? '—'}</td>
                        <td style={{ maxWidth: 280 }}>{r.message}</td>
                        <td>
                          {formatDate(r.created_at)}
                          <br />
                          <small style={{ color: 'var(--ph-ink-faint)' }}>
                            {formatTime(r.created_at)}
                          </small>
                        </td>
                        <td>
                          <span className={`ph-badge ${BADGE_CLASS[r.status]}`}>
                            {STATUS_TEXT[r.status]}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <a
                              href={`/inquiries/${r.id}/chat`}
                              className="ph-btn sm"
                              style={{
                                background: 'var(--ph-teal-mist)',
                                color: 'var(--ph-teal-text)',
                                borderColor: 'var(--ph-teal-mist)',
                              }}
                            >
                              <i className="fas fa-comment" /> {I.open_chat}
                            </a>
                            {r.status === 'new' && (
                              <>
                                <button
                                  type="button"
                                  className="ph-btn sm primary"
                                  disabled={update.isPending}
                                  onClick={() => void setRowStatus(r.id, 'answered')}
                                >
                                  {I.answer_button}
                                </button>
                                <button
                                  type="button"
                                  className="ph-btn sm ghost"
                                  disabled={update.isPending}
                                  onClick={() => void setRowStatus(r.id, 'closed')}
                                >
                                  {I.close_button}
                                </button>
                              </>
                            )}
                            {r.status === 'answered' && (
                              <button
                                type="button"
                                className="ph-btn sm ghost"
                                disabled={update.isPending}
                                onClick={() => void setRowStatus(r.id, 'closed')}
                              >
                                {I.close_button}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="ph-empty">
                        <i className="fas fa-inbox" />
                        <h3>{I.empty}</h3>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
