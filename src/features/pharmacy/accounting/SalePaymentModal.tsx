import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui';
import { useLang } from '@/lib/lang/LanguageContext';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation } from '@/api/useApiQuery';
import { money } from '@/lib/format';
import type { ApiSale, ApiSalePaymentResult } from '@/api/pharmacyTypes';

/**
 * Record a payment against an EXISTING sale — the shared modal behind the
 * "record payment" button on the sales log and the invoice page.
 *
 * Live against `POST /api/pharmacy/accounting/customers/{id}/payments` with
 * `sale_id`. One call records the collection, adds the cash movement AND
 * updates the sale itself (paid/remaining/status) server-side — the invoice
 * shown afterwards is the truth, never a client guess.
 *
 * The gate is upstream: this modal is only rendered for sales WITH a customer
 * (`sale.customer_id !== null`) and a positive remaining — recordings against a
 * walk-in invoice need a customer to attach the payment to.
 *
 * Financial op ⇒ confirmation step before the POST, and the modal shows the
 * REAL result the server returns (payment + refreshed customer balance).
 */

export function SalePaymentModal({
  sale,
  open,
  onClose,
  refetch,
}: {
  sale: ApiSale;
  open: boolean;
  onClose: () => void;
  refetch: () => void;
}) {
  const { STR } = useLang();
  const A = STR.accounting;
  const SP = A.sale_payment;
  const api = usePharmacyApi();

  const [step, setStep] = useState<'form' | 'confirm' | 'done'>('form');
  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'bank_transfer'>('cash');
  const [description, setDescription] = useState('');
  const [fieldError, setFieldError] = useState(false);
  const [result, setResult] = useState<ApiSalePaymentResult | null>(null);

  const pay = useApiMutation(
    (body: Parameters<typeof api.recordCustomerPayment>[1]) =>
      // The parent only opens this modal for sales with a customer.
      api.recordCustomerPayment(sale.customer_id as number, body),
  );

  const { reset: resetPay } = pay;

  /** Fresh state at every open (and every invoice) — never a stale draft. */
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setAmountText(String(sale.remaining));
    setMethod('cash');
    setDescription('');
    setFieldError(false);
    setResult(null);
    resetPay();
    // `resetPay` is stable (useCallback in useApiMutation).
  }, [open, sale.id, sale.remaining, resetPay]);

  function review() {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFieldError(true);
      return;
    }
    setFieldError(false);
    setStep('confirm');
  }

  async function run() {
    const amount = Number(amountText);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFieldError(true);
      setStep('form');
      return;
    }
    try {
      const res = await pay.run({
        amount,
        payment_method: method,
        sale_id: sale.id,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      setResult(res);
      setStep('done');
      refetch();
    } catch {
      setStep('form');
    }
  }

  function close() {
    if (pay.isPending) return;
    onClose();
  }

  return (
    <Modal
      open={open}
      title={SP.title}
      onClose={close}
      footer={
        step === 'form' ? (
          <>
            <button type="button" className="ph-btn ghost" onClick={close}>
              {A.common.cancel}
            </button>
            <button type="button" className="ph-btn primary" onClick={review}>
              {A.common.apply}
            </button>
          </>
        ) : step === 'confirm' ? (
          <>
            <button type="button" className="ph-btn ghost" onClick={() => setStep('form')}>
              {A.common.back}
            </button>
            <button
              type="button"
              className="ph-btn danger"
              disabled={pay.isPending}
              onClick={() => void run()}
            >
              {pay.isPending ? A.common.processing : SP.confirm_action}
            </button>
          </>
        ) : (
          <button type="button" className="ph-btn primary" onClick={close}>
            {A.common.close}
          </button>
        )
      }
    >
      {step === 'form' && (
        <>
          {pay.error && (
            <div className="ph-error" style={{ marginBlockEnd: 14 }}>
              <i className="fas fa-circle-exclamation" aria-hidden="true" />
              <p>{pay.error.message}</p>
            </div>
          )}

          <p className="ph-hint">
            {SP.describe
              .replace(':number', sale.number)
              .replace(':customer', sale.customer ?? '')}
          </p>

          <div className="ph-grid" style={{ marginBlock: 12 }}>
            <div className="ph-grid-item">
              <span className="label">{A.common.remaining}</span>
              <span className="value ac-strong">{money(sale.remaining)}</span>
            </div>
            <div className="ph-grid-item">
              <span className="label">{A.invoice.customer}</span>
              <span className="value" dir="auto">
                {sale.customer}
              </span>
            </div>
          </div>

          <div className="ph-form-group">
            <label htmlFor="sp-amount">{A.common.amount}</label>
            <input
              type="number"
              id="sp-amount"
              className="ph-input"
              min={0}
              step={0.01}
              value={amountText}
              aria-invalid={fieldError || pay.fieldErrors?.amount !== undefined}
              onChange={(e) => {
                setAmountText(e.target.value);
                setFieldError(false);
              }}
            />
            {(fieldError || pay.fieldErrors?.amount !== undefined) && (
              <p className="ph-hint" role="alert">
                {pay.fieldErrors?.amount?.[0] ?? SP.err_amount}
              </p>
            )}
          </div>

          <div className="ph-form-group">
            <label htmlFor="sp-method">{SP.payment_method}</label>
            <select
              id="sp-method"
              className="ph-select"
              value={method}
              onChange={(e) => setMethod(e.target.value as 'cash' | 'card' | 'bank_transfer')}
            >
              <option value="cash">{A.payment_methods.cash}</option>
              <option value="card">{A.payment_methods.card}</option>
              <option value="bank_transfer">{A.payment_methods.bank_transfer}</option>
            </select>
          </div>

          <div className="ph-form-group">
            <label htmlFor="sp-desc">{SP.description}</label>
            <textarea
              id="sp-desc"
              rows={2}
              className="ph-textarea"
              placeholder={SP.description_placeholder}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <p className="ph-hint">{SP.amount_note}</p>
        </>
      )}

      {step === 'confirm' && (
        <>
          <p className="ph-hint">{SP.confirm_hint}</p>
          <div className="ph-grid">
            <div className="ph-grid-item">
              <span className="label">{A.common.amount}</span>
              <span className="value ac-strong">{money(Number(amountText))}</span>
            </div>
            <div className="ph-grid-item">
              <span className="label">{SP.payment_method}</span>
              <span className="value">
                {method === 'cash'
                  ? A.payment_methods.cash
                  : method === 'card'
                    ? A.payment_methods.card
                    : A.payment_methods.bank_transfer}
              </span>
            </div>
            <div className="ph-grid-item">
              <span className="label">{A.invoice.customer}</span>
              <span className="value" dir="auto">
                {sale.customer}
              </span>
            </div>
            <div className="ph-grid-item">
              <span className="label">{A.sales.col_invoice}</span>
              <span className="value">{sale.number}</span>
            </div>
          </div>
        </>
      )}

      {step === 'done' && result && (
        <>
          <p className="ph-hint">{SP.success}</p>
          <p className="ph-hint">
            {SP.customer_balance.replace(
              ':balance',
              money(result.customer.current_balance),
            )}
          </p>
        </>
      )}
    </Modal>
  );
}
