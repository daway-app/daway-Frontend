/**
 * Cash-movement adjustment — the pure half of the cash register's
 * "record movement" wiring (`POST /api/pharmacy/accounting/cash/adjustments`).
 *
 * Mirrors the backend validator (`AccountingCashController::storeAdjustment`):
 *   - `kind` ∈ deposit | withdrawal | adjustment
 *   - `amount` numeric, > 0, ≤ 999999
 *   - `reason` required, 3–500 chars after trimming
 *   - direction must agree with kind: deposit ⇒ in, withdrawal ⇒ out;
 *     only `adjustment` may pick its direction freely.
 *
 * The direction is DERIVED here for deposit/withdrawal so a conflicting
 * (withdrawal + in) body can never leave the client — the backend would 422 it.
 * `moved_at` is deliberately not sent: the server defaults it to now.
 */

export type CashAdjustmentKind = 'deposit' | 'withdrawal' | 'adjustment';
export type CashDirection = 'in' | 'out';

/** Field-level validation codes, mapped to i18n strings by the page. */
export type AdjustmentFieldError = 'amount' | 'reason' | 'direction';

export interface CashAdjustmentInput {
  kind: CashAdjustmentKind;
  amount: number;
  reason: string;
  /** Only consulted for `adjustment`; ignored for deposit/withdrawal. */
  direction: CashDirection;
}

export interface CashAdjustmentBody {
  direction: CashDirection;
  kind: CashAdjustmentKind;
  amount: number;
  reason: string;
}

export type CashAdjustmentOutcome =
  | { ok: true; body: CashAdjustmentBody }
  | { ok: false; errors: AdjustmentFieldError[] };

/** The real result the backend returns from `POST .../cash/adjustments`. */
export interface CashAdjustmentResult {
  movement: { id: number; direction: string; amount: number };
  balance_now: number;
  is_low: boolean;
  warning: string | null;
}

/** The backend's own ceiling on the amount. */
export const ADJUSTMENT_MAX_AMOUNT = 999999;

export function resolveAdjustmentDirection(
  kind: CashAdjustmentKind,
  direction: CashDirection,
): CashDirection | null {
  if (kind === 'deposit') return 'in';
  if (kind === 'withdrawal') return 'out';
  // Anything that is not a real direction (the page's unset '') is missing.
  return direction === 'in' || direction === 'out' ? direction : null;
}

export function buildCashAdjustmentBody(input: CashAdjustmentInput): CashAdjustmentOutcome {
  const errors: AdjustmentFieldError[] = [];

  const amount = input.amount;
  if (!Number.isFinite(amount) || amount <= 0 || amount > ADJUSTMENT_MAX_AMOUNT) {
    errors.push('amount');
  }

  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 500) {
    errors.push('reason');
  }

  const direction = resolveAdjustmentDirection(input.kind, input.direction);
  if (direction === null) {
    errors.push('direction');
  }

  // `direction === null` always implies a 'direction' error above, so both
  // branches settle the nullability for the compiler.
  if (errors.length > 0 || direction === null) {
    return { ok: false, errors };
  }

  return { ok: true, body: { direction, kind: input.kind, amount, reason } };
}
