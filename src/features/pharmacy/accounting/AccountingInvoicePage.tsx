import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Modal } from '@/components/ui';
import { useAuth, usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money, statusBadgeClass } from '@/lib/format';
import type { ApiSale } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Invoice detail — live against `GET /api/pharmacy/accounting/sales/{number}`.
 *
 * Port of `pharmacy/accounting/sales/show.blade.php`.
 *
 * The `canRefund` rule is copied verbatim from Blade:
 *   status not in (cancelled, refunded) AND paid > (total − remaining)
 * i.e. "more than the outstanding balance was actually collected".
 *
 * `items` is OPTIONAL on the list payload but present on the detail endpoint,
 * so it is read with a `?? []` guard rather than assumed.
 *
 * The sales list links here with `?print=1`; that deep link opens the browser's
 * print dialog once the invoice has rendered (the Blade page does the same via
 * its inline script). It is guarded so React's double-invoke in development
 * does not open two dialogs.
 */

const A = AR.accounting;

export function AccountingInvoicePage() {
  const { number } = useParams<{ number: string }>();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const api = usePharmacyApi();

  const [msg, setMsg] = useState<string | null>(null);

  const query = useApiQuery<ApiSale>((signal) => api.sale(String(number), signal), [number], {
    isEmpty: () => false,
  });

  const sale = query.data;
  const wantsPrint = searchParams.get('print') === '1';

  /**
   * Keyed on the sale NUMBER rather than the `sale` object: a refetch returns a
   * new object identity, which would re-open the print dialog. The number is
   * stable for a given invoice.
   */
  const saleNumber = sale?.number;

  useEffect(() => {
    if (!wantsPrint || !saleNumber) return;
    // Let the layout settle before the dialog, so the print preview is complete.
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [wantsPrint, saleNumber]);

  if (query.isError) {
    return (
      <div className="ph-page">
        <div className="ph-empty">
          <i className="fas fa-file-circle-question" aria-hidden="true" />
          <h3>{A.invoice.not_found}</h3>
          <p>{number}</p>
          <Link
            to={ROUTES.accountingSales}
            className="ph-btn outline"
            style={{ marginBlockStart: 16 }}
          >
            {A.common.back}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ph-page">
      <div className="ph-head ac-no-print">
        <div className="ph-page-title">
          <h1>{A.invoice.heading.replace(':number', String(number))}</h1>
          <p>{A.invoice.print_ready}</p>
        </div>
        <div className="ph-actions ac-invoice-actions">
          <button type="button" className="ph-btn primary" onClick={() => window.print()}>
            <i className="fas fa-print" aria-hidden="true" /> {A.common.print}
          </button>
          <button
            type="button"
            className="ph-btn ghost"
            onClick={() => setMsg(A.invoice.download_soon)}
          >
            <i className="fas fa-download" aria-hidden="true" /> {A.common.export}
          </button>
          {sale && sale.remaining > 0 && sale.status !== 'cancelled' ? (
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => setMsg(A.common.mock_notice)}
            >
              <i className="fas fa-money-bill-wave" aria-hidden="true" /> {A.common.record_payment}
            </button>
          ) : null}
          {sale && canRefund(sale) ? (
            <Link
              to={`${ROUTES.accountingRefundsCreate}/${sale.number}`}
              className="ph-btn danger"
            >
              <i className="fas fa-rotate-left" aria-hidden="true" /> {A.common.refund}
            </Link>
          ) : null}
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={5}
      >
        {sale && (
          <div className="ac-invoice-doc">
            <div className="ac-invoice-doc-head">
              <div>
                <h2>{sale.number}</h2>
                <span className="ac-muted">
                  {sale.date_human ?? (sale.date ?? '').replace('T', ' ').slice(0, 16)}
                </span>
              </div>
              {/* `status_label` is pre-localised by the backend. */}
              <span className={`ph-badge ${statusBadgeClass(sale.status)}`}>
                {sale.status_label}
              </span>
            </div>

            <dl className="ac-invoice-doc-meta">
              <div>
                <dt>{A.invoice.pharmacy}</dt>
                <dd>{user?.name ?? '—'}</dd>
              </div>
              <div>
                <dt>{A.invoice.customer}</dt>
                <dd>{sale.customer ?? A.sales.walk_in}</dd>
              </div>
              <div>
                <dt>{A.common.payment_method}</dt>
                {/* `method_label` is pre-localised by the backend. */}
                <dd>{sale.method_label}</dd>
              </div>
              <div>
                <dt>{A.invoice.created_at}</dt>
                <dd>{(sale.date ?? '').replace('T', ' ').slice(0, 16) || '—'}</dd>
              </div>
              <div>
                <dt>{A.invoice.created_by}</dt>
                <dd>{sale.created_by ?? '—'}</dd>
              </div>
            </dl>

            <div style={{ padding: '18px 22px', borderBlockEnd: '1px solid var(--ac-line-soft)' }}>
              {/* 🔴 إصلاح React: غلاف تمرير أفقي (Blade يرسم الجدول عاريًا). */}
              <div className="ph-table-wrap">
                <table className="ph-table">
                  <caption className="ac-hidden">{A.invoice.items}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{A.invoice.item}</th>
                      <th scope="col" className="ac-num">
                        {A.common.qty}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.common.unit_price}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.common.total}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sale.items ?? []).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="ac-strong">{item.medicine_name}</span>
                          {item.barcode ? (
                            <div className="ac-muted ac-mono">{item.barcode}</div>
                          ) : null}
                        </td>
                        <td className="ac-num">{item.quantity}</td>
                        <td className="ac-num">{money(item.unit_price)}</td>
                        <td className="ac-num">
                          {money(item.line_total)}
                          {item.line_discount > 0 ? (
                            <div className="ac-muted">−{money(item.line_discount)}</div>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ac-totals-block">
              <div className="ac-invoice-line">
                <span className="label">{A.common.subtotal}</span>
                <span className="value">{money(sale.subtotal)}</span>
              </div>
              <div className="ac-invoice-line">
                <span className="label">{A.common.discount}</span>
                <span className={`value ${sale.discount > 0 ? 'ac-neg' : ''}`}>
                  {sale.discount > 0 ? '−' : ''}
                  {money(sale.discount)}
                </span>
              </div>
              <div className="ac-invoice-line is-total">
                <span className="label">{A.common.total}</span>
                <span className="value">{money(sale.total)}</span>
              </div>
              <div className="ac-invoice-line">
                <span className="label">{A.common.paid}</span>
                <span className="value">{money(sale.paid)}</span>
              </div>
              <div className={`ac-invoice-line is-remaining ${sale.remaining > 0 ? 'warn' : ''}`}>
                <span className="label">{A.common.remaining}</span>
                <span className="value">{money(sale.remaining)}</span>
              </div>
            </div>

            <div style={{ padding: '18px 22px', borderBlockStart: '1px solid var(--ac-line-soft)' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '.95rem' }}>
                <i
                  className="fas fa-clock-rotate-left"
                  aria-hidden="true"
                  style={{ color: 'var(--ac-teal-text)' }}
                />{' '}
                {A.invoice.payment_history}
              </h3>
              {sale.paid > 0 && sale.status !== 'refunded' ? (
                <div className="ac-invoice-line">
                  <span className="label">
                    {(sale.date ?? '').replace('T', ' ').slice(0, 16)} — {sale.method_label}
                  </span>
                  <span className="value">{money(sale.paid)}</span>
                </div>
              ) : sale.status === 'refunded' ? (
                <p className="ac-muted" style={{ margin: 0 }}>
                  {A.invoice.refunded_status}
                </p>
              ) : (
                <p className="ac-muted" style={{ margin: 0 }}>
                  {A.invoice.no_payments}
                </p>
              )}
            </div>
          </div>
        )}
      </AsyncBoundary>

      <Modal
        open={msg !== null}
        title={A.invoice.title}
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

/**
 * Blade's refund gate, verbatim:
 *   `$sale->status !== 'cancelled' && $sale->status !== 'refunded' && $sale->paid > ($sale->total - $sale->remaining)`
 */
function canRefund(sale: ApiSale): boolean {
  return (
    sale.status !== 'cancelled' &&
    sale.status !== 'refunded' &&
    sale.paid > sale.total - sale.remaining
  );
}
