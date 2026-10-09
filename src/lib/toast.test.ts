import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DURATION,
  MAX_VISIBLE,
  __resetForTests,
  add,
  dismiss,
  dismissAll,
  getSnapshot,
  setPaused,
  subscribe,
  toast,
  visibleToasts,
} from './toast';

/**
 * Store-level guards for the toast system.
 *
 * Every assertion here corresponds to a way a notification silently fails to be
 * seen — a timer that never fires, a pause that loses the countdown, a stack
 * that grows without bound, a subscriber that is never told to re-render. None
 * of these would be caught by looking at a rendered toast: it would simply
 * appear (or not) at the wrong moment.
 *
 * `vi.useFakeTimers()` drives the store's own `setTimeout`s, so auto-dismiss is
 * tested as time, not as a race.
 */

beforeEach(() => {
  vi.useFakeTimers();
  __resetForTests();
});

afterEach(() => {
  __resetForTests();
  vi.useRealTimers();
});

describe('add()', () => {
  it('assigns a unique, increasing id to each toast', () => {
    const a = add({ tone: 'success', message: 'أ' });
    const b = add({ tone: 'info', message: 'ب' });
    expect(b).toBeGreaterThan(a);
    expect(getSnapshot().map((t) => t.id)).toEqual([a, b]);
  });

  it('applies the per-tone default lifetime', () => {
    add({ tone: 'success', message: 'ok' });
    add({ tone: 'error', message: 'boom' });
    const [ok, boom] = getSnapshot();
    expect(ok.duration).toBe(DEFAULT_DURATION.success);
    // Errors are sticky by default: a failure the user never saw is the bug.
    expect(boom.duration).toBe(Infinity);
  });

  it('lets the caller override the lifetime', () => {
    add({ tone: 'success', message: 'ok', duration: 123 });
    expect(getSnapshot()[0].duration).toBe(123);
  });

  it('replaces the snapshot array so subscribers see a new reference', () => {
    const before = getSnapshot();
    add({ tone: 'info', message: 'x' });
    expect(getSnapshot()).not.toBe(before);
  });
});

describe('dismiss() + dismissAll()', () => {
  it('dismiss() removes exactly the given toast', () => {
    const a = add({ tone: 'info', message: 'a' });
    const b = add({ tone: 'info', message: 'b' });
    dismiss(a);
    expect(getSnapshot().map((t) => t.id)).toEqual([b]);
  });

  it('dismiss() on an unknown id is a no-op (does not throw)', () => {
    add({ tone: 'info', message: 'a' });
    expect(() => dismiss(99999)).not.toThrow();
    expect(getSnapshot()).toHaveLength(1);
  });

  it('dismissAll() empties the stack', () => {
    add({ tone: 'info', message: 'a' });
    add({ tone: 'error', message: 'b' });
    dismissAll();
    expect(getSnapshot()).toEqual([]);
  });

  it('dismissing cancels the pending auto-dismiss timer', () => {
    const id = add({ tone: 'success', message: 'a', duration: 1000 });
    dismiss(id);
    // Advance well past the lifetime: a leaked timer would re-enter dismiss and
    // (with a stale closure) is exactly the kind of thing that removes a LATER
    // toast by mistake.
    const later = add({ tone: 'success', message: 'later', duration: 5000 });
    vi.advanceTimersByTime(1500);
    expect(getSnapshot().map((t) => t.id)).toEqual([later]);
  });
});

describe('auto-dismiss timing', () => {
  it('removes a success toast after its lifetime, and not before', () => {
    add({ tone: 'success', message: 'ok', duration: 3000 });

    vi.advanceTimersByTime(2999);
    expect(getSnapshot()).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(getSnapshot()).toHaveLength(0);
  });

  it('never auto-dismisses an error (Infinity lifetime)', () => {
    add({ tone: 'error', message: 'boom' });
    vi.advanceTimersByTime(60_000 * 60);
    expect(getSnapshot()).toHaveLength(1);
  });

  it('dismisses each toast on its OWN clock, not the newest one', () => {
    add({ tone: 'info', message: 'first', duration: 1000 });
    add({ tone: 'info', message: 'second', duration: 5000 });

    vi.advanceTimersByTime(1000);
    expect(getSnapshot().map((t) => t.message)).toEqual(['second']);

    vi.advanceTimersByTime(4000);
    expect(getSnapshot()).toHaveLength(0);
  });
});

describe('pause / resume', () => {
  it('does not dismiss while paused, even past the lifetime', () => {
    const id = add({ tone: 'success', message: 'reading', duration: 2000 });
    setPaused(id, true);

    vi.advanceTimersByTime(10_000);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0].paused).toBe(true);
  });

  it('resumes the REMAINING time, not a fresh full lifetime', () => {
    const id = add({ tone: 'success', message: 'x', duration: 1000 });

    // 600ms of the 1000ms budget is consumed...
    vi.advanceTimersByTime(600);
    setPaused(id, true);

    // ...then paused for a long time (that must not count).
    vi.advanceTimersByTime(30_000);
    setPaused(id, false);

    // Only the remaining 400ms should be left. 399ms is not enough.
    vi.advanceTimersByTime(399);
    expect(getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getSnapshot()).toHaveLength(0);
  });

  it('resuming an already-running toast is idempotent', () => {
    const id = add({ tone: 'success', message: 'x', duration: 1000 });
    setPaused(id, false); // not paused → no-op
    vi.advanceTimersByTime(999);
    expect(getSnapshot()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getSnapshot()).toHaveLength(0);
  });

  it('pausing an unknown id is a no-op', () => {
    expect(() => setPaused(123, true)).not.toThrow();
  });

  it('a sticky (error) toast resumes without ever arming a timer', () => {
    const id = add({ tone: 'error', message: 'boom' });
    setPaused(id, true);
    setPaused(id, false);
    vi.advanceTimersByTime(120_000);
    expect(getSnapshot()).toHaveLength(1);
  });
});

describe('visibleToasts() cap', () => {
  it('returns everything when at or under the cap', () => {
    for (let i = 0; i < MAX_VISIBLE; i++) add({ tone: 'info', message: String(i) });
    expect(visibleToasts(getSnapshot())).toHaveLength(MAX_VISIBLE);
  });

  it('shows the NEWEST MAX_VISIBLE and drops the oldest from the view', () => {
    const ids = Array.from({ length: MAX_VISIBLE + 2 }, (_, i) =>
      add({ tone: 'info', message: String(i), duration: Infinity }),
    );
    const shown = visibleToasts(getSnapshot());
    expect(shown).toHaveLength(MAX_VISIBLE);
    // The last MAX_VISIBLE ids win; nothing else is shown.
    expect(shown.map((t) => t.id)).toEqual(ids.slice(ids.length - MAX_VISIBLE));
  });

  it('a suppressed toast is still in the store (cap does not drop data)', () => {
    for (let i = 0; i < MAX_VISIBLE + 2; i++) {
      add({ tone: 'info', message: String(i), duration: Infinity });
    }
    expect(getSnapshot().length).toBe(MAX_VISIBLE + 2);
  });
});

describe('subscribe()', () => {
  it('notifies subscribers on add and on dismiss', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);

    const id = add({ tone: 'info', message: 'a' });
    expect(listener).toHaveBeenCalledTimes(1);

    dismiss(id);
    expect(listener).toHaveBeenCalledTimes(2);

    unsub();
  });

  it('stops notifying after unsubscribe', () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    unsub();
    add({ tone: 'info', message: 'a' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies when an auto-dismiss fires', () => {
    const listener = vi.fn();
    subscribe(listener);
    add({ tone: 'success', message: 'a', duration: 1000 });
    listener.mockClear();

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalled();
  });
});

describe('the `toast` facade', () => {
  it('routes each helper to the matching tone', () => {
    toast.success('s');
    toast.error('e');
    toast.info('i');
    toast.warning('w');
    expect(getSnapshot().map((t) => t.tone)).toEqual([
      'success',
      'error',
      'info',
      'warning',
    ]);
  });

  it('exposes dismiss and dismissAll', () => {
    const id = toast.info('i');
    toast.dismiss(id);
    expect(getSnapshot()).toHaveLength(0);
    toast.warning('w');
    toast.dismissAll();
    expect(getSnapshot()).toHaveLength(0);
  });
});
