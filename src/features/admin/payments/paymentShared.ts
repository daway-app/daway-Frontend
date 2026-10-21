import type { BadgeVariant } from '@/components/ui';
import type { Strings } from '@/lib/lang/LanguageContext';
import { ApiError } from '@/api/errors';
import type {
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
