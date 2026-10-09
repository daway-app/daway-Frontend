import { useEffect, useRef } from 'react';
import { setPaused, useToasts, visibleToasts, toast, type Toast } from '@/lib/toast';

/**
 * The toast stack.
 *
 * WHY THERE IS NO `provider` AND NO HOOK IN `components/ui`
 * ---------------------------------------------------------
 * The store (`@/lib/toast`) is a module singleton; this component only
 * subscribes to it. That keeps `react-refresh/only-export-components` happy —
 * the file exports components only, and the hook (`useToasts`) lives in
 * `src/lib/` next to `forms.ts` for the same reason.
 *
 * THE ACCESSIBILITY BUG THIS EXISTS TO AVOID
 * ------------------------------------------
 * A live region that is mounted AT THE SAME TIME as its message is not
 * announced. The screen reader only observes a region that was already in the
 * accessibility tree when the text changed under it. So the region must exist
 * BEFORE any toast. That is why this component renders TWO permanent, always
 * present, EMPTY containers:
 *
 *   · a polite region  (role="status", aria-live="polite")  → success / info / warning
 *   · an assertive one (role="alert",  aria-live="assertive") → errors
 *
 * The containers never unmount while the app is alive; only the toast children
 * come and go. `data-empty` is what keeps an empty region from taking up space.
 *
 * Errors get `role="alert"` / assertive because a failure must interrupt; the
 * other tones are polite so they queue behind whatever the user is reading.
 *
 * They also never steal focus: the region has no `tabindex`, and the dismiss
 * control is a normal, tabbable button — reachable if wanted, never forced.
 */
export function Toaster() {
  const toasts = useToasts();
  const shown = visibleToasts(toasts);

  // Errors and non-errors are split across the two regions so each can carry
  // the correct role / politeness. Order is preserved within each region.
  const polite = shown.filter((t) => t.tone !== 'error');
  const assertive = shown.filter((t) => t.tone === 'error');

  return (
    <div className="ph-toaster" data-testid="toaster">
      <ToastRegion toasts={polite} tone="polite" />
      <ToastRegion toasts={assertive} tone="assertive" />
    </div>
  );
}

/**
 * One persistent live region.
 *
 * It is ALWAYS rendered, even when it holds no toasts. That is deliberate and
 * load-bearing: a screen reader only announces a change to a live region that
 * ALREADY existed in the accessibility tree. Mounting the region together with
 * its first message — or hiding it with `display: none` while empty — means the
 * announcement is silently missed. An empty flex column costs no layout, so
 * there is no reason to hide it.
 */
function ToastRegion({ toasts, tone }: { toasts: Toast[]; tone: 'polite' | 'assertive' }) {
  const isAssertive = tone === 'assertive';
  return (
    <div
      className="ph-toast-region"
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

const TONE_ICON: Record<Toast['tone'], string> = {
  success: 'fas fa-circle-check',
  error: 'fas fa-circle-exclamation',
  warning: 'fas fa-triangle-exclamation',
  info: 'fas fa-circle-info',
};

function ToastItem({ toast: t }: { toast: Toast }) {
  // Pause while the pointer or the keyboard is on the toast, so it is never
  // yanked away mid-read. Focus is tracked with `focusin`/`focusout` (which
  // bubble) rather than `focus`/`blur`, so the dismiss button inside also counts.
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = itemRef.current;
    if (!node) return;

    const onEnter = () => setPaused(t.id, true);
    const onLeave = () => setPaused(t.id, false);
    node.addEventListener('pointerenter', onEnter);
    node.addEventListener('pointerleave', onLeave);
    node.addEventListener('focusin', onEnter);
    node.addEventListener('focusout', onLeave);
    return () => {
      node.removeEventListener('pointerenter', onEnter);
      node.removeEventListener('pointerleave', onLeave);
      node.removeEventListener('focusin', onEnter);
      node.removeEventListener('focusout', onLeave);
    };
  }, [t.id]);

  return (
    <div
      className={`ph-toast is-${t.tone}${t.paused ? ' is-paused' : ''}`}
      ref={itemRef}
      // A toast is a self-contained status; the live region parent owns the
      // announcement role. Marking the item as a group keeps the dismiss button
      // associated with the message it dismisses for assistive tech.
      role="group"
      aria-label={t.message}
    >
      <i className={TONE_ICON[t.tone]} aria-hidden="true" />
      <span className="ph-toast-text">{t.message}</span>
      <button
        type="button"
        className="ph-toast-close"
        // The visible glyph is only "×"; the accessible name says what it does.
        aria-label="إغلاق التنبيه"
        onClick={() => toast.dismiss(t.id)}
      >
        <i className="fas fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}
