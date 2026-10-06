import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import type { ApiRefundRow, RefundStatus } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Refunds log — live against `GET /api/pharmacy/accounting/refunds`.
 *
 * Port of `pharmacy/accounting/refunds/index.blade.php`.
 *
 * Filtering is server-side (`q`, `status`), matching the Blade page, which also
 * filters server-side — and matching the API controller's documented
 * "unknown value ⇒ silently all" semantics.
 *
 * Contract details:
 *  - the sale number lives at `refund.sale.number` (the row carries a nested
 *    `sale` ref, not a flat `sale_number`);
 *  - `created_by` is NOT on the list row — only on the detail payload — so that
 *    column renders a dash here rather than inventing a value.
 */

const A = AR.accounting;

const STATUSES = ['all', 'completed', 'pending', 'cancelled'] as const;
type StatusKey = (typeof STATUSES)[number];

const STATUS_LABELS: Record<StatusKey, string> = {
  all: A.common.all,
  completed: A.refunds.status.completed,
  pending: A.refunds.status.pending,
  cancelled: A.refunds.status.cancelled,
};

/** Blade maps status → badge modifier. */
function badgeClass(status: RefundStatus): string {
  switch (status) {
    case 'completed':
      return 'refunded';
    case 'cancelled':
      return 'closed';
    default:
      return 'pending';
  }
}

const PER_PAGE = 25;

export function AccountingRefundsPage() {
  const api = usePharmacyApi();

  const [q, setQ] = useState('');
  /** The committed search term — only this drives the request. */
  const [committedQ, setCommittedQ] = useState('');
  const [status, setStatus] = useState<StatusKey>('all');
  const [page, setPage] = useState(1);

  const query = useApiQuery<{
    data: ApiRefundRow[];
    pagination: { current_page: number; last_page: number; total: number };
  }>(
    (signal) =>
      api.refunds(
        {
          per_page: PER_PAGE,
          page,
          ...(committedQ ? { q: committedQ } : {}),
          ...(status !== 'all' ? { status } : {}),
        },
        signal,
      ),
    [committedQ, status, page],
    { isEmpty: (r) => r.data.length === 0 },
  );

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const pagination = query.data?.pagination;

  const hasFilters = committedQ !== '' || status !== 'all';

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setCommittedQ(q.trim());
    setPage(1);
  }

  function changeStatus(value: StatusKey) {
    setStatus(value);
    setPage(1);
  }

  return (
    <div className="ph-page">
      <div className="ph-page-title">
        <h1>{A.refunds.title}</h1>
        <p className="subtitle">{A.refunds.subtitle}</p>
      </div>

      <div className="ph-filters ac-filters">
        <form onSubmit={submitSearch}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={A.common.search}
            className="ph-input"
            aria-label={A.common.search}
          />

          <select
            value={status}
            onChange={(e) => changeStatus(e.target.value as StatusKey)}
            aria-label={A.common.status}
          >
            {STATUSES.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k]}
              </option>
            ))}
          </select>

          <button type="submit" className="ph-btn outline">
            {A.common.search}
          </button>

          {hasFilters ? (
            <button
              type="button"
              className="ph-btn"
              onClick={() => {
                setQ('');
                setCommittedQ('');
                setStatus('all');
                setPage(1);
              }}
            >
              {A.common.clear_filters}
            </button>
          ) : null}
        </form>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={5}
      >
        {rows.length === 0 ? (
          <div className="ph-empty">
            <i className="fas fa-rotate-left" aria-hidden="true" />
            <h3>{A.refunds.empty}</h3>
            <p>{A.refunds.empty_desc}</p>
          </div>
        ) : (
          <>
            {/*
              🔴 إصلاح React: Blade يرسم هذا الجدول عاريًا (`<table class="ph-table">`)
              بلا غلاف تمرير — وهو خلل كامن يظهر عند ضيق المساحة (768px). `ph-table-wrap`
              هو الغلاف المعياري في Blade نفسه (مستخدَم في sales/overview).
            */}
            <div className="ph-table-wrap">
              <table className="ph-table">
                <caption className="ac-hidden">{A.refunds.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{A.refunds.col_refund_id}</th>
                    <th scope="col">{A.refunds.col_sale}</th>
                    <th scope="col">{A.refunds.col_date}</th>
                    <th scope="col">{A.refunds.col_amount}</th>
                    <th scope="col">{A.refunds.col_status}</th>
                    <th scope="col">{A.refunds.col_reason}</th>
                    <th scope="col">{A.refunds.col_created_by}</th>
                    <th scope="col" className="ac-actions">
                      {A.common.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((refund) => (
                    <tr key={refund.id}>
                      <td>#{refund.id}</td>
                      <td>
                        {refund.sale?.number ? (
                          <Link to={`${ROUTES.accountingSales}/${refund.sale.number}`}>
                            {refund.sale.number}
                          </Link>
                        ) : (
                          <span className="ac-muted">—</span>
                        )}
                      </td>
                      <td>{refund.refunded_at ?? '—'}</td>
                      <td className="ac-num">{money(refund.amount)}</td>
                      <td>
                        <span className={`ph-badge ${badgeClass(refund.status)}`}>
                          {A.refunds.status[refund.status]}
                        </span>
                      </td>
                      <td className="ac-muted">
                        {refund.reason ? refund.reason.slice(0, 50) : '—'}
                      </td>
                      {/* The list payload has no `created_by`; only the detail does. */}
                      <td className="ac-muted">—</td>
                      <td className="ac-actions">
                        <Link
                          to={`${ROUTES.accountingRefunds}/${refund.id}`}
                          className="ph-link"
                          title={A.common.view}
                          aria-label={`${A.common.view} — #${refund.id}`}
                        >
                          <i className="far fa-eye" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {(pagination?.last_page ?? 1) > 1 && (
              <div
                className="ac-pagination"
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                }}
              >
                <button
                  type="button"
                  className="ph-btn ghost sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <i className="fas fa-chevron-right" aria-hidden="true" /> {A.common.previous}
                </button>
                <span className="ac-muted">
                  {page} / {pagination?.last_page}
                </span>
                <button
                  type="button"
                  className="ph-btn ghost sm"
                  disabled={page >= (pagination?.last_page ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {A.common.next} <i className="fas fa-chevron-left" aria-hidden="true" />
                </button>
              </div>
            )}
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
