import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Modal } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money, statusBadgeClass } from '@/lib/format';
import type { ApiSale, ApiSalesStats } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Sales log — live against `GET /api/pharmacy/accounting/sales`.
 *
 * Port of `pharmacy/accounting/sales.blade.php`.
 *
 * Deliberate change from the mock version: **filtering is server-side.**
 *
 * The mock filtered `MOCK_SALES` in memory and re-derived the summary from the
 * visible rows. The real endpoint accepts the same four axes as query params
 * (`q`, `range`, `method`, `status`) and returns an authoritative `stats` block
 * computed over the WHOLE filtered set — not just the current page. Deriving the
 * summary client-side would therefore report only the visible page and quietly
 * understate the totals.
 *
 * Two contract details used here:
 *  - `method_label` / `status_label` are PRE-LOCALISED by the backend, so they
 *    are rendered verbatim (never re-derived from `AR.accounting.*`).
 *  - `items_count` is the line count; `items[]` is only present on the detail
 *    endpoint, so the list must not read `items.length`.
 *
 * `range` is passed through as-is; an unknown value is ignored by the server
 * (the same "silently all" semantics the Blade page documents).
 */

const A = AR.accounting;

const RANGES = ['all', 'today', '7d', '30d', 'month'] as const;
const METHODS = ['all', 'cash', 'card', 'bank_transfer', 'credit'] as const;
const STATUSES = ['all', 'paid', 'partially_paid', 'unpaid', 'refunded', 'cancelled'] as const;

type RangeKey = (typeof RANGES)[number];
type MethodKey = (typeof METHODS)[number];
type StatusKey = (typeof STATUSES)[number];

const RANGE_LABELS: Record<RangeKey, string> = {
  all: A.common.all,
  today: A.common.today,
  '7d': A.common.last_7_days,
  '30d': A.common.last_30_days,
  month: A.common.this_month,
};

const METHOD_LABELS: Record<MethodKey, string> = {
  all: A.common.all,
  cash: A.payment_methods.cash,
  card: A.payment_methods.card,
  bank_transfer: A.payment_methods.bank_transfer,
  credit: A.payment_methods.credit,
};

const STATUS_LABELS: Record<StatusKey, string> = {
  all: A.common.all,
  paid: A.statuses.paid,
  partially_paid: A.statuses.partially_paid,
  unpaid: A.statuses.unpaid,
  refunded: A.statuses.refunded,
  cancelled: A.statuses.cancelled,
};

const PER_PAGE = 25;

/** `all` must not be sent — the server treats an unknown value as "no filter". */
function filterValue(value: string): string | undefined {
  return value === 'all' ? undefined : value;
}

export function AccountingSalesPage() {
  const api = usePharmacyApi();

  const [q, setQ] = useState('');
  /** The committed search term — only this drives the request. */
  const [committedQ, setCommittedQ] = useState('');
  const [range, setRange] = useState<RangeKey>('all');
  const [method, setMethod] = useState<MethodKey>('all');
  const [status, setStatus] = useState<StatusKey>('all');
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);

  const hasFilters = committedQ !== '' || status !== 'all' || method !== 'all' || range !== 'all';

  const query = useApiQuery<{ data: ApiSale[]; stats: ApiSalesStats; pagination: { current_page: number; last_page: number; total: number } }>(
    (signal) =>
      api.sales(
        {
          per_page: PER_PAGE,
          page,
          ...(committedQ ? { q: committedQ } : {}),
          ...(filterValue(range) ? { range } : {}),
          ...(filterValue(method) ? { method } : {}),
          ...(filterValue(status) ? { status } : {}),
        },
        signal,
      ),
    [committedQ, range, method, status, page],
    { isEmpty: (r) => r.data.length === 0 },
  );

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const stats = query.data?.stats;
  const pagination = query.data?.pagination;

  function clearFilters() {
    setQ('');
    setCommittedQ('');
    setRange('all');
    setMethod('all');
    setStatus('all');
    setPage(1);
  }

  /** Any filter change resets to page 1, or the user lands on an empty page. */
  function applyFilter<T>(setter: (v: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setCommittedQ(q.trim());
    setPage(1);
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{A.sales.heading}</h1>
          <p>{A.sales.subtitle}</p>
        </div>
        <div className="ph-actions">
          <Link to={ROUTES.accountingSalesCreate} className="ph-btn primary">
            <i className="fas fa-plus" aria-hidden="true" /> {A.sales.new_sale}
          </Link>
        </div>
      </div>

      <form className="ac-filter-bar" role="search" onSubmit={submitSearch}>
        <div className="ac-filter-field ac-filter-grow">
          <label htmlFor="ac-q">{A.common.search}</label>
          <div className="ph-search">
            <i className="fas fa-search" aria-hidden="true" />
            <input
              type="search"
              id="ac-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={A.sales.search_placeholder}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="ac-filter-field">
          <label htmlFor="ac-range">{A.sales.date_range}</label>
          <select
            id="ac-range"
            className="ph-select"
            value={range}
            onChange={(e) => applyFilter(setRange)(e.target.value as RangeKey)}
          >
            {RANGES.map((k) => (
              <option key={k} value={k}>
                {RANGE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="ac-filter-field">
          <label htmlFor="ac-method">{A.sales.filter_payment}</label>
          <select
            id="ac-method"
            className="ph-select"
            value={method}
            onChange={(e) => applyFilter(setMethod)(e.target.value as MethodKey)}
          >
            {METHODS.map((k) => (
              <option key={k} value={k}>
                {METHOD_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="ac-filter-field">
          <label htmlFor="ac-status">{A.sales.filter_status}</label>
          <select
            id="ac-status"
            className="ph-select"
            value={status}
            onChange={(e) => applyFilter(setStatus)(e.target.value as StatusKey)}
          >
            {STATUSES.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="ac-filter-end">
          {hasFilters ? (
            <button type="button" className="ph-btn ghost sm" onClick={clearFilters}>
              <i className="fas fa-xmark" aria-hidden="true" /> {A.common.clear_filters}
            </button>
          ) : null}
        </div>
      </form>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={5}
      >
        <div className="ph-card">
          <div className="ph-card-head">
            <h2>
              <i className="fas fa-receipt" aria-hidden="true" /> {A.sales.heading}
            </h2>
            {/* Count comes from the server's filtered `stats`, not the page length. */}
            <p>{A.common.results_count.replace(':count', String(stats?.count ?? rows.length))}</p>
          </div>

          {rows.length === 0 ? (
            <div className="ph-card-body">
              {hasFilters ? (
                <div className="ph-empty">
                  <i className="fas fa-magnifying-glass" aria-hidden="true" />
                  <h3>{A.sales.no_results}</h3>
                  <p>{A.sales.no_results_desc}</p>
                </div>
              ) : (
                <div className="ph-empty">
                  <i className="fas fa-cash-register" aria-hidden="true" />
                  <h3>{A.sales.empty}</h3>
                  <p>{A.sales.empty_desc}</p>
                  <Link
                    to={ROUTES.accountingSalesCreate}
                    className="ph-btn primary"
                    style={{ marginBlockStart: 16 }}
                  >
                    <i className="fas fa-plus" aria-hidden="true" /> {A.sales.new_sale}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="ph-table-wrap">
                <table className="ph-table">
                  <caption className="ac-hidden">{A.sales.heading}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{A.sales.col_invoice}</th>
                      <th scope="col">{A.sales.col_date}</th>
                      <th scope="col">{A.sales.col_customer}</th>
                      <th scope="col">{A.sales.col_items}</th>
                      <th scope="col" className="ac-num">
                        {A.sales.col_subtotal}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.sales.col_discount}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.sales.col_total}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.sales.col_paid}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.sales.col_remaining}
                      </th>
                      <th scope="col">{A.sales.col_payment}</th>
                      <th scope="col">{A.sales.col_status}</th>
                      <th scope="col">{A.sales.col_actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((sale) => (
                      <tr key={sale.number}>
                        <td>
                          <Link
                            to={`${ROUTES.accountingSales}/${sale.number}`}
                            className="ac-strong"
                          >
                            {sale.number}
                          </Link>
                        </td>
                        <td>
                          <div className="ac-cell-stack">
                            <span>{sale.date_human ?? (sale.date ?? '').slice(0, 10)}</span>
                            <small className="ac-muted">{(sale.date ?? '').slice(11, 16)}</small>
                          </div>
                        </td>
                        <td>{sale.customer ?? <span className="ac-muted">{A.sales.walk_in}</span>}</td>
                        <td>
                          <span className="ac-muted">
                            {A.sales.items_count.replace(':count', String(sale.items_count))}
                          </span>
                        </td>
                        <td className="ac-num">{money(sale.subtotal)}</td>
                        <td className="ac-num">
                          {sale.discount > 0 ? (
                            <span className="ac-neg">−{money(sale.discount)}</span>
                          ) : (
                            <span className="ac-muted">—</span>
                          )}
                        </td>
                        <td className="ac-num ac-strong">{money(sale.total)}</td>
                        <td className="ac-num">{money(sale.paid)}</td>
                        <td className={`ac-num ${sale.remaining > 0 ? 'ac-neg ac-strong' : ''}`}>
                          {money(sale.remaining)}
                        </td>
                        <td>
                          {/* Pre-localised by the backend. */}
                          <span className="ac-muted">{sale.method_label}</span>
                        </td>
                        <td>
                          <span className={`ph-badge ${statusBadgeClass(sale.status)}`}>
                            {sale.status_label}
                          </span>
                        </td>
                        <td>
                          <div className="ac-row-actions">
                            <Link
                              to={`${ROUTES.accountingSales}/${sale.number}`}
                              className="ac-icon-btn"
                              title={A.common.view}
                              aria-label={`${A.common.view} — ${sale.number}`}
                            >
                              <i className="fas fa-eye" aria-hidden="true" />
                            </Link>
                            <Link
                              to={`${ROUTES.accountingSales}/${sale.number}?print=1`}
                              className="ac-icon-btn"
                              title={A.common.print}
                              aria-label={`${A.common.print} — ${sale.number}`}
                            >
                              <i className="fas fa-print" aria-hidden="true" />
                            </Link>
                            {/* Payment / refund are separate flows, not wired in this pass. */}
                            <button
                              type="button"
                              className="ac-icon-btn"
                              title={A.common.record_payment}
                              aria-label={`${A.common.record_payment} — ${sale.number}`}
                              disabled={sale.remaining <= 0}
                              onClick={() => setMsg(A.common.mock_notice)}
                            >
                              <i className="fas fa-money-bill-wave" aria-hidden="true" />
                            </button>
                            <Link
                              to={ROUTES.accountingRefundsCreate.replace(
                                ':saleNumber',
                                sale.number,
                              )}
                              className="ac-icon-btn"
                              title={A.common.refund}
                              aria-label={`${A.common.refund} — ${sale.number}`}
                            >
                              <i className="fas fa-rotate-left" aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="ac-table-summary">
                <span>
                  {A.common.total}: <b>{money(stats?.total ?? 0)}</b>
                </span>
                <span>
                  {A.common.paid}: <b>{money(stats?.paid ?? 0)}</b>
                </span>
                <span>
                  {A.common.remaining}:{' '}
                  <b className={(stats?.remaining ?? 0) > 0 ? 'ac-neg' : ''}>
                    {money(stats?.remaining ?? 0)}
                  </b>
                </span>
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
        </div>
      </AsyncBoundary>

      <Modal
        open={msg !== null}
        title={A.common.record_payment}
        onClose={() => setMsg(null)}
        footer={
          <button type="button" className="ph-btn primary" onClick={() => setMsg(null)}>
            {A.common.close}
          </button>
        }
      >
        <p className="ph-hint">{msg}</p>
      </Modal>
    </div>
  );
}
