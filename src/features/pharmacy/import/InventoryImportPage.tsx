import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Card, DataTable } from '@/components/ui';
import { useLang } from '@/lib/lang/useLang';
import { useApi, usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiMutation } from '@/api/useApiQuery';
import { ROUTES } from '@/routes/paths';
import type {
  ApiCatalogMedicineHit,
  ApiImportCommitResult,
  ApiImportDecision,
  ApiImportDecisionPayload,
  ApiImportMergeDecision,
  ApiImportSession,
} from '@/api/pharmacyTypes';
import { formatDateTime, num } from '@/lib/format';
import { toast } from '@/lib/toast';
import {
  blockingCount,
  buildDecisionPayload,
  canCreate,
  createTargetFor,
  defaultDecision,
  groupsWithoutMerge,
  initialDecisions,
  initialTargets,
  linkTargetFor,
  mergeWinnerRow,
  pendingRowNumbers,
  type ImportDecisions,
  type ImportTarget,
  type ImportTargets,
} from './importReview';

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

const PAGE_SIZE = 50;

type ImportFilter = 'all' | 'decision' | 'errors';

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/:([a-z_]+)/gi, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

function statusClass(status: string): string {
  switch (status) {
    case 'EXACT_EN':
    case 'EXACT_AR_NORMALIZED':
    case 'ALIAS_MATCH':
      return 'is-ok';
    case 'MOH_MATCH':
      return 'is-teal';
    case 'FUZZY_MATCH':
    case 'REVIEW_REQUIRED':
      return 'is-warn';
    case 'UNMATCHED':
      return 'is-info';
    case 'DUPLICATE':
      return 'is-teal';
    case 'INVALID_ROW':
      return 'is-error';
    default:
      return '';
  }
}

function MedicineSearch({
  target,
  disabled,
  onSelect,
  onClear,
}: {
  target: ImportTarget | undefined;
  disabled: boolean;
  onSelect: (hit: ApiCatalogMedicineHit) => void;
  onClear: () => void;
}) {
  const { STR } = useLang();
  const P = STR.pharmacyImport;
  const api = usePharmacyApi();
  const [q, setQ] = useState(target?.medicineName ?? '');
  const [items, setItems] = useState<ApiCatalogMedicineHit[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (target?.medicineId !== undefined) {
      setQ(target.medicineName ?? '');
      setOpen(false);
    }
  }, [target?.medicineId, target?.medicineName]);

  useEffect(() => {
    const query = q.trim();

    if (disabled || target?.medicineId !== undefined || query.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }

    setItems([]);
    setOpen(false);

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api
        .searchCatalog(query, controller.signal)
        .then((res) => {
          if (!active) return;
          setItems(res.medicines.slice(0, 8));
          setOpen(true);
        })
        .catch((err: unknown) => {
          if (!active) return;
          if ((err as { name?: string }).name === 'AbortError') return;
          setItems([]);
          setOpen(true);
        });
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [api, disabled, q, target?.medicineId]);

  return (
    <div className="pi-search-box">
      <input
        type="text"
        value={q}
        placeholder={P.decision_search_placeholder}
        aria-label={P.decision_search_placeholder}
        autoComplete="off"
        disabled={disabled}
        onChange={(event) => {
          setQ(event.target.value);
          if (target?.medicineId !== undefined) onClear();
        }}
        onFocus={() => {
          if (target?.medicineId === undefined && items.length > 0) setOpen(true);
        }}
      />
      <div className={`pi-search-results ${open ? 'is-open' : ''}`}>
        {items.length > 0 ? (
          items.map((hit) => (
            <button
              key={hit.id}
              type="button"
              onClick={() => {
                setQ(hit.name ?? hit.name_ar ?? '');
                setOpen(false);
                onSelect(hit);
              }}
            >
              {hit.name ?? hit.name_ar ?? `#${hit.id}`}
              {hit.name_ar && hit.name ? <small>{hit.name_ar}</small> : null}
              {hit.sub ? <small>{hit.sub}</small> : null}
            </button>
          ))
        ) : (
          q.trim().length >= 2 && (
            <div className="pi-no-results">{P.decision_no_results}</div>
          )
        )}
      </div>
    </div>
  );
}

export function InventoryImportPage() {
  const { STR } = useLang();
  const P = STR.pharmacyImport;
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
  const api = usePharmacyApi();
  const { client } = useApi();
  const keys = usePharmacyKeys();
  const queryClient = useQueryClient();

  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloading, setDownloading] = useState<'empty' | 'current' | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [session, setSession] = useState<ApiImportSession | null>(null);
  const [decisions, setDecisions] = useState<ImportDecisions>({});
  const [targets, setTargets] = useState<ImportTargets>({});
  const [merges, setMerges] = useState<Record<string, ApiImportMergeDecision>>({});
  const [filter, setFilter] = useState<ImportFilter>('all');
  const [page, setPage] = useState(0);
  const [result, setResult] = useState<ApiImportCommitResult | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [reviewUuid, setReviewUuid] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useApiMutation((f: File) => api.previewImport(f));
  const save = useApiMutation((uuid: string, body: ApiImportDecisionPayload) =>
    api.decideImport(uuid, body),
  );
  const commit = useApiMutation((uuid: string) => api.commitImport(uuid));
  const cancel = useApiMutation((uuid: string) => api.cancelImport(uuid));

  const rows = useMemo(() => session?.rows ?? [], [session?.rows]);
  const groups = useMemo(() => session?.groups ?? {}, [session?.groups]);
  const missingMerges = useMemo(() => groupsWithoutMerge(groups, merges), [groups, merges]);
  const pendingRows = useMemo(
    () => pendingRowNumbers(rows, groups, merges, decisions),
    [rows, groups, merges, decisions],
  );
  const blockers = blockingCount(rows, groups, merges, decisions);
  const toCreate = useMemo(
    () =>
      rows.filter(
        (row) => row.errors.length === 0 && (decisions[row.row] ?? defaultDecision(row)) === 'create',
      ).length,
    [rows, decisions],
  );
  const busy = upload.isPending || save.isPending || commit.isPending || cancel.isPending;

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (filter === 'all') return true;
        if (filter === 'errors') return row.errors.length > 0;
        return row.errors.length === 0 && (decisions[row.row] ?? defaultDecision(row)) === 'pending';
      }),
    [rows, filter, decisions],
  );

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pageRows = filteredRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const needsDecisionCount = rows.filter(
    (row) => row.errors.length === 0 && (decisions[row.row] ?? defaultDecision(row)) === 'pending',
  ).length;

  const statusLabels: Record<string, string> = {
    EXACT_EN: P.status_EXACT_EN,
    EXACT_AR_NORMALIZED: P.status_EXACT_AR_NORMALIZED,
    ALIAS_MATCH: P.status_ALIAS_MATCH,
    MOH_MATCH: P.status_MOH_MATCH,
    FUZZY_MATCH: P.status_FUZZY_MATCH,
    REVIEW_REQUIRED: P.status_REVIEW_REQUIRED,
    UNMATCHED: P.status_UNMATCHED,
    INVALID_ROW: P.status_INVALID_ROW,
    DUPLICATE: P.status_DUPLICATE,
  };

  const errorLabels: Record<string, string> = {
    missing_name: P.err_missing_name,
    invalid_price: P.err_invalid_price,
    invalid_quantity: P.err_invalid_quantity,
    quantity_out_of_range: P.err_quantity_out_of_range,
    invalid_min_stock: P.err_invalid_min_stock,
    invalid_is_available: P.err_invalid_is_available,
  };

  const warningLabels: Record<string, string> = {
    missing_price: P.warn_missing_price,
    price_deviation: P.warn_price_deviation,
  };

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

  function applySession(next: ApiImportSession, keepFile?: File) {
    const nextRows = next.rows ?? [];
    setSession(next);
    setDecisions(initialDecisions(nextRows));
    setTargets(initialTargets(nextRows));
    setMerges({ ...next.merges });
    setFilter('all');
    setPage(0);
    setActionError(null);
    if (keepFile) setFile(keepFile);
    if (next.status === 'committed' && next.commit_summary) {
      setResult({ summary: next.commit_summary, import: next });
    }
  }

  async function openSession(uuid: string, keepFile?: File) {
    setReviewUuid(uuid);
    setLoadingReview(true);
    setLoadError(null);
    try {
      const full = await api.importSession(uuid);
      applySession(full, keepFile);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : P.load_review_failed);
    } finally {
      setLoadingReview(false);
    }
  }

  function resetAll() {
    setFile(null);
    setSession(null);
    setDecisions({});
    setTargets({});
    setMerges({});
    setFilter('all');
    setPage(0);
    setResult(null);
    setReviewUuid(null);
    setLoadError(null);
    setActionError(null);
    setDownloadError(null);
    upload.reset();
    save.reset();
    commit.reset();
    cancel.reset();
    if (inputRef.current) inputRef.current.value = '';
  }

  async function downloadTemplate(mode: 'empty' | 'current') {
    setDownloading(mode);
    setDownloadError(null);
    try {
      const blob = await client.download(api.templateUrl(mode));
      const suffix = mode === 'current' ? 'current' : 'template';
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      saveBlob(blob, `inventory-${suffix}-${stamp}.xlsx`);
    } catch {
      setDownloadError(P.download_failed);
    } finally {
      setDownloading(null);
    }
  }

  async function downloadReport() {
    const active = result?.import ?? session;
    if (!active) return;
    setDownloadingReport(true);
    setDownloadError(null);
    try {
      const blob = await client.download(api.importErrorsPath(active.uuid));
      saveBlob(blob, `import-errors-${active.uuid.slice(0, 8)}.xlsx`);
    } catch {
      setDownloadError(P.download_failed);
    } finally {
      setDownloadingReport(false);
    }
  }

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setDownloadError(null);
    setLoadError(null);
    if (!file) return;
    upload.reset();
    save.reset();
    commit.reset();
    try {
      const preview = await upload.run(file);
      await openSession(preview.uuid, file);
    } catch {
      // The mutation error renders below.
    }
  }

  function setDecision(rowNumber: number, action: ApiImportDecision) {
    setDecisions((prev) => ({ ...prev, [rowNumber]: action }));
  }

  function clearTarget(rowNumber: number) {
    setTargets((prev) => ({
      ...prev,
      [rowNumber]: {
        ...prev[rowNumber],
        medicineId: undefined,
        medicineName: undefined,
      },
    }));
    if ((decisions[rowNumber] ?? 'pending') === 'link') setDecision(rowNumber, 'pending');
  }

  function decisionPayload(): ApiImportDecisionPayload | null {
    if (!session) return null;
    return buildDecisionPayload(
      session.rows ?? [],
      session.groups,
      merges,
      decisions,
      targets,
    );
  }

  async function persistDecisions(): Promise<ApiImportSession | null> {
    if (!session) return null;
    const payload = decisionPayload();
    if (!payload) return null;
    const saved = await save.run(session.uuid, payload);
    const full = await api.importSession(saved.uuid);
    applySession(full);
    return full;
  }

  async function handleSave() {
    if (!session || busy) return;
    setActionError(null);
    save.reset();
    commit.reset();
    try {
      await persistDecisions();
      toast.success(P.save_success);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : P.error_commit_failed);
    }
  }

  async function handleCommit() {
    if (!session || busy) return;

    if (blockers > 0) {
      const message = missingMerges.length
        ? P.merge_pending
        : fill(P.error_pending_rows, { count: pendingRows.length });
      setActionError(message);
      return;
    }

    if (toCreate > 0) {
      const confirmed = window.confirm(
        `${fill(P.confirm_creating_notice, { count: toCreate })}\n${P.confirm_irreversible}`,
      );
      if (!confirmed) return;
    }

    setActionError(null);
    save.reset();
    commit.reset();
    try {
      const full = await persistDecisions();
      if (!full) return;
      const res = await commit.run(full.uuid);
      setResult(res);
      setSession(res.import);
      void queryClient.invalidateQueries({
        queryKey: keys.inventory.all,
        refetchType: 'all',
      });
      void queryClient.invalidateQueries({
        queryKey: keys.dashboardStats,
        refetchType: 'all',
      });
      void queryClient.invalidateQueries({
        queryKey: keys.sidebarCounts,
        refetchType: 'all',
      });
      void queryClient.invalidateQueries({
        queryKey: keys.medicines.uncategorizedAll,
        refetchType: 'all',
      });
      toast.success(P.done_title);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : P.error_commit_failed);
    }
  }

  async function handleCancel() {
    if (!session || busy) return;
    if (!window.confirm(P.cancel_confirm)) return;
    try {
      await cancel.run(session.uuid);
      resetAll();
      toast.success(P.cancel_success);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : P.error_commit_failed);
    }
  }

  const phase = result ? 4 : session ? 3 : 2;
  const steps = [
    { no: 1, label: P.step_download },
    { no: 2, label: P.step_upload },
    { no: 3, label: P.step_review },
    { no: 4, label: P.step_confirm },
  ];

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{result ? P.done_title : session ? P.summary_title : P.title}</h1>
          <p>
            {result
              ? P.done_subtitle
              : session
                ? `${P.file_name}: ${file?.name ?? session.uuid}`
                : P.subtitle}
          </p>
        </div>
        <div className="ph-actions">
          {session && (
            <button
              type="button"
              className="ph-btn outline"
              disabled={downloadingReport}
              onClick={() => void downloadReport()}
            >
              <i className="fas fa-file-csv" /> {P.download_errors}
            </button>
          )}
          <Link to={ROUTES.medicines} className="ph-btn outline">
            <i className="fas fa-arrow-right" /> {P.back_to_medicines}
          </Link>
        </div>
      </div>

      <div className="pi-steps">
        {steps.map((step) => (
          <div key={step.no} className={`pi-step ${step.no <= phase ? 'is-active' : ''}`}>
            <span className="pi-step-no">{step.no}</span> {step.label}
          </div>
        ))}
      </div>

      {downloadError && (
        <div className="ph-error" style={{ marginBlockEnd: 16 }}>
          <i className="fas fa-circle-exclamation" aria-hidden="true" />
          <p>{downloadError}</p>
        </div>
      )}

      {loadError && (
        <div className="pi-alert is-error">
          <div>{loadError}</div>
          {reviewUuid && (
            <button
              type="button"
              className="ph-btn outline"
              style={{ marginBlockStart: 10 }}
              disabled={loadingReview}
              onClick={() => void openSession(reviewUuid, file ?? undefined)}
            >
              <i className="fas fa-rotate-right" /> {P.retry}
            </button>
          )}
        </div>
      )}

      {actionError && <div className="pi-alert is-error">{actionError}</div>}

      {loadingReview && (
        <Card title={P.table_title} icon="fas fa-list-check">
          <p className="pi-inline-note">{P.loading_review}</p>
        </Card>
      )}

      {!session && !loadingReview && (
        <>
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

          <Card
            title={P.upload_title}
            icon="fas fa-cloud-arrow-up"
            description={P.upload_hint.replace(':max', '5').replace(':rows', '5,000')}
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
                    const dropped = e.dataTransfer?.files?.[0];
                    if (dropped) setFile(dropped);
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
                    disabled={!file || busy}
                  >
                    <i className="fas fa-magnifying-glass-chart" /> {P.upload_submit}
                  </button>
                  {upload.isPending && (
                    <span
                      className="pi-inline-note"
                      id="pi-processing"
                      style={{ marginInlineStart: 12 }}
                    >
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
            </div>
          </Card>
        </>
      )}

      {session && !result && (
        <>
          <div className="pi-summary">
            <div className="pi-summary-card">
              <strong>{num(session.summary.total)}</strong>
              <span>{P.summary_total}</span>
            </div>
            <div className="pi-summary-card is-matched">
              <strong>{num(session.summary.matched)}</strong>
              <span>{P.summary_matched}</span>
              <small>{P.summary_matched_hint}</small>
            </div>
            <div className="pi-summary-card is-review">
              <strong>{num(session.summary.review)}</strong>
              <span>{P.summary_review}</span>
              <small>{P.summary_review_hint}</small>
            </div>
            <div className="pi-summary-card is-unmatched">
              <strong>{num(session.summary.unmatched)}</strong>
              <span>{P.summary_unmatched}</span>
              <small>{P.summary_unmatched_hint}</small>
            </div>
            <div className="pi-summary-card is-duplicate">
              <strong>{num(session.summary.duplicate)}</strong>
              <span>{P.summary_duplicate}</span>
              <small>{P.summary_duplicate_hint}</small>
            </div>
            <div className="pi-summary-card is-error">
              <strong>{num(session.summary.error)}</strong>
              <span>{P.summary_error}</span>
              <small>{P.summary_error_hint}</small>
            </div>
          </div>

          {session.unknown_columns.length > 0 && (
            <div className="pi-alert is-warn">
              {fill(P.unknown_columns_notice, {
                columns: session.unknown_columns.join(', '),
              })}
            </div>
          )}

          {session.expires_at && (
            <div className="pi-alert is-info">
              {fill(P.session_expires, { at: formatDateTime(session.expires_at) })}
            </div>
          )}

          {session.status === 'expired' && (
            <div className="pi-alert is-error">
              {P.error_expired}{' '}
              <button type="button" className="ph-btn outline" onClick={resetAll}>
                {P.upload_another}
              </button>
            </div>
          )}

          {Object.keys(session.groups).length > 0 && (
            <Card
              title={P.merge_title}
              icon="fas fa-clone"
              description={P.merge_hint}
              bodyStyle={{ padding: '18px 22px' }}
            >
              <div>
                {Object.entries(session.groups).map(([groupKey, rowNumbers]) => {
                  const first = rows.find((row) => row.row === rowNumbers[0]);
                  const name =
                    first?.resolved_name ?? first?.input.trade_name ?? groupKey;
                  const labels: Array<[ApiImportMergeDecision, string]> = [
                    ['keep_last', P.merge_keep_last],
                    ['keep_first', P.merge_keep_first],
                    ['skip_all', P.merge_skip_all],
                  ];
                  return (
                    <div className="pi-merge" data-pi-merge-group={groupKey} key={groupKey}>
                      <div className="pi-merge-head">
                        <strong>{fill(P.merge_group_label, { name })}</strong>
                        <span>
                          {fill(P.merge_rows_label, { rows: rowNumbers.join(', ') })}
                        </span>
                      </div>
                      <div className="pi-merge-options">
                        {labels.map(([value, label]) => (
                          <label key={value}>
                            <input
                              type="radio"
                              name={`merge_${groupKey}`}
                              value={value}
                              checked={merges[groupKey] === value}
                              onChange={() =>
                                setMerges((prev) => ({ ...prev, [groupKey]: value }))
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                      {!merges[groupKey] && (
                        <p className="pi-inline-note" style={{ marginBlockStart: 8 }}>
                          {P.merge_pending}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card
            title={P.table_title}
            icon="fas fa-list-check"
            bodyStyle={{ padding: 0 }}
          >
            <div style={{ padding: '16px 22px 0' }}>
              <div className="pi-filters">
                {(
                  [
                    ['all', P.filter_all],
                    ['decision', P.filter_needs_decision],
                    ['errors', P.filter_errors],
                  ] as Array<[ImportFilter, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`pi-chip ${filter === value ? 'active' : ''}`}
                    onClick={() => {
                      setFilter(value);
                      setPage(0);
                    }}
                  >
                    {label}
                  </button>
                ))}
                <span className="pi-inline-note">
                  {needsDecisionCount > 0
                    ? fill(P.confirm_pending_notice, { count: needsDecisionCount })
                    : P.confirm_hint}
                </span>
              </div>
            </div>

            <DataTable
              columns={[
                P.row_number,
                P.input_name,
                P.matched_medicine,
                P.row_status,
                P.row_decision,
              ]}
              caption={P.table_title}
              className="pi-review-table"
              sticky
            >
              {pageRows.map((row) => {
                const current = decisions[row.row] ?? defaultDecision(row);
                const link = linkTargetFor(row);
                const create = createTargetFor(row);
                const target = targets[row.row];
                const linkReady =
                  (target?.medicineId ?? row.medicine_id ?? link?.medicineId) !== undefined &&
                  (target?.medicineId ?? row.medicine_id ?? link?.medicineId) !== null;
                const mergeDecision = row.duplicate_group
                  ? merges[row.duplicate_group]
                  : undefined;
                const groupRows = row.duplicate_group
                  ? session.groups[row.duplicate_group]
                  : undefined;
                const winner =
                  groupRows && mergeDecision
                    ? mergeWinnerRow(groupRows, mergeDecision)
                    : null;
                const duplicateNote = !row.duplicate_group
                  ? null
                  : !mergeDecision
                    ? P.merge_pending
                    : winner === row.row
                      ? P.duplicate_winner
                      : P.duplicate_loser;

                return (
                  <tr key={row.row}>
                    <td>
                      <strong>{row.row}</strong>
                    </td>
                    <td>
                      <span className="pi-row-input">
                        {row.input.trade_name}
                        {row.input.trade_name_ar && <small>{row.input.trade_name_ar}</small>}
                      </span>
                      <p className="pi-inline-note" style={{ marginBlockStart: 4 }}>
                        {P.col_quantity}: {row.input.quantity ?? '—'} · {P.col_price}:{' '}
                        {row.input.price ?? '—'}
                      </p>
                    </td>
                    <td>
                      {row.resolved_name || target?.medicineName ? (
                        <span className="pi-resolved">
                          <b>{target?.medicineName ?? row.resolved_name}</b>
                          {row.resolved_name_ar && (
                            <>
                              <br />
                              <small>{row.resolved_name_ar}</small>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="pi-inline-note">—</span>
                      )}

                      {row.suggestions.length > 0 && (
                        <ul className="pi-suggestions">
                          {row.suggestions.map((suggestion, index) => (
                            <li key={`${row.row}-s-${index}`}>
                              <i className="fas fa-lightbulb" />{' '}
                              {suggestion.name ?? suggestion.name_ar ?? ''}
                              {suggestion.name_ar && suggestion.name
                                ? ` (${suggestion.name_ar})`
                                : ''}
                              {suggestion.official_price !== null
                                ? ` — ${suggestion.official_price}`
                                : ''}
                            </li>
                          ))}
                        </ul>
                      )}

                      {row.warnings.length > 0 && (
                        <ul className="pi-suggestions">
                          {row.warnings.map((warning) => (
                            <li key={`${row.row}-w-${warning}`}>
                              <i
                                className="fas fa-triangle-exclamation"
                                style={{ color: 'var(--ph-orange)' }}
                              />{' '}
                              {warningLabels[warning] ?? warning}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td>
                      <span className={`pi-status ${statusClass(row.status)}`}>
                        {statusLabels[row.status] ?? row.status}
                      </span>
                      {duplicateNote && (
                        <p className="pi-inline-note" style={{ marginBlockStart: 6 }}>
                          {duplicateNote}
                        </p>
                      )}
                    </td>
                    <td>
                      {row.errors.length > 0 ? (
                        <>
                          <ul className="pi-suggestions" style={{ margin: 0 }}>
                            {row.errors.map((error) => (
                              <li
                                key={`${row.row}-e-${error}`}
                                style={{ color: 'var(--ph-red)' }}
                              >
                                {errorLabels[error] ?? error}
                              </li>
                            ))}
                          </ul>
                          <p className="pi-inline-note" style={{ marginBlockStart: 6 }}>
                            {P.decision_skip}
                          </p>
                        </>
                      ) : (
                        <div className="pi-decide">
                          <label>
                            <input
                              type="radio"
                              name={`decision_${row.row}`}
                              value="link"
                              checked={current === 'link'}
                              disabled={!linkReady}
                              onChange={() => setDecision(row.row, 'link')}
                            />
                            {P.decision_link}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`decision_${row.row}`}
                              value="create"
                              checked={current === 'create'}
                              disabled={!canCreate(row)}
                              onChange={() => setDecision(row.row, 'create')}
                            />
                            {P.decision_create}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`decision_${row.row}`}
                              value="skip"
                              checked={current === 'skip'}
                              onChange={() => setDecision(row.row, 'skip')}
                            />
                            {P.decision_skip}
                          </label>

                          <MedicineSearch
                            target={target}
                            disabled={busy}
                            onSelect={(hit) => {
                              setTargets((prev) => ({
                                ...prev,
                                [row.row]: {
                                  ...prev[row.row],
                                  medicineId: hit.id,
                                  medicineName: hit.name ?? hit.name_ar ?? '',
                                },
                              }));
                              setDecision(row.row, 'link');
                            }}
                            onClear={() => clearTarget(row.row)}
                          />

                          {current === 'link' && !linkReady && (
                            <p className="pi-inline-note">{P.decision_link_hint}</p>
                          )}
                          {current === 'create' && (
                            <p className="pi-inline-note">{P.decision_create_hint}</p>
                          )}
                          {current === 'create' && create?.mohName && (
                            <p className="pi-inline-note">{create.mohName}</p>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            {pageRows.length === 0 && <div className="pi-empty">{P.no_rows}</div>}

            {filteredRows.length > PAGE_SIZE && (
              <div className="pi-pagination">
                <button
                  type="button"
                  className="ph-btn outline"
                  disabled={page === 0}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                >
                  <i className="fas fa-chevron-right" /> {P.page_prev}
                </button>
                <span className="pi-inline-note">
                  {fill(P.page_status, { page: page + 1, pages: pageCount })}
                </span>
                <button
                  type="button"
                  className="ph-btn outline"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage((prev) => Math.min(pageCount - 1, prev + 1))}
                >
                  {P.page_next} <i className="fas fa-chevron-left" />
                </button>
              </div>
            )}

            <div className="pi-confirm-bar">
              <div>
                {blockers > 0 ? (
                  <>
                    <div className="pi-pending-note">
                      {pendingRows.length > 0
                        ? fill(P.confirm_pending_notice, { count: pendingRows.length })
                        : P.merge_pending}
                    </div>
                    {missingMerges.length > 0 && pendingRows.length > 0 && (
                      <p className="pi-inline-note" style={{ marginBlockStart: 6 }}>
                        {P.merge_pending}
                      </p>
                    )}
                  </>
                ) : (
                  <div className="pi-ready-note">{P.confirm_irreversible}</div>
                )}
                {toCreate > 0 && (
                  <p className="pi-inline-note" style={{ marginBlockStart: 6 }}>
                    {fill(P.confirm_creating_notice, { count: toCreate })}
                  </p>
                )}
                <p className="pi-inline-note" style={{ marginBlockStart: 6 }}>
                  {P.confirm_hint}
                </p>
              </div>

              <div className="pi-confirm-actions">
                <button
                  type="button"
                  className="ph-btn ghost"
                  disabled={busy || session.status === 'expired'}
                  onClick={() => void handleSave()}
                >
                  <i className="fas fa-floppy-disk" /> {P.save_decisions}
                </button>
                <button
                  type="button"
                  className="ph-btn primary"
                  disabled={busy || blockers > 0 || session.status === 'expired'}
                  onClick={() => void handleCommit()}
                >
                  <i className="fas fa-check-double" /> {P.confirm_commit}
                </button>
                <button
                  type="button"
                  className="ph-btn danger"
                  disabled={busy}
                  onClick={() => void handleCancel()}
                >
                  <i className="fas fa-xmark" /> {P.cancel_import}
                </button>
              </div>
            </div>
          </Card>
        </>
      )}

      {result && (
        <>
          <div className="pi-summary">
            <div className="pi-summary-card is-matched">
              <strong>{num(result.summary.committed_rows)}</strong>
              <span>{P.done_committed_rows}</span>
            </div>
            <div className="pi-summary-card">
              <strong>{num(result.summary.skipped_rows)}</strong>
              <span>{P.done_skipped_rows}</span>
            </div>
            <div className="pi-summary-card is-review">
              <strong>{num(result.summary.created_medicines)}</strong>
              <span>{P.done_created_medicines}</span>
            </div>
            <div className="pi-summary-card is-duplicate">
              <strong>{num(result.summary.learned_aliases)}</strong>
              <span>{P.done_learned_aliases}</span>
            </div>
            <div className="pi-summary-card is-error">
              <strong>{num(result.summary.low_stock_rows)}</strong>
              <span>{P.done_low_stock}</span>
            </div>
          </div>

          <Card title={P.done_title} icon="fas fa-circle-check">
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {result.summary.created_medicines > 0 && (
                <Link to="/medicines/uncategorized" className="ph-btn primary">
                  <i className="fas fa-tags" /> {P.done_uncategorized}
                </Link>
              )}
              <button type="button" className="ph-btn ghost" onClick={resetAll}>
                <i className="fas fa-cloud-arrow-up" /> {P.upload_another}
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

