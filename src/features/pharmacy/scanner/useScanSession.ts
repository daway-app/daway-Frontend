import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/api/errors';
import type { ApiScanSession } from '@/api/scanSessionTypes';
import type { ScanSessionApi } from '@/api/scanSessionApi';

/**
 * The web side of the phone-scanner session, as a state machine.
 *
 * ── The nine states, and why this set ────────────────────────────────────
 * They are the states the (already existing) Arabic copy describes —
 * `STR.accounting.scanner.state_*` — so the UI text needed no invention:
 *
 *   idle        nothing started
 *   creating    POST /scan-sessions in flight
 *   waiting     session created, QR shown, no device yet
 *   connecting  a device is pairing (pending_device appeared)
 *   paired      phone connected, ready
 *   scanning    a barcode arrived and is being resolved by the POS
 *   received    the POS accepted it (transient — back to `paired` after)
 *   expired     410/404 — the QR is dead, a new session is required
 *   error       network/server failure (recoverable via `retry`)
 *
 * ── Polling cadence ──────────────────────────────────────────────────────
 * 2000ms, matching the contract (§8.5). The contract also FLAGS this: the
 * global `api` limit is 60/min per user, and a 5-minute session at 2s ≈ 150
 * requests — two tabs on one account can 429. This hook therefore:
 *   · stops polling the moment the state is terminal (`expired`),
 *   · backs off on 429 by honouring `Retry-After`,
 *   · never issues overlapping requests (the next tick is scheduled only after
 *     the previous resolves).
 *
 * ── Barcode delivery is CONSUMED ONCE ────────────────────────────────────
 * The server keeps `scanned_barcode` until the session closes. If we naively
 * delivered it on every poll, one scan would add the item repeatedly. We track
 * the last delivered code and only call `onBarcode` when it CHANGES — the same
 * code twice in a row is a re-read, not a second scan.
 *
 * ── What this hook deliberately does NOT do ──────────────────────────────
 * It never touches the cart. It hands the raw barcode STRING to `onBarcode`;
 * turning that string into a cart line is the POS screen's job, through the
 * barcode engine it already owns. Keeping the boundary here is what makes this
 * feature safe to add without touching sale/order/coupon logic.
 */

export type ScanSessionState =
  | 'idle'
  | 'creating'
  | 'waiting'
  | 'connecting'
  | 'paired'
  | 'scanning'
  | 'received'
  | 'expired'
  | 'error';

const POLL_INTERVAL_MS = 2000;
/** Hard cap on a `Retry-After` backoff, so a bad header cannot stall the UI. */
const MAX_BACKOFF_MS = 30_000;

export interface UseScanSessionResult {
  state: ScanSessionState;
  /** The live session (null until `creating` resolves). */
  session: ApiScanSession | null;
  /** Server-rendered QR SVG — present only right after creation. */
  qrSvg: string | null;
  /** Human-typed fallback for the QR, shown under the image. */
  pairingCode: string | null;
  /** Server-computed seconds left — never derived from the device clock. */
  secondsRemaining: number;
  /** Error to render, if any. */
  error: ApiError | null;
  /** Start a fresh session (idempotent: closes any session already open). */
  start: () => void;
  /** Manually close and reset. Safe to call repeatedly. */
  stop: () => void;
  /** Approve the pending device (maps to `pairDirect` with the pharmacy Bearer). */
  approveDevice: () => Promise<void>;
  /** Refresh the state now instead of waiting for the next tick. */
  refresh: () => void;
}

export function useScanSession(
  api: ScanSessionApi,
  options: {
    /** Called ONCE per distinct barcode. Return a promise to keep the UI in
     *  `scanning` until it resolves; resolve `true` when the POS accepted it. */
    onBarcode: (code: string) => Promise<boolean> | boolean;
    /** Polling only runs while this is true (i.e. the modal is open). */
    enabled: boolean;
  },
): UseScanSessionResult {
  const { onBarcode, enabled } = options;

  const [state, setState] = useState<ScanSessionState>('idle');
  const [session, setSession] = useState<ApiScanSession | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // Refs, not state: these are read inside the polling loop and must not
  // re-create the interval on every render.
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef<string | null>(null);
  const lastDeliveredRef = useRef<string | null>(null);
  const deliveredOnceRef = useRef(false);
  const onBarcodeRef = useRef(onBarcode);
  const mountedRef = useRef(true);

  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  });

  useEffect(
    () => () => {
      mountedRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    [],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Best-effort close. Never throws — cleanup must not mask a real error. */
  const closeRemote = useCallback(
    (id: string | null) => {
      if (!id) return;
      void api.close(id).catch(() => undefined);
    },
    [api],
  );

  /**
   * One polling tick: fetch, interpret, deliver a barcode if a NEW one arrived,
   * then schedule the next tick. The next tick is scheduled ONLY after this one
   * settles, so a slow network can never stack requests.
   */
  const tick = useCallback(async () => {
    const id = idRef.current;
    if (!id || !mountedRef.current) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let nextDelay = POLL_INTERVAL_MS;

    try {
      const fresh = await api.show(id, controller.signal);
      if (!mountedRef.current) return;

      setError(null);
      setSession(fresh);

      // A pending device means someone is mid-pairing.
      if (fresh.pending_device) {
        setState('connecting');
      } else if (fresh.device) {
        // Only downgrade to `paired` if we are not mid-delivery — `scanning`
        // and `received` are transient states owned by the delivery branch.
        setState((prev) =>
          prev === 'scanning' || prev === 'received' ? prev : 'paired',
        );
      } else {
        setState('waiting');
      }

      // ── Barcode delivery: exactly once per distinct code ──────────────
      const code = fresh.barcode?.trim() ?? '';
      if (code && code !== lastDeliveredRef.current) {
        lastDeliveredRef.current = code;
        deliveredOnceRef.current = false;
        setState('scanning');

        let accepted = false;
        try {
          accepted = await onBarcodeRef.current(code);
        } catch {
          accepted = false;
        }
        if (!mountedRef.current) return;

        if (accepted) {
          setState('received');
          deliveredOnceRef.current = true;
          // Let `received` be visible briefly, then return to `paired`.
          window.setTimeout(() => {
            if (mountedRef.current && idRef.current === id) setState('paired');
          }, 900);
        } else {
          // Not found / out of stock — the POS shows its own message; we just
          // go back to being ready for the next scan.
          setState('paired');
        }
      } else if (!code) {
        // Server cleared the slot (new session or consumed) — allow a re-scan
        // of the same code later without waiting for the session to end.
        lastDeliveredRef.current = null;
      }
    } catch (err) {
      if (!mountedRef.current) return;

      if (err instanceof ApiError) {
        // 410 / 404 both mean "this session is over" — the ONLY correct UI is
        // "create a new session", never a generic error.
        if (err.status === 410 || err.status === 404) {
          setState('expired');
          setError(null);
          idRef.current = null;
          setSession(null);
          return; // terminal — do not reschedule
        }
        if (err.kind === 'rate_limited') {
          // Respect the server's backoff instead of hammering it.
          const after = (err.retryAfterSeconds ?? 5) * 1000;
          nextDelay = Math.min(Math.max(after, POLL_INTERVAL_MS), MAX_BACKOFF_MS);
        } else {
          setError(err);
          setState('error');
        }
      } else {
        setError(new ApiError({ kind: 'unknown', status: null }));
        setState('error');
      }
    } finally {
      if (mountedRef.current && idRef.current) {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          void tick();
        }, nextDelay);
      }
    }
  }, [api, clearTimer]);

  /** Create a session and hand the QR to the UI. */
  const start = useCallback(() => {
    // Close whatever is open first — one live session per pharmacy (the backend
    // enforces this anyway by closing previous ones on create).
    closeRemote(idRef.current);
    idRef.current = null;
    lastDeliveredRef.current = null;

    setState('creating');
    setError(null);
    setSession(null);
    setQrSvg(null);

    void (async () => {
      try {
        const created = await api.create();
        if (!mountedRef.current) {
          // Unmounted while creating → do not leak a live session.
          closeRemote(created.id);
          return;
        }
        idRef.current = created.id;
        setSession(created);
        // QR + pairing code are captured HERE and never awaited from polling.
        setQrSvg(created.pairing_qr_svg ?? null);
        setState('waiting');
        void tick();
      } catch (err) {
        if (!mountedRef.current) return;
        setError(
          err instanceof ApiError
            ? err
            : new ApiError({ kind: 'unknown', status: null }),
        );
        setState('error');
      }
    })();
  }, [api, closeRemote, tick]);

  const stop = useCallback(() => {
    clearTimer();
    abortRef.current?.abort();
    closeRemote(idRef.current);
    idRef.current = null;
    lastDeliveredRef.current = null;
    setSession(null);
    setQrSvg(null);
    setError(null);
    setState('idle');
  }, [clearTimer, closeRemote]);

  /** Human approves the pending device from the web (pharmacy Bearer pair). */
  const approveDevice = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    try {
      await api.pairDirect(id, session?.pending_device?.name ?? undefined);
      void tick();
    } catch (err) {
      if (err instanceof ApiError && (err.status === 410 || err.status === 404)) {
        setState('expired');
        idRef.current = null;
        setSession(null);
        return;
      }
      setState('error');
      setError(
        err instanceof ApiError ? err : new ApiError({ kind: 'unknown', status: null }),
      );
    }
  }, [api, session?.pending_device?.name, tick]);

  const refresh = useCallback(() => {
    clearTimer();
    void tick();
  }, [clearTimer, tick]);

  // Drive the lifecycle from `enabled`: opening starts a session, closing ends
  // it. This is what makes the modal self-contained — the parent only toggles
  // a boolean and supplies the barcode sink.
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    // `start`/`stop` are stable per api instance; `enabled` is the only trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return {
    state,
    session,
    qrSvg,
    pairingCode: session?.pairing_code ?? null,
    secondsRemaining: session?.seconds_remaining ?? 0,
    error,
    start,
    stop,
    approveDevice,
    refresh,
  };
}
