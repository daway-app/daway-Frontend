import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { AsyncBoundary, Modal } from '@/components/ui';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import { round2 } from '@/lib/money';
import type { ApiRefundableItems } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';

/**
 * Create a refund — live against `GET .../sales/{number}/refund-items` and
 * `POST /api/pharmacy/accounting/refunds`.
 *
 * Port of `pharmacy/accounting/refunds/create.blade.php`.
 *
 * 🔴 **This page closes the open D-1 question.**
 *
 * D-1 was: the ported screen showed each line's gross `line_total` as
 * "refundable", ignoring refunds already taken on that sale — so a pharmacist
 * could refund the same line twice.
 *
 * The backend already answers this: `GET .../refund-items` returns
 * `available_quantity = original − refunded` per line, plus the sale-level
 * `already_refunded` / `available_to_refund` totals. Its own type comment says
 * the UI **must** use `available_quantity` "not the gross original quantity —
 * that is exactly the D-1 defect". So the fix is to read those fields rather
 * than re-derive them, and to cap every quantity input at `available_quantity`.
 *
 * The `Modal` confirm replaces Blade's native `confirm()`, and the POST is now
 * real.
 */

const A = AR.accounting;

export function AccountingRefundCreatePage() {
  const { saleNumber } = useParams<{ saleNumber: string }>();
  const api = usePharmacyApi();

  const [reason, setReason] = useState('');
  /** sale_item_id → chosen quantity. Absent = not selected. */
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [done, setDone] = useState(false);

  const query = useApiQuery<ApiRefundableItems>(
    (signal) => api.refundableItems(String(saleNumber), signal),
    [saleNumber],
    { isEmpty: () => false },
  );

  const data = query.data;
  const items = useMemo(() => data?.items ?? [], [data]);

  const create = useApiMutation((body: Parameters<typeof api.createRefund>[0]) =>
    api.createRefund(body),
  );

  /** Only lines with a positive chosen quantity, capped at what is refundable. */
  const selected = useMemo(
    () =>
      items
        .map((item) => ({
          sale_item_id: item.id,
          quantity: Math.min(quantities[item.id] ?? 0, item.available_quantity),
          unit_price: item.unit_price,
        }))
        .filter((row) => row.quantity > 0),
    [items, quantities],
  );

  const refundTotal = round2(
    selected.reduce((sum, row) => sum + row.quantity * row.unit_price, 0),
  );

  function setQty(id: number, value: number, max: number) {
    const clamped = Math.max(0, Math.min(value, max));
    setQuantities((prev) => ({ ...prev, [id]: clamped }));
  }

  async function submit() {
    setConfirmOpen(false);
    try {
      await create.run({
        sale_number: String(saleNumber),
        items: selected.map((row) => ({ sale_item_id: row.sale_item_id, quantity: row.quantity })),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setDone(true);
    } catch {
      // `create.error` renders below.
    }
  }

  if (query.isError) {
    return (
      <div className="ph-page">
        <div className="ph-empty">
          <i className="fas fa-file-circle-question" aria-hidden="true" />
          <h3>{A.invoice.not_found}</h3>
          <p>{saleNumber}</p>
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
      <div className="ph-page-title">
        <h1>{A.common.refund}</h1>
        <p className="subtitle">{saleNumber}</p>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        {data && (
          <>
            {create.error && (
              <div className="ph-error" style={{ marginBlockEnd: 14 }}>
                <i className="fas fa-circle-exclamation" aria-hidden="true" />
                <p>{create.error.message}</p>
              </div>
            )}

            <div className="ph-card">
              <h3 className="ph-card-title">{A.common.summary}</h3>
              <div className="ph-grid">
                <div className="ph-grid-item">
                  <span className="label">{A.common.total}</span>
                  <span className="value">{money(data.total)}</span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.common.paid}</span>
                  <span className="value">{money(data.paid)}</span>
                </div>
                {/* Server-computed — NOT re-derived client-side (that was D-1). */}
                <div className="ph-grid-item">
                  <span className="label">{A.common.refunded}</span>
                  <span className="value">{money(data.already_refunded)}</span>
                </div>
                <div className="ph-grid-item">
                  <span className="label">{A.common.refundable}</span>
                  <span className="value ac-strong">{money(data.available_to_refund)}</span>
                </div>
              </div>
            </div>

            <div className="ph-card">
              <h3 className="ph-card-title">{A.common.select_items}</h3>

              {/* 🔴 إصلاح React: غلاف تمرير أفقي (Blade يرسم الجدول عاريًا). */}
              <div className="ph-table-wrap">
                <table className="ph-table">
                  <caption className="ac-hidden">{A.common.select_items}</caption>
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
                        {A.common.refunded}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.common.refundable}
                      </th>
                      <th scope="col" className="ac-num">
                        {A.common.qty}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const max = item.available_quantity;
                      const chosen = quantities[item.id] ?? 0;
                      return (
                        <tr key={item.id} data-refundable={max}>
                          <td dir="auto">{item.medicine_name}</td>
                          <td className="ac-num">{item.original_quantity}</td>
                          <td className="ac-num">{money(item.unit_price)}</td>
                          {/* Prior refunds on THIS line. */}
                          <td className="ac-num">
                            {item.refunded_quantity > 0 ? (
                              <span className="ac-neg">{item.refunded_quantity}</span>
                            ) : (
                              <span className="ac-muted">—</span>
                            )}
                          </td>
                          <td className="ac-num ac-strong">
                            {max > 0 ? (
                              money(round2(max * item.unit_price))
                            ) : (
                              <span className="ac-muted">—</span>
                            )}
                          </td>
                          <td className="ac-num">
                            <input
                              type="number"
                              className="ph-input"
                              style={{ width: 80, textAlign: 'center' }}
                              min={0}
                              max={max}
                              value={chosen}
                              disabled={max <= 0}
                              aria-label={`${A.common.qty} — ${item.medicine_name}`}
                              onChange={(e) => setQty(item.id, Number(e.target.value), max)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="ph-form-group">
                <label htmlFor="reason">{A.refunds.reason}</label>
                <textarea
                  name="reason"
                  id="reason"
                  rows={3}
                  className="ph-textarea"
                  placeholder={A.refunds.reason_placeholder}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>

              <div className="ph-actions">
                <Link to={`${ROUTES.accountingSales}/${saleNumber}`} className="ph-btn outline">
                  {A.common.cancel}
                </Link>
                <button
                  type="button"
                  className="ph-btn danger"
                  disabled={selected.length === 0 || create.isPending}
                  onClick={() => setConfirmOpen(true)}
                >
                  {A.common.confirm_refund}
                  {selected.length > 0 ? ` (${money(refundTotal)})` : ''}
                </button>
              </div>
            </div>
          </>
        )}
      </AsyncBoundary>

      <Modal
        open={confirmOpen}
        title={A.common.confirm_refund}
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <button type="button" className="ph-btn ghost" onClick={() => setConfirmOpen(false)}>
              {A.common.cancel}
            </button>
            <button type="button" className="ph-btn danger" onClick={() => void submit()}>
              {A.common.confirm_refund}
            </button>
          </>
        }
      >
        <p className="ph-hint">{A.refunds.confirm}</p>
        <p className="ph-hint" style={{ marginBlockStart: 8 }}>
          {A.common.total}: <b>{money(refundTotal)}</b>
        </p>
      </Modal>

      <Modal
        open={done}
        title={A.common.refund}
        onClose={() => {
          setDone(false);
          setQuantities({});
          setReason('');
        }}
        footer={
          <>
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => {
                setDone(false);
                setQuantities({});
                setReason('');
              }}
            >
              {A.common.close}
            </button>
            <Link to={ROUTES.accountingRefunds} className="ph-btn primary">
              {A.refunds.title}
            </Link>
          </>
        }
      >
        <p className="ph-hint">{A.refunds.created_success}</p>
      </Modal>
    </div>
  );
}
