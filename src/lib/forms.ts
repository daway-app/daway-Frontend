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
