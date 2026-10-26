import type { BadgeVariant } from '@/components/ui';
import type { Strings } from '@/lib/lang/types';
import { ApiError } from '@/api/errors';
import type {
  AmountStatus,
  AmountUnmatchedError,
  PaymentAmountUnmatched,
  PaymentProblemCategory,
  PaymentProblemStatus,
  PaymentStatus,
  PaymentSubmissionStatus,
} from '@/api/adminTypes';

type PaymentsStrings = Strings['admin']['payments'];
type ProblemsStrings = Strings['admin']['payment_problems'];

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

/**
 * Read the server's `amount_unmatched` payload from an approve/reject error.
 * Returns the typed object when `code === 'amount_unmatched'`; otherwise null.
 * Numeric fields are coerced from potentially string-valued API responses.
 */
export function parseAmountUnmatched(err: unknown): AmountUnmatchedError {
  if (!(err instanceof ApiError)) return null;
  const code = err.code ?? err.data?.code;
  if (code !== 'amount_unmatched') return null;
  const d = err.data;
  if (!d?.grand_total) return null;
  const num = (v: number | string | undefined): number | undefined =>
    v === undefined ? undefined : typeof v === 'number' ? v : Number(v);
  const out: PaymentAmountUnmatched = {
    code: 'amount_unmatched',
    grand_total: num(d.grand_total) as number,
  };
  if (d.deficit !== undefined) out.deficit = num(d.deficit);
  if (d.overage !== undefined) out.overage = num(d.overage);
  return out;
}

export function amountStatusLabel(S: PaymentsStrings, status: AmountStatus): string {
  const map: Record<AmountStatus, string> = {
    matches: S.amount_match,
    under: S.amount_under,
    over: S.amount_over,
  };
  return map[status];
}

export function amountStatusVariant(status: AmountStatus): BadgeVariant {
  const map: Record<AmountStatus, BadgeVariant> = {
    matches: 'ok',
    under: 'out',
    over: 'low',
  };
  return map[status];
}

export function paymentStatusLabel(S: PaymentsStrings, status: PaymentStatus): string {
  const map: Record<PaymentStatus, string> = {
    pending: S.status_pending,
    under_review: S.status_under_review,
    paid: S.status_paid,
    rejected: S.status_rejected,
    problem_reported: S.status_problem_reported,
  };
  return map[status] ?? status;
}

export function paymentStatusVariant(status: PaymentStatus): BadgeVariant {
  const map: Record<PaymentStatus, BadgeVariant> = {
    pending: 'new',
    under_review: 'low',
    paid: 'ok',
    rejected: 'out',
    problem_reported: 'low',
  };
  return map[status] ?? 'new';
}

export function submissionStatusLabel(
  S: PaymentsStrings,
  status: PaymentSubmissionStatus | null,
): string {
  if (!status) return '—';
  const map: Record<PaymentSubmissionStatus, string> = {
    under_review: S.submission_under_review,
    approved: S.submission_approved,
    rejected: S.submission_rejected,
  };
  return map[status] ?? status;
}

export function problemStatusLabel(S: ProblemsStrings, status: PaymentProblemStatus): string {
  return status === 'open' ? S.status_open : S.status_resolved;
}

export function problemCategoryLabel(
  S: ProblemsStrings,
  category: PaymentProblemCategory,
): string {
  const map: Record<PaymentProblemCategory, string> = {
    bank_details: S.category_bank_details,
    amount: S.category_amount,
    receipt: S.category_receipt,
    other: S.category_other,
  };
  return map[category] ?? category;
}

/** Save an authenticated binary download without exposing the receipt path. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'receipt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
