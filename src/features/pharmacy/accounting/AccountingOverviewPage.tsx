import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AR, labelOf } from '@/lib/i18n';
import { Chart } from '@/components/ui/Chart';
import { AsyncBoundary } from '@/components/ui';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money, num, statusBadgeClass } from '@/lib/format';
import { toAppRoute } from '@/lib/appRoute';
import type { AccountingRange, ApiAccountingOverview } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Accounting overview — live against `GET /api/pharmacy/accounting/overview`.
 *
 * Port of `pharmacy/accounting/overview.blade.php`.
 *
 * Three contract details that shape this component:
 *
 *  1. **KPI labels are pre-localised by the backend** (`__()`), so they are
 *     rendered verbatim — never re-derived from `AR.accounting.*`. Only the
 *     `value` needs formatting, and `format` says which: `money` or `int`.
 *
 *  2. **`range` drives the CHART only.** The controller documents it: «range
 *     تتحكم في سلاسل الرسم. البطاقات دائمًا "اليوم"». And `series` returns all
 *     four ranges in a single payload — so switching the chart range is
 *     client-side and must NOT refetch. That also matches the Blade behaviour
 *     (it swaps datasets in JS). Refetching would cost a slow round-trip to the
 *     remote DB for a pure chart redraw.
 *
 *  3. **`href` fields are ABSOLUTE Blade URLs** (`http://host/pharmacy/...`).
 *     They are mapped through `toAppRoute()` before use; rendering one verbatim
 *     in a `<Link>` would navigate the user out of the SPA.
 */

const A = AR.accounting;
const RANGE_KEYS: readonly AccountingRange[] = ['today', '7d', '30d', 'month'] as const;

/** Blade `$expenseChartColors` — CSS custom-property names, resolved by the browser. */
const EXPENSE_COLORS = [
  '--info',
  '--teal-primary',
  '--warning',
  '--success',
  '--danger',
  '--teal-light',
  '--ink-faint',
];

const RANGE_LABELS: Record<AccountingRange, string> = {
  today: A.common.today,
  '7d': A.common.last_7_days,
  '30d': A.common.last_30_days,
  month: A.common.this_month,
};

export function AccountingOverviewPage() {
  const api = usePharmacyApi();
  const { user } = useAuth();

  const [chartRange, setChartRange] = useState<AccountingRange>('7d');

  // One fetch. `range` here only tells the server which series it considers
  // "active"; we already receive all four, so the tabs never refetch.
  const query = useApiQuery<ApiAccountingOverview>(
    (signal) => api.accountingOverview('7d', signal),
    [],
    { isEmpty: () => false },
  );

  const data = query.data;

  /** `series` always carries every range; fall back to an empty chart. */
  const series = data?.series?.[chartRange] ?? { labels: [], data: [] };
  const expenses = useMemo(() => data?.expense_breakdown ?? [], [data]);
  const transactions = useMemo(() => data?.recent_transactions ?? [], [data]);
  const alerts = useMemo(() => data?.alerts ?? [], [data]);

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{A.overview.heading}</h1>
          <p>{A.overview.subtitle.replace(':pharmacy', user?.name ?? '')}</p>
        </div>
        <div className="ph-actions">
          <Link to={ROUTES.accountingSalesCreate} className="ph-btn primary">
            <i className="fas fa-cash-register" aria-hidden="true" /> {A.overview.new_sale}
          </Link>
          <Link to={ROUTES.accountingSales} className="ph-btn outline">
            <i className="fas fa-receipt" aria-hidden="true" /> {A.sidebar.sales}
          </Link>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        <div className="ac-kpi-grid">
          {(data?.kpis ?? []).map((kpi) => {
            const route = toAppRoute(kpi.href);
            const display = kpi.format === 'money' ? money(kpi.value) : num(kpi.value);
            const body = (
              <>
                <span className={`ac-kpi-icon ${kpi.tone}`}>
                  <i className={kpi.icon} aria-hidden="true" />
                </span>
                <span className="ac-kpi-body">
                  <span className="ac-kpi-value">{display}</span>
                  {/* Pre-localised by the backend — render verbatim. */}
                  <span className="ac-kpi-label">{kpi.label}</span>
                </span>
                {route ? (
                  <i className="fas fa-chevron-left ac-kpi-caret" aria-hidden="true" />
                ) : null}
              </>
            );

            return route ? (
              <Link key={kpi.key} to={route} className="ac-kpi">
                {body}
              </Link>
            ) : (
              <div key={kpi.key} className="ac-kpi">
                {body}
              </div>
            );
          })}
        </div>

        <div className="ac-grid ac-grid-2" style={{ marginBlockEnd: 20 }}>
          <div className="ph-card">
            <div className="ph-card-head">
              <h2>
                <i className="fas fa-chart-line" aria-hidden="true" /> {A.overview.chart_sales_title}
              </h2>
              <p>{A.overview.chart_sales_desc}</p>
              <div className="ac-range-tabs" role="group" aria-label={A.overview.chart_sales_title}>
                {RANGE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`ac-range-tab ${key === chartRange ? 'active' : ''}`}
                    aria-pressed={key === chartRange}
                    onClick={() => setChartRange(key)}
                  >
                    {RANGE_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
            <div className="ph-card-body">
              <div className="ac-chart-box">
                <Chart
                  key={chartRange}
                  kind="line"
                  labels={series.labels}
                  data={series.data}
                />
              </div>
            </div>
          </div>

          <div className="ph-card">
            <div className="ph-card-head">
              <h2>
                <i className="fas fa-chart-pie" aria-hidden="true" />{' '}
                {A.overview.chart_expenses_title}
              </h2>
              <p>{A.overview.chart_expenses_desc}</p>
            </div>
            <div className="ph-card-body">
              {expenses.length === 0 ? (
                <div className="ph-empty">
                  <i className="fas fa-chart-pie" aria-hidden="true" />
                  <h3>{A.overview.no_expenses}</h3>
                </div>
              ) : (
                <>
                  <div className="ac-chart-box" style={{ height: 220 }}>
                    <Chart
                      kind="donut"
                      labels={expenses.map((r) => r.label)}
                      data={expenses.map((r) => r.amount)}
                      colors={EXPENSE_COLORS}
                    />
                  </div>

                  {/* Blade keeps a textual table next to the chart for WCAG 1.1.1. */}
                  <div className="ac-breakdown" style={{ marginBlockStart: 20 }}>
                    {expenses.map((row, index) => {
                      const tone = EXPENSE_COLORS[index % EXPENSE_COLORS.length];
                      return (
                        <div className="ac-breakdown-row" key={row.category || row.label}>
                          <div className="ac-breakdown-top">
                            <span
                              className="dot"
                              style={{ background: `var(${tone})` }}
                              aria-hidden="true"
                            />
                            <span className="name">{row.label}</span>
                            <span className="amount">{money(row.amount)}</span>
                            <span className="pct">{row.percentage}%</span>
                          </div>
                          <div className="ac-bar" aria-hidden="true">
                            <span
                              style={{ width: `${row.percentage}%`, background: `var(${tone})` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="ac-grid ac-grid-2">
          <div className="ph-card">
            <div className="ph-card-head">
              <h2>
                <i className="fas fa-clock-rotate-left" aria-hidden="true" />{' '}
                {A.overview.recent_transactions}
              </h2>
              <p>{A.overview.recent_transactions_desc}</p>
            </div>
            <div className="ph-card-body ph-table-wrap" style={{ padding: 0 }}>
              {transactions.length === 0 ? (
                <div className="ph-empty">
                  <i className="fas fa-inbox" aria-hidden="true" />
                  <h3>{A.overview.no_transactions}</h3>
                  <p>{A.overview.no_transactions_desc}</p>
                </div>
              ) : (
                <table className="ph-table">
                  <caption className="ac-hidden">{A.overview.recent_transactions}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{A.common.date}</th>
                      <th scope="col">{A.common.type}</th>
                      <th scope="col">{A.common.reference}</th>
                      <th scope="col">{A.common.description}</th>
                      <th scope="col" className="ac-num">
                        {A.common.amount}
                      </th>
                      <th scope="col">{A.common.payment_method}</th>
                      <th scope="col">{A.common.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx, i) => (
                      <tr key={`${tx.reference}-${tx.date}-${i}`}>
                        <td>
                          <div className="ac-cell-stack">
                            <span>{(tx.date ?? '').replace('T', ' ').slice(0, 16) || '—'}</span>
                          </div>
                        </td>
                        <td>
                          {/* `type` is a raw key, not pre-localised. */}
                          <span className="ac-muted">
                            {labelOf(A.payment_types, tx.type)}
                          </span>
                        </td>
                        <td>
                          <span className="ac-mono">{tx.reference}</span>
                        </td>
                        <td>{tx.description}</td>
                        <td className={`ac-num ${tx.amount < 0 ? 'ac-neg' : 'ac-pos'}`}>
                          {tx.amount < 0 ? '−' : ''}
                          {money(Math.abs(tx.amount))}
                        </td>
                        <td>
                          <span className="ac-muted">
                            {labelOf(A.payment_methods, tx.method)}
                          </span>
                        </td>
                        <td>
                          {tx.status ? (
                            <span className={`ph-badge ${statusBadgeClass(tx.status)}`}>
                              {labelOf(A.statuses, tx.status)}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="ph-card">
            <div className="ph-card-head">
              <h2>
                <i className="fas fa-bell" aria-hidden="true" /> {A.overview.alerts_title}
              </h2>
              <p>{A.overview.alerts_desc}</p>
            </div>
            <div className="ph-card-body">
              {alerts.length === 0 ? (
                <div className="ph-empty">
                  <i className="fas fa-circle-check" aria-hidden="true" />
                  <h3>{A.overview.no_alerts}</h3>
                  <p>{A.overview.no_alerts_desc}</p>
                </div>
              ) : (
                alerts.map((alert, i) => {
                  const route = toAppRoute(alert.href);
                  const inner = (
                    <>
                      <i className={alert.icon} aria-hidden="true" />
                      <div>
                        {/* title + description are pre-localised. */}
                        <div className="ac-alert-title">{alert.title}</div>
                        <div className="ac-alert-desc">{alert.description}</div>
                      </div>
                    </>
                  );
                  return route ? (
                    <Link className={`ac-alert ${alert.severity}`} key={`${alert.title}-${i}`} to={route}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={`ac-alert ${alert.severity}`} key={`${alert.title}-${i}`}>
                      {inner}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
