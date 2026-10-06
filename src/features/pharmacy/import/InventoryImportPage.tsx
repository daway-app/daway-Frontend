import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { AR } from '@/lib/i18n';
import { useApi, usePharmacyApi } from '@/auth/authHooks';
import { useApiMutation } from '@/api/useApiQuery';
import type { ApiImportSession } from '@/api/pharmacyTypes';

/**
 * Bulk inventory import — live against the real endpoints.
 *
 * Port of `resources/views/pharmacy/import/index.blade.php`.
 *
 * Wired:
 *  - **template downloads** → `GET /api/pharmacy/inventory/import/template`
 *    (`?mode=current` exports the pharmacy's existing inventory). This route is
 *    behind `auth:sanctum` + `role:pharmacy`, so a plain `<a href>` cannot be
 *    used — the browser would send no `Authorization` header and get a 401. Both
 *    buttons therefore go through `client.download()` (token + Blob) and save
 *    the file from memory.
 *  - **upload** → `POST /api/pharmacy/inventory/import` as multipart. The
 *    endpoint is a DRY RUN: it creates a preview session and writes nothing to
 *    inventory. Committing is a separate call (`/decide` + `/commit`) that this
 *    page does not perform.
 *
 * GAP-12 — **the "recent sessions" table has no server source.** The API exposes
 * `inventory/import/{uuid}` but no LIST endpoint, so there is nothing to
 * populate that table from. It is dropped rather than faked.
 *
 * The Blade's rate-limit banner came from a server-side value passed into the
 * view; there is no equivalent endpoint, so the limit now surfaces as a normal
 * error message if the `throttle:inventory-import` limiter rejects the upload.
 */

const P = AR.pharmacyImport;

/** Column guide — the canonical list from the import service. */
const IMPORT_COLUMNS = [
  'trade_name',
  'trade_name_ar',
  'active_ingredient',
  'price',
  'quantity',
  'barcode',
  'min_stock',
  'is_available',
] as const;

type ImportColumn = (typeof IMPORT_COLUMNS)[number];

const IMPORT_REQUIRED_COLUMNS: readonly ImportColumn[] = ['trade_name', 'price', 'quantity'];

/** `$columnDescriptions` — only the required flag matters for the `*` marker. */
const COLUMN_DESCRIPTIONS: Record<ImportColumn, string> = {
  trade_name: P.col_trade_name,
  trade_name_ar: P.col_trade_name_ar,
  active_ingredient: P.col_active_ingredient,
  price: P.col_price,
  quantity: P.col_quantity,
  barcode: P.col_barcode,
  min_stock: P.col_min_stock,
  is_available: P.col_is_available,
};

const STEPS: Array<{ no: number; label: string; active: boolean }> = [
  { no: 1, label: P.step_download, active: true },
  { no: 2, label: P.step_upload, active: true },
  { no: 3, label: P.step_review, active: false },
  { no: 4, label: P.step_confirm, active: false },
];

export function InventoryImportPage() {
  const api = usePharmacyApi();
  const { client } = useApi();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState<'empty' | 'current' | null>(null);
  const [preview, setPreview] = useState<ApiImportSession | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useApiMutation((f: File) => api.previewImport(f));

  /** Save a Blob the client fetched with the auth token. */
  function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplate(mode: 'empty' | 'current') {
    setDownloading(mode);
    try {
      const path = `/api/pharmacy/inventory/import/template${mode === 'current' ? '?mode=current' : ''}`;
      const blob = await client.download(path);
      const suffix = mode === 'current' ? 'current' : 'template';
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      saveBlob(blob, `inventory-${suffix}-${stamp}.xlsx`);
    } catch {
      // A failed download surfaces through `downloadError` below.
      setDownloadError('تعذّر تنزيل الملف، حاول مرة أخرى');
    } finally {
      setDownloading(null);
    }
  }

  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setPreview(null);
    setDownloadError(null);
    if (!file) return;
    try {
      setPreview(await upload.run(file));
    } catch {
      // `upload.error` renders below.
    }
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{P.title}</h1>
          <p>{P.subtitle}</p>
        </div>
        <div className="ph-actions">
          <Link to="/inventory" className="ph-btn outline">
            <i className="fas fa-arrow-right" /> {P.back_to_inventory}
          </Link>
        </div>
      </div>

      <div className="pi-steps">
        {STEPS.map((s) => (
          <div key={s.no} className={`pi-step ${s.active ? 'is-active' : ''}`}>
            <span className="pi-step-no">{s.no}</span> {s.label}
          </div>
        ))}
      </div>

      {downloadError && (
        <div className="ph-error" style={{ marginBlockEnd: 16 }}>
          <i className="fas fa-circle-exclamation" aria-hidden="true" />
          <p>{downloadError}</p>
        </div>
      )}

      {/* ============ 1) Template ============ */}
      <Card
        title={P.template_title}
        icon="fas fa-file-arrow-down"
        description={P.template_hint}
        bodyStyle={{ padding: '20px 22px' }}
      >
        <div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBlockEnd: 20 }}>
            <button
              type="button"
              className="ph-btn primary"
              disabled={downloading !== null}
              onClick={() => void downloadTemplate('empty')}
            >
              <i className="fas fa-file-excel" /> {P.download_empty_template}
            </button>
            <button
              type="button"
              className="ph-btn outline"
              disabled={downloading !== null}
              onClick={() => void downloadTemplate('current')}
            >
              <i className="fas fa-database" /> {P.download_current_inventory}
            </button>
          </div>

          <h3 style={{ fontSize: '.9rem', margin: '0 0 4px' }}>{P.column_guide_title}</h3>
          <p className="pi-inline-note" style={{ marginBlockEnd: 12 }}>
            {P.column_guide_hint}
          </p>

          <div className="pi-columns">
            {IMPORT_COLUMNS.map((column) => (
              <div className="pi-column" key={column}>
                <code>{column}</code>
                {IMPORT_REQUIRED_COLUMNS.includes(column) && (
                  <span className="pi-req" title={P.column_guide_hint}>
                    *
                  </span>
                )}
                <span className="pi-col-desc">{COLUMN_DESCRIPTIONS[column]}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ============ 2) Upload ============ */}
      <Card
        title={P.upload_title}
        icon="fas fa-cloud-arrow-up"
        description={P.upload_hint.replace(':max', '10').replace(':rows', '5,000')}
        bodyStyle={{ padding: '20px 22px' }}
      >
        <div>
          <form onSubmit={submitUpload} id="pi-upload-form">
            <label
              htmlFor="pi-file"
              className={`pi-drop ${dragging ? 'is-dragging' : ''}`}
              id="pi-drop"
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer?.files?.[0];
                if (f) setFile(f);
              }}
            >
              <i className="fas fa-file-import pi-drop-icon" />
              <p>{P.upload_choose} — xlsx / xls / csv</p>
              <input
                ref={inputRef}
                type="file"
                id="pi-file"
                name="file"
                className="pi-file-input"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                required
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div className="pi-file-name" id="pi-file-name">
                {file?.name ?? ''}
              </div>
            </label>

            <div style={{ marginBlockStart: 18 }}>
              <button
                type="submit"
                className="ph-btn primary"
                id="pi-submit"
                disabled={!file || upload.isPending}
              >
                <i className="fas fa-magnifying-glass-chart" /> {P.upload_submit}
              </button>
              {upload.isPending && (
                <span className="pi-inline-note" id="pi-processing" style={{ marginInlineStart: 12 }}>
                  {P.upload_processing}
                </span>
              )}
            </div>
          </form>

          {upload.error && (
            <div className="ph-error" style={{ marginBlockStart: 16 }}>
              <i className="fas fa-circle-exclamation" aria-hidden="true" />
              <p>{upload.error.message}</p>
            </div>
          )}

          {/* The endpoint is a DRY RUN — say so, so nobody expects stock to change. */}
          {preview && (
            <div className="ac-note is-info" style={{ marginBlockStart: 16 }} role="status">
              <span className="ac-note-icon" aria-hidden="true">
                i
              </span>
              <div>
                <strong>{P.summary_title}</strong>
                <p>
                  {preview.original_filename ?? file?.name} — {preview.total_rows}{' '}
                  {P.summary_total}
                  {typeof preview.valid_rows === 'number' ? ` · ${preview.valid_rows} ✓` : ''}
                  {typeof preview.invalid_rows === 'number' && preview.invalid_rows > 0
                    ? ` · ${preview.invalid_rows} ✗`
                    : ''}
                </p>
                <p className="ac-muted">لم يُكتب أي تغيير على المخزون بعد — هذه معاينة فقط.</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
