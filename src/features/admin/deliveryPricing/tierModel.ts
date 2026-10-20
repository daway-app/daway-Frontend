/**
 * Pure helpers for the delivery-pricing tiers screen.
 *
 * Deliberately framework-free (no React, no API types) so the formatting and
 * the client-side draft checks can be unit-tested in isolation. The server stays
 * the source of truth — `validateTierDraft` only catches obvious input mistakes
 * before a round-trip; it never re-implements the tier-gap/overlap rules.
 *
 * Validation returns an error CODE, not a message (same pattern as
 * `pharmacy/profile/logoUpload.ts`): the caller maps the code to
 * `STR.admin.delivery_pricing.errors.<code>`, so no user-facing Arabic lives
 * here and both locales stay in the dictionary.
 */

/** The editable string form of a tier, as held by the modal's inputs. */
export interface TierDraft {
  minDistanceMeters: string;
  maxDistanceMeters: string;
  fee: string;
}

/** Codes a tier draft can fail with — mapped to copy by the screen. */
export type TierDraftErrorCode =
  | 'min_required'
  | 'min_integer'
  | 'max_integer'
  | 'max_below_min'
  | 'fee_required'
  | 'fee_number'
  | 'fee_negative';

/** Field-keyed error codes returned by `validateTierDraft` (empty = valid). */
export interface TierDraftErrors {
  minDistanceMeters?: TierDraftErrorCode;
  maxDistanceMeters?: TierDraftErrorCode;
  fee?: TierDraftErrorCode;
}

/**
 * Render a tier's distance range, e.g. `0 – 1000 م`, or `2000 م – مفتوحة` when
 * the tier is open-ended. Both the open-ended label and the meters unit are
 * passed in so the copy comes from the i18n dictionary, not from this module.
 */
export function formatDistanceRange(
  minMeters: number,
  maxMeters: number | null,
  openEndedLabel: string,
  metersUnit: string,
): string {
  if (maxMeters === null || maxMeters === undefined) {
    return `${minMeters} ${metersUnit} – ${openEndedLabel}`;
  }
  return `${minMeters} – ${maxMeters} ${metersUnit}`;
}

const INTEGER = /^\d+$/;

/**
 * Client-side checks for a tier draft, as error codes.
 *
 * Empty min/fee are errors; min must be a non-negative integer; max is optional
 * but must be a non-negative integer and not below min; fee must be a
 * non-negative number.
 */
export function validateTierDraft(draft: TierDraft): TierDraftErrors {
  const errors: TierDraftErrors = {};

  const minRaw = draft.minDistanceMeters.trim();
  let min: number | null = null;
  if (minRaw === '') {
    errors.minDistanceMeters = 'min_required';
  } else if (!INTEGER.test(minRaw)) {
    errors.minDistanceMeters = 'min_integer';
  } else {
    min = Number(minRaw);
  }

  const maxRaw = draft.maxDistanceMeters.trim();
  let max: number | null = null;
  if (maxRaw !== '') {
    if (!INTEGER.test(maxRaw)) {
      errors.maxDistanceMeters = 'max_integer';
    } else {
      max = Number(maxRaw);
    }
  }

  if (min !== null && max !== null && max < min) {
    errors.maxDistanceMeters = 'max_below_min';
  }

  const feeRaw = draft.fee.trim();
  if (feeRaw === '') {
    errors.fee = 'fee_required';
  } else {
    const fee = Number(feeRaw);
    if (!Number.isFinite(fee)) {
      errors.fee = 'fee_number';
    } else if (fee < 0) {
      errors.fee = 'fee_negative';
    }
  }

  return errors;
}
