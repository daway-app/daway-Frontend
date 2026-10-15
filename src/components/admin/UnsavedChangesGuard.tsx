import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { Btn, Modal } from '@/components/ui';
import { AR } from '@/lib/i18n';

/**
 * Blocks in-app navigation — and warns on tab close / hard reload — while a
 * form holds unsaved edits.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY A BLOCKER HERE, AND NOT ON THE POS / INVENTORY SCREENS
 * ─────────────────────────────────────────────────────────────────────────────
 * Those screens are already covered: the POS page is preserved by
 * `layouts/KeepAliveOutlet.tsx` (its cart survives navigation) and every
 * draft-bearing screen writes to sessionStorage via `lib/drafts.ts`. Leaving
 * them therefore loses nothing, so a prompt would be pure friction.
 *
 * The admin create/edit forms have NO such safety net — their fields live only
 * in component state. Navigating away (or reloading) really does discard the
 * work, which is the one case a guard earns its keep.
 *
 * `when` may be a PREDICATE, not just a boolean. That matters for the save
 * flow: after a successful save the form navigates away while its fields still
 * differ from the (now stale) baseline. A predicate that reads a ref lets the
 * save handler flip that ref immediately before `navigate()`, so the guard does
 * not intercept its own success redirect.
 *
 * Requires a data router (`createBrowserRouter`) — satisfied in `routes/router.tsx`.
 */
export function UnsavedChangesGuard({ when }: { when: boolean | (() => boolean) }) {
  const blocker = useBlocker(when);

  // The unload listener is not a Router navigation, so it needs a concrete
  // value rather than the predicate.
  const active = typeof when === 'function' ? when() : when;

  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers require `returnValue` to be set for the prompt to fire.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);

  return (
    <Modal
      open={blocker.state === 'blocked'}
      title={AR.admin.common.unsaved_title}
      onClose={() => blocker.reset?.()}
      footer={
        <>
          <Btn variant="ghost" onClick={() => blocker.reset?.()}>
            {AR.admin.common.unsaved_stay}
          </Btn>
          <Btn variant="danger" onClick={() => blocker.proceed?.()}>
            {AR.admin.common.unsaved_leave}
          </Btn>
        </>
      }
    >
      <p>{AR.admin.common.unsaved_message}</p>
    </Modal>
  );
}
