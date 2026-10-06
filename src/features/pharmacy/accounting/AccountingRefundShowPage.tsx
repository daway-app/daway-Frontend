import { Link, useParams } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import type { ApiRefundDetail, ApiSale } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Refund detail — live against `GET /api/pharmacy/accounting/refunds/{id}`.
 *
 * Port of `pharmacy/accounting/refunds/show.blade.php` (four stacked cards:
 * sale info, refunded items, reason when non-empty, sale summary).
 *
 * Two backend gaps shape this page. Both are reported, not patched:
 *
 *  - **GAP-10 — the refund payload omits the sale summary.** The controller
 *    eager-loads `sale:id,number,sold_at,total,paid,remaining,customer_name`
 *    but the response only exposes `sale_number`. The Blade page reads the
 *    whole `$refund->sale`, so the "sale summary" card needs data the endpoint
 *    does not send. Fixed here by fetching the sale separately through the real
 *    `GET /api/pharmacy/accounting/sales/{number}` endpoint.
 *
 *  - **GAP-11 — refund items carry no `unit_price`.** The payload gives
 *    `{quantity, amount}` only. Unit price is therefore DERIVED as
 *    `amount / quantity` (exact for a refund line) with a divide-by-zero guard,
 *    rather than showing a wrong or blank value.
 */

const A = AR.accounting;

export function AccountingRefundShowPage() {
  const { id } = useParams<{ id: string }>();
  const api = usePharmacyApi();

  const query = useApiQuery<ApiRefundDetail>(
    (signal) => api.refund(Number(id), signal),
    [id],
    { isEmpty: () => false },
  );

  const refund = query.data;

  // GAP-10: the sale summary is a separate, real request.
  const saleQuery = useApiQuery<ApiSale>(
    (signal) => api.sale(refund!.sale_number, signal),
    [refund?.sale_number ?? ''],
    { enabled: Boolean(refund?.sale_number), isEmpty: () => false },
  );
  const sale = saleQuery.data;

  if (query.isError) {
    return (
      <div className="ph-page">
        <div className="ph-empty">
          <i className="fas fa-file-circle-question" aria-hidden="true" />
          <h3>{A.refunds.not_found}</h3>
          <p>#{id}</p>
          <Link
            to={ROUTES.accountingRefunds}
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
      <div className="ph-page-title">
        <h1>{A.refunds.show.title}</h1>
        <p className="subtitle">{refund ? `#${refund.id}` : ''}</p>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        {refund && (
          <>
            <div className="ph-card">
              <h3 className="ph-card-title">{A.refunds.show.sale_info}</h3>
              <div className="ph-grid">
                <div className="ph-grid-item">
                  <span className="label">{A.invoice.number}</span>
                  <span className="value">
                    <Link to={`${ROUTES.accountingSales}/${refund.sale_number}`}>
                      {refund.sale_number}
                    </Link>
                  </span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.common.date}</span>
                  <span className="value">
                    {refund.refunded_at ? refund.refunded_at.replace('T', ' ').slice(0, 16) : '—'}
                  </span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.common.total}</span>
                  <span className="value">{sale ? money(sale.total) : '—'}</span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.common.refunded}</span>
                  <span className="value">{money(refund.amount)}</span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.common.status}</span>
                  <span className="value">
                    <span
                      className={`ph-badge ${
                        refund.status === 'completed'
                          ? 'refunded'
                          : refund.status === 'cancelled'
                            ? 'closed'
                            : 'pending'
                      }`}
                    >
                      {A.refunds.status[refund.status]}
                    </span>
                  </span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.invoice.created_by}</span>
                  <span className="value">{refund.created_by ?? '—'}</span>
                </div>
              </div>
            </div>

            <div className="ph-card">
              <h3 className="ph-card-title">{A.refunds.show.items}</h3>
              {/* 🔴 إصلاح React: غلاف تمرير أفقي (Blade يرسم الجدول عاريًا). */}
              <div className="ph-table-wrap">
                <table className="ph-table">
                  <caption className="ac-hidden">{A.refunds.show.items}</caption>
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
                    {refund.items.map((item) => (
                      <tr key={item.id}>
                        <td dir="auto">{item.medicine_name}</td>
                        <td className="ac-num">{item.quantity}</td>
                        {/* GAP-11: unit price is derived — the payload omits it. */}
                        <td className="ac-num">
                          {item.quantity > 0
                            ? money(Math.round((item.amount / item.quantity) * 100) / 100)
                            : '—'}
                        </td>
                        <td className="ac-num">{money(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {refund.reason ? (
              <div className="ph-card">
                <h3 className="ph-card-title">{A.refunds.show.reason}</h3>
                <p className="ac-muted">{refund.reason}</p>
              </div>
            ) : null}

            <div className="ph-card">
              <h3 className="ph-card-title">{A.refunds.show.sale_summary}</h3>
              {saleQuery.isLoading ? (
                <p className="ac-muted">...جارٍ التحميل</p>
              ) : sale ? (
                <div className="ph-grid">
                  <div className="ph-grid-item">
                    <span className="label">{A.common.subtotal}</span>
                    <span className="value">{money(sale.subtotal)}</span>
                  </div>
                  <div className="ph-grid-item">
                    <span className="label">{A.common.discount}</span>
                    <span className="value">{money(sale.discount)}</span>
                  </div>
                  <div className="ph-grid-item">
                    <span className="label">{A.common.total}</span>
                    <span className="value">{money(sale.total)}</span>
                  </div>
                  <div className="ph-grid-item">
                    <span className="label">{A.common.paid}</span>
                    <span className="value">{money(sale.paid)}</span>
                  </div>
                  <div className="ph-grid-item">
                    <span className="label">{A.common.remaining}</span>
                    <span className="value">{money(sale.remaining)}</span>
                  </div>
                </div>
              ) : (
                <p className="ac-muted">—</p>
              )}
            </div>

            <div className="ph-actions">
              <Link to={ROUTES.accountingRefunds} className="ph-btn outline">
                {A.common.back}
              </Link>
            </div>
          </>
        )}
      </AsyncBoundary>
    </div>
  );
}
