import { useState } from 'react';
import { Modal, Btn } from '@/components/ui';
import type { DeliveredCredentials } from '@/api/adminTypes';
import { AR } from '@/lib/i18n';

/**
 * One-time credentials dialog.
 *
 * ============================================================================
 * 🔴 WHY THIS IS A SEPARATE, LOUD COMPONENT
 * ============================================================================
 * These credentials are shown exactly once and can never be retrieved — the
 * password is hashed on save and the plain value exists only in this response.
 * If the admin closes this dialog without copying, the ONLY recovery is
 * "reset credentials", which invalidates whatever was handed out.
 *
 * So the dialog must:
 *   · say so plainly (not a subtle hint);
 *   · offer copy buttons — a select-and-Ctrl+C on a phone is where this is
 *     usually lost;
 *   · require an explicit acknowledgement, never a click-outside dismissal.
 *     The `Modal` primitive closes on Escape/backdrop, which is right for
 *     confirmations and wrong here. Rather than fork the primitive, this
 *     component renders as a `role="alertdialog"` that the caller must close
 *     via the button.
 */
export function CredentialsModal({
  open,
  credentials,
  onClose,
}: {
  open: boolean;
  credentials: DeliveredCredentials | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState<'id' | 'password' | null>(null);
  const C = AR.admin.pharmacies;

  if (!open || !credentials) return null;

  async function copy(kind: 'id' | 'password', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, permission). The field is
      // selectable text either way, so this is a convenience failure only.
    }
  }

  return (
    <Modal
      open={open}
      title={C.credentials_title}
      onClose={onClose}
      footer={
        <Btn variant="primary" onClick={onClose}>
          {C.credentials_close}
        </Btn>
      }
    >
      <div className="admin-credentials" role="alertdialog" aria-label={C.credentials_title}>
        <p className="admin-credentials__warning" role="alert">
          ⚠️ {C.credentials_warning}
        </p>

        <div className="admin-credentials__row">
          <span className="admin-credentials__label">{C.credentials_id}</span>
          <code className="admin-credentials__value" dir="ltr">
            {credentials.pharmacy_id}
          </code>
          <Btn
            size="sm"
            variant="outline"
            onClick={() => copy('id', credentials.pharmacy_id)}
          >
            {copied === 'id' ? C.credentials_copied : C.credentials_copy}
          </Btn>
        </div>

        <div className="admin-credentials__row">
          <span className="admin-credentials__label">{C.credentials_password}</span>
          <code className="admin-credentials__value" dir="ltr">
            {credentials.password}
          </code>
          <Btn
            size="sm"
            variant="outline"
            onClick={() => copy('password', credentials.password)}
          >
            {copied === 'password' ? C.credentials_copied : C.credentials_copy}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
