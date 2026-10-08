import { useMemo, useState } from 'react';
import { AR, labelOf } from '@/lib/i18n';
import { AsyncBoundary, Btn, EmptyState } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import type { ApiCashMovement, ApiCashStats } from '@/api/pharmacyTypes';

/**
 * Cash register — live against `GET /api/pharmacy/accounting/cash`.
 *
 * Port of `pharmacy/accounting/cash/index.blade.php`.
 *
 * The balance is read from the server's `stats.balance_now`, which is computed
 * from the ledger — it can never disagree with the table, matching Blade's own
 * stated intent («الرصيد الحقيقي — لا رقم مكتوب يدويًا»).
 *
 * ✅ This wiring also REMOVES a Blade defect that the mock version had to
 * document: the Blade page paginates BEFORE applying its filters, so the table
 * showed unfiltered rows. Filtering now happens in SQL (`source_type`,
 * `direction` are query params), i.e. before pagination — which is what the
 * filter bar always promised. The divergence note is therefore obsolete.
 *
 * `source_type` is a raw machine key; the label comes from
 * `AR.accounting.cash_registers.types` via `labelOf` (which falls back to the
 * key, so a new backend enum value shows a readable token instead of blank).
 */

const A = AR.accounting;

const DIRECTIONS = ['all', 'in', 'out'] as const;
type DirectionKey = (typeof DIRECTIONS)[number];

const DIRECTION_LABELS: Record<DirectionKey, string> = {
  all: A.common.all,
  in: A.cash_registers.incoming,
  out: A.cash_registers.outgoing,
};

/**
 * The filter options the backend understands.
 *
 * Mirrors the keys of `AR.accounting.cash_registers.types` (and the
 * `source_type` values written by `AccountingLedger`).
 */
const SOURCE_TYPES = [
  'sale',
  'purchase',
  'expense',
  'customer_payment',
  'supplier_payment',
  'withdrawal',
  'deposit',
  'adjustment',
  'refund',
] as const;

const PER_PAGE = 25;

export function AccountingCashPage() {
  const api = usePharmacyApi();

  const [sourceType, setSourceType] = useState<string>('all');
  const [direction, setDirection] = useState<DirectionKey>('all');
  const [page, setPage] = useState(1);

  const query = useApiQuery<{
    data: ApiCashMovement[];
    stats: ApiCashStats;
    period: { from: string; to: string };
    pagination: { current_page: number; last_page: number; total: number };
  }>(
    (signal) =>
      api.cash(
        {
          per_page: PER_PAGE,
          page,
          ...(sourceType !== 'all' ? { source_type: sourceType } : {}),
          ...(direction !== 'all' ? { direction } : {}),
        },
        signal,
      ),
    [sourceType, direction, page],
    { isEmpty: (r) => r.data.length === 0 },
  );

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const stats = query.data?.stats;
  const pagination = query.data?.pagination;

  const hasFilters = sourceType !== 'all' || direction !== 'all';

  /** Any filter change resets to page 1, or the user lands on an empty page. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  return (
    <div className="ph-page">
      <div className="ph-page-title">
        <h1>{A.cash_registers.title}</h1>
        <p className="subtitle">{A.cash_registers.subtitle}</p>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={5}
      >
        <div className="ph-card ac-balance-card">
          <span className="label">{A.cash_registers.balance_now}</span>
          <span className="value ac-num">{money(stats?.balance_now ?? 0)}</span>
          {stats?.is_low && (
            <span className="ph-badge out" style={{ marginInlineStart: 12 }}>
              <i className="fas fa-triangle-exclamation" aria-hidden="true" />{' '}
              {A.overview.alert_low_cash}
            </span>
          )}
        </div>

        <div className="ph-filters ac-filters">
          <form onSubmit={(e) => e.preventDefault()}>
            <select
              value={sourceType}
              onChange={(e) => changeFilter(() => setSourceType(e.target.value))}
              aria-label={A.common.type}
            >
              <option value="all">{A.common.all}</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {A.cash_registers.types[s]}
                </option>
              ))}
            </select>

            <select
              value={direction}
              onChange={(e) => changeFilter(() => setDirection(e.target.value as DirectionKey))}
              aria-label={A.common.direction}
            >
              {DIRECTIONS.map((k) => (
                <option key={k} value={k}>
                  {DIRECTION_LABELS[k]}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="ph-btn outline"
              disabled={query.isRefetching}
              onClick={() => query.refetch()}
            >
              {A.common.apply}
            </button>

            {hasFilters ? (
              <button
                type="button"
                className="ph-btn"
                onClick={() =>
                  changeFilter(() => {
                    setSourceType('all');
                    setDirection('all');
                  })
                }
              >
                {A.common.clear_filters}
              </button>
            ) : null}
          </form>
        </div>

        {rows.length === 0 ? (
          /*
            An empty cash register is filled by sales, so the one action that
            resolves it is "new sale" — a real next step, not decoration.
            (Phase 2 — item A. Reuses the existing `new_sale` label.)
          */
          <EmptyState
            icon="fas fa-wallet"
            title={A.cash_registers.empty}
            description={A.cash_registers.empty_desc}
            action={
              <Btn variant="primary" to={ROUTES.accountingSalesCreate}>
                <i className="fas fa-plus" /> {A.sales.new_sale}
              </Btn>
            }
          />
        ) : (
          <>
            {/* 🔴 إصلاح React: غلاف تمرير أفقي (Blade يرسم الجدول عاريًا). */}
            <div className="ph-table-wrap">
              <table className="ph-table">
                <caption className="ac-hidden">{A.cash_registers.title}</caption>
                <thead>
                  <tr>
                    <th scope="col">{A.common.date}</th>
                    <th scope="col">{A.payment_types.type}</th>
                    <th scope="col">{A.common.direction}</th>
                    <th scope="col">{A.common.amount}</th>
                    <th scope="col">{A.common.description}</th>
                    <th scope="col">{A.common.user}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td>{m.date_human ?? m.date ?? '—'}</td>
                      <td>{labelOf(A.cash_registers.types, m.source_type)}</td>
                      <td>
                        <span
                          className={`ph-badge ${m.direction === 'in' ? 'income' : 'expense'}`}
                        >
                          {A.cash_registers.direction[m.direction]}
                        </span>
                      </td>
                      {/* `signed_amount` carries the sign; `amount` is the magnitude. */}
                      <td className={`ac-num ${m.signed_amount < 0 ? 'ac-neg' : ''}`}>
                        {m.signed_amount < 0 ? '−' : ''}
                        {money(Math.abs(m.amount))}
                      </td>
                      <td className="ac-muted">{m.description ?? m.reason ?? '—'}</td>
                      <td className="ac-muted">{m.created_by ?? '—'}</td>
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
