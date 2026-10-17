import type { ApiClient } from './client';
import type { ApiSuccess } from './types';
import type {
  ApiScanSession,
  ApiScanSessionCreated,
  ApiScanSessionPairing,
} from './scanSessionTypes';

/**
 * Scan-session endpoints — the WEB side of "phone as a remote barcode reader".
 *
 * Four routes (the FIFTH — `POST /{id}/barcode` — belongs to the mobile app,
 * which authenticates with a device token, NOT the pharmacy Bearer; it is
 * intentionally absent here). Every path below was read out of
 * `routes/api.php` and has its `data` shape pinned in `scanSessionTypes.ts`.
 *
 *   POST   /api/pharmacy/scan-sessions            Bearer  → create (+QR)
 *   GET    /api/pharmacy/scan-sessions/{id}       Bearer  → status (poll)
 *   DELETE /api/pharmacy/scan-sessions/{id}       Bearer  → close
 *   POST   /api/pharmacy/scan-sessions/{id}/pair  Bearer  → human approval
 *
 * ── Why `show` is a plain fetch and not a `useApiQuery` ──────────────────
 * Polling drives it (`refetchInterval`, 2000ms) and, more importantly, the
 * session is MUTABLE state the hook already owns: a 410 means "expired" and
 * must transition the state machine, which a cached query would not express.
 * The hook calls `show` directly on its own interval.
 *
 * ── Why `pairDirect` exists though the phone does the pairing ─────────────
 * `POST /pair` accepts the pharmacy Bearer as well, and that path means the
 * USER APPROVED a device that was showing as pending. It is the human half of
 * the takeover flow (`409` on the phone → `pending_device` appears here →
 * the pharmacist clicks [السماح] → this call). Without it the pending device
 * would have no way to be accepted.
 */

const S = {
  base: '/api/pharmacy/scan-sessions',
} as const;

export function createScanSessionApi(client: ApiClient) {
  return {
    /** Create a session; the QR (`pairing_qr_svg`) is returned HERE and only here. */
    async create(signal?: AbortSignal): Promise<ApiScanSessionCreated> {
      const res = await client.post<ApiSuccess<ApiScanSessionCreated>>(
        S.base,
        {},
        { signal },
      );
      return res.data;
    },

    /**
     * Poll one session.
     *
     * `410` (expired) and `404` (not yours / gone) both surface as `ApiError`
     * from the client; the hook decides what they mean for the UI. `skipRefresh`
     * is NOT set — a genuinely expired Bearer should still rotate once.
     */
    async show(id: string, signal?: AbortSignal): Promise<ApiScanSession> {
      const res = await client.get<ApiSuccess<ApiScanSession>>(
        `${S.base}/${id}`,
        { signal },
      );
      return res.data;
    },

    /**
     * Close a session. Idempotent server-side (repeat close = success), so this
     * is safe to call from both "modal closed" and "component unmounted".
     * Failures are swallowed by the caller — closing is best-effort cleanup.
     */
    async close(id: string): Promise<void> {
      await client.delete<ApiSuccess<null>>(`${S.base}/${id}`);
    },

    /**
     * Approve the pending device by re-pairing from the web.
     *
     * The backend treats a pharmacy-Bearer pair as an explicit human decision:
     * it REPLACES the active device and clears the old `device_token` (so a
     * rejected phone loses its ability immediately). The phone must then call
     * `pair` again to receive its new token — that half belongs to the app.
     */
    async pairDirect(
      id: string,
      deviceName?: string,
      signal?: AbortSignal,
    ): Promise<ApiScanSessionPairing> {
      const res = await client.post<ApiSuccess<Omit<ApiScanSessionPairing, 'device_token'>>>(
        `${S.base}/${id}/pair`,
        deviceName ? { device_name: deviceName } : {},
        { signal },
      );
      // The web path never returns a `device_token` (it is the phone's secret).
      // Typing it as absent keeps us from ever holding one on this side.
      return { ...res.data, device_token: '' };
    },
  };
}

export type ScanSessionApi = ReturnType<typeof createScanSessionApi>;
