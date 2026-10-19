import { round2 } from '@/lib/money';

/**
 * Client-side mirror of the backend's debt-first refund rule (D1–D7).
 *
 * A refund returns GOODS (`total`), not necessarily MONEY. The backend splits
 * the returned goods value against the invoice's still-unpaid balance:
 *
 *     debt_cancelled = min(refundTotal, remaining)
 *     cash_refunded  = refundTotal − debt_cancelled
 *
 * So a return of unpaid goods cancels debt and pays out nothing, while a return
 * on a fully paid invoice pays the whole value back in cash. This function
 * exists purely to PREVIEW that split on the refund form before the pharmacist
 * confirms — the authoritative figures are computed server-side. Both sides
 * implement the same formula; `refundSettlement.test.ts` pins it.
 *
 * NB: the two parts always re-sum to `total` (no rounding leak), because
 * `cash_refunded` is derived by subtraction, not an independent round.
 */
export interface RefundSettlement {
  /** Value of the goods being returned. */
  total: number;
  /** Part that cancels existing debt (nothing leaves the drawer). */
  debt_cancelled: number;
  /** Part actually paid back (cash tender only, subject to drawer cover). */
  cash_refunded: number;
}

export function refundSettlement(refundTotal: number, invoiceRemaining: number): RefundSettlement {
  const total = round2(Math.max(0, refundTotal));
  const remaining = Math.max(0, round2(invoiceRemaining));
  const debtCancelled = Math.min(total, remaining);

  return {
    total,
    debt_cancelled: debtCancelled,
    cash_refunded: round2(total - debtCancelled),
  };
}
