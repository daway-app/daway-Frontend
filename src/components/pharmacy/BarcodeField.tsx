import { useState } from 'react';
import { AR } from '@/lib/i18n';
import { Modal } from '@/components/ui';

/**
 * Shared barcode input — port of the Blade components:
 *   `components/accounting/barcode-input.blade.php`
 *   `components/accounting/barcode-scan-button.blade.php`
 *   `components/accounting/phone-scanner-button.blade.php`
 *
 * The Blade page hosts three input paths that all end in the SAME field:
 *   1. typing, 2. a USB reader (acts as a keyboard + Enter), 3. the phone scanner.
 * Only the field is real here (B3: no network). The scan button focuses the
 * field and the phone button opens a non-functional modal, exactly matching the
 * Blade DOM so the visual identity is preserved.
 *
 * ⚠️ `dir="ltr"` + `inputmode="numeric"` + `autoComplete="off"` are intentional
 * Blade behaviours (a USB barcode reader writes Latin digits left-to-right and
 * an autocomplete popup would corrupt the code) — do not "fix" them.
 */

export type BarcodeStatus = 'unknown' | 'pending' | 'verified' | 'conflict';

const B = AR.accounting.barcode;

export function BarcodeField({
  id,
  name = 'barcode',
  label = B.field_label,
  value,
  onValueChange,
  showStatus = true,
  required = false,
}: {
  id: string;
  name?: string;
  label?: string;
  value: string;
  onValueChange: (next: string) => void;
  showStatus?: boolean;
  required?: boolean;
}) {
  const [phoneOpen, setPhoneOpen] = useState(false);
  const inputEl = () => document.getElementById(id) as HTMLInputElement | null;

  return (
    <>
      <div className={`ac-field ${showStatus ? 'has-status' : ''}`}>
        <label htmlFor={id} className="ac-field-label">
          {label}
          {required && (
            <span className="ac-req" aria-hidden="true">
              *
            </span>
          )}
        </label>

        <div className="ac-barcode-wrap">
          <span className="ac-barcode-icon" aria-hidden="true">
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
              <path d="M3 5v14M7 5v14M11 5v14M15 5v10M19 5v14" />
            </svg>
          </span>

          <input
            type="text"
            id={id}
            name={name}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            className="ac-barcode-input"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            placeholder={B.field_placeholder}
            data-barcode-input
          />

          {showStatus && (
            <span
              className="ac-barcode-state"
              data-barcode-state
              data-barcode-status="unknown"
              aria-live="polite"
            />
          )}
        </div>
      </div>

      <div className="ac-scan-actions">
        <button
          type="button"
          className="ac-scan-btn is-outline"
          data-barcode-scan
          data-scan-target={id}
          onClick={() => inputEl()?.focus()}
        >
          <span className="ac-scan-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7V5a2 2 0 0 1 2-2h2" />
              <path d="M17 3h2a2 2 0 0 1 2 2v2" />
              <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          </span>
          <span className="ac-scan-text">{B.scan_button}</span>
        </button>

        <button
          type="button"
          className="ac-phone-scan-btn"
          data-phone-scanner-open
          aria-haspopup="dialog"
          aria-controls="ac-phone-scanner-modal"
          onClick={() => setPhoneOpen(true)}
        >
          <span className="ac-phone-scan-icon" aria-hidden="true">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="6" y="2" width="12" height="20" rx="2" />
              <line x1="10" y1="18" x2="14" y2="18" />
              <path d="M9 8h1M11 8h1M13 8h1M9 11h1M11 11h1M13 11h1" />
            </svg>
          </span>
          <span className="ac-phone-scan-text">{AR.accounting.scanner.button}</span>
          <span className="ac-phone-scan-dot" data-phone-scanner-dot hidden aria-hidden="true" />
        </button>
      </div>

      {/*
        The phone-scanner modal is part of the Blade DOM (`x-accounting.phone-scanner-modal`).
        B3 keeps it presentation-only: it opens and shows the pairing steps, but no
        scanner session is created. Kept so the screen is not missing a piece.
      */}
      {phoneOpen && (
        <Modal
          open
          title={AR.accounting.scanner.modal_title}
          onClose={() => setPhoneOpen(false)}
        >
          <p style={{ marginTop: 0, color: 'var(--ink-soft)' }}>
            {AR.accounting.scanner.modal_sub}
          </p>
          <ol style={{ margin: 0, paddingInlineStart: '1.2em', color: 'var(--ink-soft)' }}>
            <li>{AR.accounting.scanner.step_1}</li>
            <li>{AR.accounting.scanner.step_2}</li>
            <li>{AR.accounting.scanner.step_3}</li>
          </ol>
        </Modal>
      )}
    </>
  );
}
