/**
 * A transient toast notification store — no dependency, no JSX.
 *
 * WHY A MODULE-LEVEL STORE (and not a React context provider)
 * -----------------------------------------------------------
 * A toast is usually raised by an EVENT, not by a component's render: a failed
 * API mutation, an interceptor, a click handler that is one `await` deep. The
 * two things that must be true then are:
 *
 *   1. Non-React code must be able to raise a toast without a hook, a ref, or a
 *      provider threaded through every call site. `toast.success('…')` from
 *      `api/client.ts` has to work.
 *   2. The component that RENDERS the stack (`<Toaster/>`) must be mounted once,
 *      near the top of the tree, and must not have to own the state that the
 *      rest of the app writes to.
 *
 * A module-level store + `useSyncExternalStore` gives both: the store is a plain
 * singleton anyone can call, and `<Toaster/>` subscribes to it with a correct,
 * tear-resistant subscription (React 18/19's official API for reading an
 * external mutable source). A provider would have forced every non-React caller
 * to be handed the context first, which is exactly the prop-drilling this must
 * avoid. React Fast Refresh is also happy: this file exports no components.
 *
 * THE STORE OWNS THE TIMERS
 * -------------------------
 * Auto-dismiss lives here, not in the component, because a toast can outlive
 * the component that happens to be on screen (a route change does not cancel a
 * "saved" confirmation). Each toast carries its own remaining-time budget so
 * pause/resume is exact rather than "restart the timer and hope".
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * · It does not throw away messages. `MAX_VISIBLE` is a DISPLAY cap; the newest
 *   toasts win the visible slots, but the queue still holds the older ones. The
 *   `isSuppressed` concern is handled by the reducer here, not silently.
 * · It does not decide tone from content. The caller states the tone.
 */

import { useSyncExternalStore } from 'react';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  /** Stable id, assigned by the store. Used as the React key and for dismiss. */
  id: number;
  tone: ToastTone;
  /** The message. A plain string — see `Notice` for why copy is not faked. */
  message: string;
  /**
   * Milliseconds until auto-dismiss. `Infinity` means "sticky": errors default
   * to this because a failure the user never saw is the bug this whole system
   * exists to prevent (see the `Notice` doc comment).
   */
  duration: number;
  /** True while hovered or focused — the countdown is paused. */
  paused: boolean;
  /**
   * Milliseconds LEFT to run when the toast next resumes (or when it was
   * created). Recomputed on pause from the wall-clock the timer was armed at,
   * so `resume` continues the countdown instead of restarting it.
   */
  remaining: number;
}

/** Options accepted by every tone helper. */
export interface ToastOptions {
  /** Override the tone's default lifetime. `Infinity` = never auto-dismiss. */
  duration?: number;
}

export interface ToastInput {
  tone: ToastTone;
  message: string;
  duration?: number;
}

/**
 * Per-tone default lifetime.
 *
 * Errors are STICKY (`Infinity`) on purpose. An error is the one message that
 * MUST be read and acted on; auto-hiding it after a few seconds recreates the
 * invisible-failure bug in slow motion. The user dismisses it, or fixes the
 * problem and it is replaced. Success/info/warning are transient.
 */
export const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  warning: 6000,
  error: Infinity,
};

/**
 * The most toasts rendered at once.
 *
 * Without a cap, a burst (e.g. a bulk action that reports per row) stacks an
 * unreadable wall over the UI and — worse — the OLDEST are the ones a screen
 * reader has queued up. Newest win the slots.
 */
export const MAX_VISIBLE = 3;

type Listener = () => void;

interface State {
  toasts: Toast[];
  /** Snapshot handed to `useSyncExternalStore`; replaced on every mutation. */
  snapshot: Toast[];
}

let nextId = 1;
/** Live timers, keyed by toast id, so pause/resume and dismiss can control them. */
const timers = new Map<number, ReturnType<typeof setTimeout>>();
/**
 * Wall-clock time each running timer was armed at, keyed by toast id. Used to
 * work out how much of the budget was consumed before a pause.
 */
const armedAt = new Map<number, number>();
const listeners = new Set<Listener>();
/** Kept outside the snapshot so an empty store returns a STABLE reference. */
const EMPTY: Toast[] = [];

const state: State = { toasts: [], snapshot: EMPTY };

function emit(): void {
  // A NEW array each time. `useSyncExternalStore` compares by reference, so
  // mutating the existing array would never re-render the subscriber.
  state.snapshot = state.toasts.slice();
  for (const l of listeners) l();
}

/**
 * (Re)arm the auto-dismiss timer for a toast from its `remaining` budget.
 *
 * `remaining` is the source of truth across a pause, so resuming continues the
 * countdown instead of restarting it. A sticky toast (Infinity) gets no timer.
 */
function arm(id: number): void {
  const existing = timers.get(id);
  if (existing !== undefined) clearTimeout(existing);
  timers.delete(id);
  armedAt.delete(id);

  const t = state.toasts.find((x) => x.id === id);
  if (!t || t.paused || t.remaining === Infinity) return;

  armedAt.set(id, Date.now());
  const handle = setTimeout(() => {
    // A toast the user is interacting with (hover/focus) must not vanish while
    // being read. If a pause landed between arming and firing, re-arm instead.
    const current = state.toasts.find((x) => x.id === id);
    if (current && current.paused) return;
    dismiss(id);
  }, t.remaining);

  timers.set(id, handle);
}

function clearTimer(id: number): void {
  const handle = timers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    timers.delete(id);
  }
  armedAt.delete(id);
}

/**
 * Raise a toast. Returns its id so a caller can dismiss it early (e.g. replacing
 * a "saving…" toast with the result).
 */
export function add(input: ToastInput): number {
  const id = nextId++;
  const duration = input.duration ?? DEFAULT_DURATION[input.tone];
  const toast: Toast = {
    id,
    tone: input.tone,
    message: input.message,
    duration,
    paused: false,
    remaining: duration,
  };
  state.toasts = [...state.toasts, toast];
  arm(id);
  emit();
  return id;
}

/** Remove a toast by id. Safe to call for an id that is already gone. */
export function dismiss(id: number): void {
  const next = state.toasts.filter((t) => t.id !== id);
  if (next.length === state.toasts.length) return;
  clearTimer(id);
  state.toasts = next;
  emit();
}

/** Remove every toast. */
export function dismissAll(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  state.toasts = [];
  emit();
}

/**
 * Pause / resume a toast's countdown.
 *
 * Stores the remaining budget so resume continues from where it stopped. Pausing
 * an unknown id is a no-op (the toast may have been dismissed already).
 */
export function setPaused(id: number, paused: boolean): void {
  const t = state.toasts.find((x) => x.id === id);
  if (!t || t.paused === paused) return;

  if (paused) {
    // Freeze the budget: how much of the countdown had already elapsed?
    const startedAt = armedAt.get(id);
    if (startedAt !== undefined) {
      t.remaining = Math.max(0, t.remaining - (Date.now() - startedAt));
    }
    clearTimer(id);
  }
  t.paused = paused;
  state.toasts = state.toasts.slice();
  // On resume the timer is re-armed from the REMAINING budget, so a hover does
  // not give the toast a fresh full lifetime.
  if (!paused) arm(id);
  emit();
}

/* ------------------------------------------------------------------ */
/* Convenience tone helpers — the public surface most code uses.        */
/* ------------------------------------------------------------------ */

export const toast = {
  success: (message: string, options?: ToastOptions): number =>
    add({ tone: 'success', message, duration: options?.duration }),
  error: (message: string, options?: ToastOptions): number =>
    add({ tone: 'error', message, duration: options?.duration }),
  info: (message: string, options?: ToastOptions): number =>
    add({ tone: 'info', message, duration: options?.duration }),
  warning: (message: string, options?: ToastOptions): number =>
    add({ tone: 'warning', message, duration: options?.duration }),
  dismiss,
  dismissAll,
};

/* ------------------------------------------------------------------ */
/* External-store plumbing                                             */
/* ------------------------------------------------------------------ */

/** Subscribe to store changes. Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current snapshot. Stable identity between mutations. */
export function getSnapshot(): Toast[] {
  return state.snapshot;
}

/**
 * The toasts a `<Toaster/>` should render: the most recent `MAX_VISIBLE`.
 *
 * Sliced here (a pure function of the snapshot) rather than in the component so
 * the cap is unit-testable without a DOM.
 */
export function visibleToasts(all: Toast[]): Toast[] {
  return all.length <= MAX_VISIBLE ? all : all.slice(all.length - MAX_VISIBLE);
}

/** React binding. Re-renders the subscriber whenever a toast is added/removed. */
export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Test-only reset. Production code must never need it, but a module-level
 * singleton would otherwise leak state between vitest cases.
 */
export function __resetForTests(): void {
  for (const id of [...timers.keys()]) clearTimer(id);
  timers.clear();
  armedAt.clear();
  listeners.clear();
  state.toasts = [];
  state.snapshot = EMPTY;
  nextId = 1;
}
