import { useLang } from '@/lib/lang/LanguageContext';
import { Modal } from '@/components/ui';
import { useScanSessionApi } from '@/auth/authHooks';
import { useScanSession, type ScanSessionState } from './useScanSession';

/**
 * Phone-scanner pairing modal — the web half of the feature.
 *
 * It renders against the CSS vocabulary that ALREADY EXISTS in
 * `styles/pages/pharmacy-accounting.css` (`.ac-session-status`, `.ac-pair-card`,
 * `.ac-pair-qr`, `.ac-device-row`, `.ac-device-request`, …) — the classes were
 * authored for the Blade page long ago and never had a consumer. Using them
 * means no new design tokens and no visual drift, only real content in
 * pre-approved slots.
 *
 * The QR image is the server's own SVG (`pairing_qr_svg`), injected via
 * `dangerouslySetInnerHTML`. That is safe here and only here: the string comes
 * from OUR backend's `bacon/bacon-qr-code` renderer, never from user input, and
 * the endpoint is behind `auth:sanctum` + `role:pharmacy`. Rendering it as an
 * `<img src>` would require a data-URI round-trip for no benefit.
 */

const STATUS_CLASS: Record<ScanSessionState, string> = {
  idle: '',
  creating: 'is-connecting',
  waiting: 'is-waiting',
  connecting: 'is-connecting',
  paired: 'is-connected',
  scanning: 'is-scanning',
  received: 'is-received',
  expired: 'is-expired',
  error: 'is-error',
};

export function ScanSessionModal({
  open,
  onClose,
  onBarcode,
}: {
  open: boolean;
  /** Delivers the raw barcode to the POS. Resolve `true` when accepted. */
  onBarcode: (code: string) => Promise<boolean> | boolean;
  onClose: () => void;
}) {
  const { STR } = useLang();
  const S = STR.accounting.scanner;
  const api = useScanSessionApi();

  const {
    state,
    qrSvg,
    pairingCode,
    secondsRemaining,
    error,
    start,
    approveDevice,
  } = useScanSession(api, { onBarcode, enabled: open });

  const statusLabel: Record<ScanSessionState, string> = {
    idle: S.state_idle,
    creating: S.creating,
    waiting: S.state_waiting,
    connecting: S.state_connecting,
    paired: S.state_connected,
    scanning: S.state_scanning,
    received: S.state_received,
    expired: S.state_expired,
    error: S.state_error,
  };

  return (
    <Modal
      open={open}
      title={S.modal_title}
      onClose={onClose}
      footer={
        state === 'expired' || state === 'error' ? (
          <button type="button" className="ac-scan-btn is-solid" onClick={start}>
            {S.new_session}
          </button>
        ) : (
          <button type="button" className="ac-scan-btn is-outline" onClick={onClose}>
            {S.close_scanner}
          </button>
        )
      }
    >
      <p style={{ marginTop: 0, color: 'var(--ink-soft)' }}>{S.modal_sub}</p>

      {/* ---------- Live status strip ---------- */}
      <div className={`ac-session-status ${STATUS_CLASS[state]}`}>
        <span className="ac-session-dot" aria-hidden="true" />
        <span className="ac-session-label">{statusLabel[state]}</span>
        {state !== 'idle' && state !== 'expired' && state !== 'error' && (
          <span className="ac-session-timer">
            {Math.max(0, secondsRemaining)}
            {S.seconds_unit}
          </span>
        )}
      </div>

      {/* ---------- Error ---------- */}
      {state === 'error' && (
        <p className="ac-phone-foot-note" role="alert" style={{ color: 'var(--ac-red-text)' }}>
          {error?.message ?? S.create_failed}
        </p>
      )}

      {/* ---------- Pairing card ---------- */}
      {(state === 'waiting' || state === 'connecting' || state === 'creating') && (
        <div className="ac-pair-card">
          <div className="ac-pair-qr">
            {qrSvg ? (
              <div
                className="ac-pair-qr-render"
                role="img"
                aria-label={S.qr_alt}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            ) : (
              <div className="ac-pair-qr-placeholder" aria-label={S.qr_pending_alt}>
                <span className="ac-pair-qr-cap is-pending">{S.qr_pending}</span>
              </div>
            )}
            <p className="ac-pair-qr-cap">{S.qr_caption}</p>
          </div>

          <div className="ac-pair-code-box">
            <span className="ac-pair-code-label">{S.pairing_code}</span>
            <code className="ac-pair-code">{pairingCode ?? '————————'}</code>
            <p className="ac-pair-code-hint">{S.pairing_code_hint}</p>
          </div>
        </div>
      )}

      {/* ---------- Connected device ---------- */}
      {(state === 'paired' || state === 'scanning' || state === 'received') && (
        <>
          <div className="ac-devices-head">
            <span className="ac-devices-title">{S.devices_title}</span>
          </div>
          <ul className="ac-devices-list">
            <li className="ac-device-row is-active">
              <span className="ac-device-icon" aria-hidden="true">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="6" y="2" width="12" height="20" rx="2" />
                  <line x1="10" y1="18" x2="14" y2="18" />
                </svg>
              </span>
              <span className="ac-device-name">
                {/* `device_name` is optional in the contract — fall back. */}
                {STR.accounting.scanner.device_active}
              </span>
              <span className="ac-device-badge">{S.device_active}</span>
            </li>
          </ul>
        </>
      )}

      {/* ---------- A second device is asking to pair ---------- */}
      {state === 'connecting' && (
        <div className="ac-device-request">
          <p className="ac-device-request-title">{S.device_request_title}</p>
          <p className="ac-device-request-actions">
            <button type="button" className="ac-scan-btn is-solid" onClick={() => void approveDevice()}>
              {S.approve}
            </button>
          </p>
        </div>
      )}

      {/* ---------- Expired ---------- */}
      {state === 'expired' && (
        <p className="ac-phone-foot-note">{S.session_expired_note}</p>
      )}

      <p className="ac-phone-foot-note">{S.no_camera_note}</p>
    </Modal>
  );
}
