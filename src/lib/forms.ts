/**
 * Small form helpers shared by the pharmacy screens.
 *
 * These live outside `components/ui` on purpose: that module is a component
 * module, and mixing hooks into it breaks React Fast Refresh (the linter says
 * so, and it is right — editing a hook there would remount every component in
 * the file).
 */
import { useState } from 'react';

/**
 * Minimal touched-state tracker for a set of fields.
 *
 * Deliberately small: it does NOT own the values (the screens already do) and it
 * does not re-implement a form library. It answers two questions — has this
 * field been touched, and which fields failed — and nothing else.
 *
 * The point of `touched` is that a field must not look wrong before the user has
 * reached it. That is the most common validation-UX mistake: shouting at
 * someone about a field they have not typed in yet.
 */
export function useTouched<K extends string>(initial?: Partial<Record<K, boolean>>) {
  const [touched, setTouched] = useState<Partial<Record<K, boolean>>>(initial ?? {});

  return {
    touched,
    /** Call from onBlur. */
    markTouched: (key: K) =>
      setTouched((t) => (t[key] ? t : { ...t, [key]: true })),
    /** Call on submit: marks everything so every error becomes visible at once. */
    markAllTouched: (keys: readonly K[]) =>
      setTouched(
        Object.fromEntries(keys.map((k) => [k, true])) as Partial<Record<K, boolean>>,
      ),
  };
}

/**
 * Scroll the first invalid control into view and focus it.
 *
 * Why: on a long form the failing field is often off-screen, so the user presses
 * Submit, nothing appears to happen, and they press it again. This makes the
 * failure impossible to miss.
 *
 * Queries by `[aria-invalid="true"]` rather than by ref, so it works with the
 * `FormField` wrapper without the caller registering anything. Returns whether
 * it found something, so a caller can decide to abort the submit.
 */
export function focusFirstInvalid(root?: HTMLElement | null): boolean {
  const scope = root ?? document;
  const el = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!el) return false;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.focus({ preventScroll: true });
  return true;
}

/* ------------------------------------------------------------------ */
/* Rules                                                               */
/* ------------------------------------------------------------------ */

/**
 * The validation rules, kept as plain functions returning `null` (valid) or an
 * Arabic message (invalid).
 *
 * WHY PLAIN FUNCTIONS AND NOT A SCHEMA LIBRARY
 * -------------------------------------------
 * The forms here have between 2 and 6 fields. A schema library (zod/yup) would
 * add a dependency, a second vocabulary and a resolver layer to save maybe
 * fifteen lines. What the screens actually needed was: one place per rule, with
 * Arabic messages already written. That is this.
 *
 * MESSAGES ARE THE BACKEND'S WORDS
 * --------------------------------
 * These mirror the Laravel rules the same fields are validated against
 * (`PharmacyProfileRequest`, `ProfilePasswordRequest`), so the client and the
 * server agree on what "valid" means and the user does not get a red border and
 * then a green save. Where the backend is stricter than is useful to repeat, the
 * server message still wins: `save.error.message` renders regardless.
 */

/** Strip spaces, dashes and parentheses so `0599 123 456` counts. */
function digitsOf(value: string): string {
  return value.replace(/[^\d]/g, '');
}

/**
 * Required text.
 *
 * `trim()` matters: a field containing only spaces passes a naive `!== ''`
 * check, and the backend's `required` rule rejects it — so the user would see
 * no client error and then a confusing server one.
 */
export function requiredText(value: string, label: string): string | null {
  return value.trim() ? null : `${label} مطلوب`;
}

/**
 * A phone number, without being precious about formatting.
 *
 * Deliberately permissive about the shape: this app serves Palestine, where a
 * number is commonly written `0599 123 456`, `0599-123-456` or `+970 599 123
 * 456`. Rejecting formatting would be hostile. What it does enforce is that
 * there are enough actual digits — 9 is the shortest local form (e.g.
 * `0599123456` is 10, `599123456` is 9).
 */
export function phone(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return `${label} مطلوب`;
  const digits = digitsOf(v);
  if (digits.length < 9) return 'رقم الهاتف غير مكتمل';
  if (digits.length > 15) return 'رقم الهاتف طويل أكثر من اللازم';
  // Anything left that is not a digit, space, dash, plus or paren is a typo.
  if (/[^\d\s\-+()]/.test(v)) return 'رقم الهاتف يحتوي رموزاً غير صحيحة';
  return null;
}

/** A latitude/longitude pair, as the API expects them: numbers, or empty. */
export function coordinate(value: string, label: string, min: number, max: number): string | null {
  const v = value.trim();
  if (!v) return null; // Optional — the backend accepts null coordinates.
  // `Number('')` is 0 and `Number('12abc')` is NaN, so check the shape first.
  if (!/^-?\d+(\.\d+)?$/.test(v)) return `${label} يجب أن يكون رقماً`;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) {
    return `${label} يجب أن يكون بين ${min} و ${max}`;
  }
  return null;
}

export function latitude(value: string): string | null {
  return coordinate(value, 'خط العرض', -90, 90);
}

export function longitude(value: string): string | null {
  return coordinate(value, 'خط الطول', -180, 180);
}

/**
 * A URL, or empty.
 *
 * Used by the logo field, which is a URL in this API rather than a file upload
 * (GAP-8). The backend validates it with Laravel's `url` rule, which requires a
 * scheme — so a bare `example.com/logo.png` is rejected server-side and must be
 * rejected here too, or the user gets a silent failure.
 */
export function optionalUrl(value: string, label: string): string | null {
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return `${label} يجب أن يبدأ بـ http أو https`;
    }
  } catch {
    return `${label} ليس رابطاً صحيحاً`;
  }
  return null;
}

/** A password of at least `min` characters — matching the backend's `min:8`. */
export function password(value: string, label: string, min = 8): string | null {
  if (!value) return `${label} مطلوب`;
  if (value.length < min) return `${label} يجب أن تكون ${min} أحرف على الأقل`;
  return null;
}

/** Confirmation must match. Checked against the current value, not a copy of it. */
export function matches(value: string, other: string, label: string): string | null {
  return value === other ? null : `${label} غير متطابقة`;
}

/**
 * Run a map of rules and return the errors plus whether anything failed.
 *
 * Shaped as `{ errors, first }` so a submit handler can do:
 *
 *     const { errors, ok } = validate(...)
 *     if (!ok) { markAllTouched(keys); focusFirstInvalid(); return; }
 *
 * `ok` is derived rather than left to the caller: `!Object.values(errors).some(Boolean)`
 * at every call site is exactly the kind of thing that gets forgotten once and
 * lets an invalid form through.
 */
export function validate<K extends string>(
  rules: Record<K, () => string | null>,
): { errors: Record<K, string | null>; ok: boolean } {
  const errors = {} as Record<K, string | null>;
  let ok = true;
  for (const key of Object.keys(rules) as K[]) {
    const message = rules[key]();
    errors[key] = message;
    if (message) ok = false;
  }
  return { errors, ok };
}
