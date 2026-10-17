/**
 * Scan-session API types — mirrors the Laravel contract EXACTLY.
 *
 * Source of truth (verified against the running backend, not assumed):
 *   - `app/Http/Controllers/Api/ScanSessionController.php::presentSession()`
 *     (a STRICT whitelist — anything not listed there never leaves the server)
 *   - `docs/SCAN-SESSION-API-CONTRACT.md` (5 routes, 25 PHPUnit tests)
 *
 * ⚠️ `pairing_url` and `pairing_qr_svg` are returned on CREATE ONLY and are
 * `null` on every subsequent `GET`. They must be captured once at creation and
 * never awaited from polling — the backend deliberately does not regenerate the
 * QR on each poll (that would be pure work: polling runs every 2s).
 *
 * ⚠️ `platform` is ALWAYS `null` in this contract version. Do not branch on it.
 */

/** Session lifecycle, as stored server-side. */
export type ScanSessionStatus = 'waiting' | 'paired' | 'expired' | 'closed';

/** A device present in the session. `platform` is always `null` today. */
export interface ScanSessionDevice {
  name: string | null;
  platform: string | null;
}

/** A device that asked to pair while another one was already active. */
export interface ScanSessionPendingDevice {
  name: string | null;
}

/**
 * The `data` payload of a scan session — the whitelist above, verbatim.
 *
 * `pairing_code` is always present. `pairing_url` / `pairing_qr_svg` are present
 * only on the 201 create response.
 */
export interface ApiScanSession {
  id: string;
  status: ScanSessionStatus;
  pairing_code: string;
  pairing_url?: string | null;
  pairing_qr_svg?: string | null;
  expires_at: string | null;
  seconds_remaining: number;
  device: ScanSessionDevice | null;
  devices: (ScanSessionDevice & { active: boolean })[];
  pending_device: ScanSessionPendingDevice | null;
  /** Last barcode received and not yet consumed, or `null`. */
  barcode: string | null;
}

/**
 * The create response, narrowed to the fields that only exist there.
 *
 * `pairing_url` + `pairing_qr_svg` are REQUIRED in this alias on purpose: the
 * create controller always supplies them, and making them required here forces
 * callers to capture the QR at creation time (they cannot defer it to a later
 * poll, where the values are gone).
 */
export type ApiScanSessionCreated = ApiScanSession & {
  pairing_url: string;
  pairing_qr_svg: string;
};

/** Result of a successful device pairing. */
export interface ApiScanSessionPairing {
  name: string | null;
  platform: string | null;
  /**
   * 🔑 Returned ONCE, here only. Stored hashed (sha256) server-side and never
   * retrievable again. The holder is the ONLY capability that may POST a
   * barcode.
   */
  device_token: string;
}

/**
 * Extract `sid` + `token` from a `daway://pair?sid=…&token=…` pairing URL.
 *
 * The contract is explicit that these live in the QUERY STRING, not the path —
 * parsing the path yields nothing. Returns `null` when either half is missing,
 * so callers can treat a malformed QR as "no session" rather than crash.
 *
 * Note: this is the ONLY place the pairing URL is read, and the URL is never
 * stored by the web client (the QR image is rendered once from the SVG the
 * backend already produced).
 */
export function parsePairingUrl(
  url: string | null | undefined,
): { sid: string; token: string } | null {
  if (!url) return null;
  try {
    // `daway://pair?sid=…&token=…` is a valid URL for the WHATWG parser; the
    // custom scheme keeps the query after the first `?`. `searchParams` handles
    // percent-decoding and `&` splitting for us.
    const parsed = new URL(url);
    const sid = parsed.searchParams.get('sid');
    const token = parsed.searchParams.get('token');
    if (!sid || !token) return null;
    return { sid, token };
  } catch {
    return null;
  }
}
