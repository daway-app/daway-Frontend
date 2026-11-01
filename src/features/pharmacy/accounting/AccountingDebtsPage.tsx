import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/lang/useLang';
import { AsyncBoundary } from '@/components/ui';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money, num } from '@/lib/format';
import type { ApiCustomersList } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Outstanding customer debts — the screen behind the overview's
 * «ديون مستحقة» KPI.
 *
 * WHY THIS IS A THIN SCREEN, NOT A NEW ENDPOINT
 * `GET /api/pharmacy/accounting/customers` already accepts `only_debtors=1` and
 * returns exactly what this page needs: the filtered rows sorted by
 * `current_balance DESC`, plus a `stats` block carrying `total_debt` and
 * `debtors_count`. Building a parallel "debts" endpoint would duplicate the
 * receivables definition — the number in the KPI and the number at the top of
 * this page must come from ONE source or they will eventually disagree.
 *
 * `total_debt` is deliberately read from the server rather than summed from the
 * visible rows: the list is paged, so a client-side sum would silently
 * under-report as soon as a pharmacy has more debtors than `PER_PAGE`.
 *
 * WHY THE TABLE IS WRAPPED IN `.ph-card`
 * `.ph-table-wrap` only supplies `overflow-x: auto` — it draws no border. The
 * app's framed-table pattern is `.ph-card > .ph-table-wrap`, which also picks
 * up `padding: 0 22px 22px` from `pharmacy-accounting.css`. A bare
 * `.ph-table-wrap` therefore renders a table floating on the page with no
 * frame, which is what this screen looked like before.
 */

const PER_PAGE = 50;

export function AccountingDebtsPage() {
  const { STR } = useLang();
  const A = STR.accounting;
  const D = A.debts;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();

  const params = { only_debtors: 1, per_page: PER_PAGE };

  const query = useApiQuery<ApiCustomersList>(
    (signal) => api.customers(params, signal),
    [],
    { queryKey: keys.debtors(params), isEmpty: (r) => r.data.length === 0 },
  );

  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const stats = query.data?.stats;

  return (
    <div className="ph-page">
      <div className="ph-page-title">
        <h1>{D.title}</h1>
        <p className="subtitle">{D.subtitle}</p>
      </div>

      <div style={{ marginBlockEnd: 16 }}>
        <Link to={ROUTES.accounting} className="ph-btn outline sm">
          <i className="fas fa-arrow-right" aria-hidden="true" /> {A.common.back}
        </Link>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        <>
          <div className="ph-card">
            <div className="ph-grid">
              <div className="ph-grid-item">
                <span className="label">{D.total_debt}</span>
                <span className="value ac-strong">{money(stats?.total_debt ?? 0)}</span>
              </div>
              <div className="ph-grid-item">
                <span className="label">{D.debtors_count}</span>
                <span className="value">{num(stats?.debtors_count ?? 0)}</span>
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="ph-card">
              <div className="ph-empty">
                <i className="fas fa-hand-holding-dollar" aria-hidden="true" />
                <h3>{D.empty}</h3>
                <p>{D.empty_desc}</p>
              </div>
            </div>
          ) : (
            <div className="ph-card">
              <div className="ph-table-wrap">
                <table className="ph-table">
                  <caption className="ac-hidden">{D.title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{D.col_customer}</th>
                      <th scope="col">{D.col_phone}</th>
                      <th scope="col" className="ac-num">
                        {D.col_balance}
                      </th>
                      <th scope="col" className="ac-num">
                        {D.col_limit}
                      </th>
                      <th scope="col">{D.col_flag}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((customer) => (
                      <tr key={customer.id}>
                        <td>{customer.name}</td>
                        <td dir="ltr">{customer.phone ?? '—'}</td>
                        <td className="ac-num ac-neg">{money(customer.current_balance)}</td>
                        {/* `credit_limit_label` is server-formatted («غير محدود»). */}
                        <td className="ac-num ac-muted">{customer.credit_limit_label}</td>
                        <td>
                          <span
                            className={`ph-badge ${customer.exceeds_credit_limit ? 'low' : 'ok'}`}
                          >
                            {customer.exceeds_credit_limit ? D.over_limit : D.within_limit}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      </AsyncBoundary>
    </div>
  );
}
