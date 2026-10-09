import { useEffect, useMemo, useRef, useState } from 'react';
import { Chart } from '@/components/ui/Chart';
import { AsyncBoundary, Card, Btn, DataTable, EmptyState, Modal } from '@/components/ui';
import { toast } from '@/lib/toast';
import { AR } from '@/lib/i18n';
import { ROUTES } from '@/routes/paths';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { countStock, stockStatus, LOW_STOCK_THRESHOLD } from '@/lib/stock';
import { money } from '@/lib/format';
import { ariaSort, useSort, type SortValue } from '@/lib/sort';
import {
  isIndeterminate,
  selectedIds,
  selectionState,
  toggleAll,
  toggleOne,
} from '@/lib/selection';
import type { ApiInventoryItem, ApiInventoryStats } from '@/api/pharmacyTypes';

/**
 * Pharmacy inventory — live against `GET /api/pharmacy/inventory`.
 *
 * Structure still mirrors `resources/views/pharmacy/inventory/index.blade.php`
 * 1:1 (same wrappers, same `.ph-*` classes).
 *
 * Two deliberate changes from the mock version:
 *
 *  1. The counts come from `countStock(rows)` — the approved quantity-only rule
 *     — NOT from the API's `stats.available_count`, which double-counts low rows
 *     (see `src/lib/stock.ts` → DEFECT-1).
 *
 *  2. The stepper now persists. Saving sends ONE bulk request
 *     (`POST /api/pharmacy/inventory/bulk`) with only the rows the user changed,
 *     instead of the mock's purely-local `quantities` state that vanished on
 *     reload. The input stays controlled locally while typing; the server is the
 *     source of truth after a successful save.
 *
 * The trend chart (GAP-3) is still shown but is honest about its source: the
 * API has no inventory-trend endpoint, so it is omitted rather than faked.
 */
const I = AR.pharmacy.inventory;
/** Only for the empty-state CTA label — reuses an existing string. */
const M = AR.pharmacy.medicines.index;
const D = AR.pharmacy.dashboard;
const S = AR.pharmacy.status;

type Tab = 'all' | 'ok' | 'low' | 'out';

const STATUS_TEXT: Record<'ok' | 'low' | 'out', string> = {
  ok: I.status_available,
  low: I.status_low,
  out: I.status_out,
};

export function InventoryPage() {
  const api = usePharmacyApi();

  const [status, setStatus] = useState<Tab>('all');
  const [q, setQ] = useState('');
  /** Local edits, keyed by pharmacy_medicine id. Cleared after a successful save. */
  const [drafts, setDrafts] = useState<Record<number, number>>({});

  const query = useApiQuery<{ data: ApiInventoryItem[]; stats: ApiInventoryStats }>(
    (signal) => api.inventory({ per_page: 100 }, signal),
    [],
    { isEmpty: (r) => r.data.length === 0 },
  );

  /**
   * `query.data?.data ?? []` allocates a NEW array on every render when `data`
   * is null, so every downstream `useMemo` would recompute needlessly. Memoising
   * the fallback keeps the identity stable.
   */
  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  // Drafts are per loaded page: when fresh data arrives, drop stale edits so the
  // server value wins (a reload should never show an edit that was not saved).
  useEffect(() => {
    setDrafts({});
  }, [query.data]);

  const save = useApiMutation(async (changes: Array<{ id: number; quantity: number }>) => {
    return api.bulkUpdateInventory(changes);
  });

  /**
   * Derived counts — approved rule, self-consistent.
   * The API's `stats` block is intentionally NOT used here (DEFECT-1).
   */
  const { total, out, low, available } = useMemo(() => countStock(rows), [rows]);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0);
  const statusLabels = [S.available, S.low_stock, S.out];
  const statusData = [available, low, out];
  const statusColors = ['--success', '--warning', '--danger'];

  const hasFilters = q !== '' || status !== 'all';

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      const rowStatus = stockStatus(row.quantity);
      if (status !== 'all' && rowStatus !== status) return false;
      if (needle === '') return true;
      const name = row.medicine?.trade_name ?? '';
      const ingredient = row.medicine?.active_ingredient ?? '';
      return (
        name.toLowerCase().includes(needle) || ingredient.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, status]);

  /**
   * Sortable columns for the inventory table.
   *
   * Abstracted as a `get` function so the comparator never sees the row shape:
   * sorting by status has to compare the DERIVED status, and sorting by name has
   * to reach into `row.medicine` — which may be absent. Centralising that here
   * means a missing `medicine` cannot throw during a sort.
   */
  const sortOf = useMemo(
    () =>
      (row: ApiInventoryItem, key: 'medicine' | 'status' | 'qty'): SortValue => {
        if (key === 'medicine') return row.medicine?.trade_name ?? null;
        if (key === 'qty') return row.quantity;
        // Status sorts by its internal code (`ok`/`low`/`out`), not the Arabic
        // label: the codes are ordered by severity, and alphabetising the
        // Arabic would put "متوفر" before "نفد" for no useful reason.
        return stockStatus(row.quantity);
      },
    [],
  );

  const { sort, sorted: sortedItems, toggle: toggleSort } = useSort(items, sortOf);

  /** The effective quantity for a row: the draft if edited, otherwise the server value. */
  const effectiveQty = (row: ApiInventoryItem) => drafts[row.id] ?? row.quantity;

  const dirtyChanges = rows
    .filter((row) => drafts[row.id] !== undefined && drafts[row.id] !== row.quantity)
    .map((row) => ({ id: row.id, quantity: drafts[row.id] }));
  const hasChanges = dirtyChanges.length > 0;

  const step = (row: ApiInventoryItem, delta: number) =>
    setDrafts((prev) => ({
      ...prev,
      [row.id]: Math.max(0, (prev[row.id] ?? row.quantity) + delta),
    }));

  const setQty = (row: ApiInventoryItem, value: number) =>
    setDrafts((prev) => ({ ...prev, [row.id]: Math.max(0, value) }));

  /* ------------------------------------------------------------------ */
  /* Bulk row selection (item #69)                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Selected pharmacy-medicine ids. A `Set<number>` because selection is
   * membership, not order — the tri-state header derivation lives in
   * `@/lib/selection` and is unit-tested there.
   */
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  /** Quantity the bulk action will apply to every selected row. */
  const [bulkQty, setBulkQty] = useState('');
  /** The confirm-dialog gate. Non-null while the destructive-ish action waits. */
  const [confirmBulk, setConfirmBulk] = useState(false);

  const headerCheckRef = useRef<HTMLInputElement>(null);

  /** The ids of the rows currently rendered (post filter + sort), in order. */
  const visibleIds = useMemo(() => sortedItems.map((r) => r.id), [sortedItems]);
  const selState = selectionState(selected, visibleIds);
  const selCount = selectedIds(selected, visibleIds).length;

  /**
   * `indeterminate` is a DOM PROPERTY, not an attribute — there is no React
   * prop for it. Without this effect the header checkbox can only be on or
   * off, so a partial selection renders identically to "none selected" and the
   * user cannot tell what will happen when they click it.
   */
  useEffect(() => {
    if (headerCheckRef.current) {
      headerCheckRef.current.indeterminate = isIndeterminate(selState);
    }
  }, [selState]);

  /**
   * A refetch (or a filter change) can remove selected rows. Drop ids that are
   * gone so a bulk action can never act on a row the user can no longer see.
   */
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(visibleIds);
      const next = new Set([...prev].filter((id) => live.has(id)));
      // Preserve identity when nothing was dropped, so this cannot loop.
      return next.size === prev.size ? prev : next;
    });
  }, [visibleIds]);

  /**
   * Apply one quantity to the whole selection.
   *
   * Uses the SAME endpoint as the stepper save — `POST /api/pharmacy/inventory/bulk`
   * via `api.bulkUpdateInventory`. That endpoint takes `{ id, quantity }` per
   * row, so "set N" is exactly what it stores; nothing is faked. Because this
   * rewrites stock for many lines at once it is behind a confirmation, and on
   * success the selection is cleared and the list refetched so the table cannot
   * show stale quantities.
   */
  const bulkApply = useApiMutation(async (items: Array<{ id: number; quantity: number }>) =>
    api.bulkUpdateInventory(items),
  );

  async function runBulkApply() {
    const qty = Math.max(0, Math.floor(Number(bulkQty)));
    if (!Number.isFinite(qty) || bulkQty.trim() === '') return;
    const ids = selectedIds(selected, visibleIds);
    if (ids.length === 0) return;
    try {
      const result = await bulkApply.run(ids.map((id) => ({ id, quantity: qty })));
      toast.success(I.bulk_apply_done.replace(':count', String(result.updated_count)));
      setSelected(new Set());
      setBulkQty('');
      setConfirmBulk(false);
      query.refetch();
    } catch (err) {
      const serverMessage = bulkApply.error?.message;
      const thrown = err instanceof Error ? err.message : undefined;
      toast.error(serverMessage || thrown || I.toast_error);
    }
  }

  async function handleSave() {
    if (!hasChanges) return;
    /*
     * The outcome is reported as a TOAST, not an inline span.
     *
     * Why transient is genuinely better here: the Save button lives in the card
     * footer and the edited rows can be scrolled far above it, so an inline
     * message beside the button is easy to miss — and it silently persisted
     * until the next save. A toast is anchored to the viewport, so the result is
     * seen wherever the user is, and it clears itself.
     *
     * Field-level validation is unaffected: this screen has none (quantities are
     * always valid non-negative numbers), so there is no inline error to keep.
     */
    try {
      const result = await save.run(dirtyChanges);
      toast.success(I.toast_saved.replace(':count', String(result.updated_count)));
      query.refetch();
    } catch (err) {
      // Prefer the server's own localised message (Laravel localises errors);
      // fall back to the screen's wording so a failure is NEVER blank. (`??`
      // alone would pass an empty string through, so "" is treated as absent.)
      const serverMessage = save.error?.message;
      const thrown = err instanceof Error ? err.message : undefined;
      toast.error(serverMessage || thrown || I.toast_error);
    }
  }

  return (
    <div className="ph-page" id="inventory-content">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{I.heading}</h1>
          <p>{I.subtitle}</p>
        </div>
        <div className="ph-actions">
          <a href="/inventory/import" className="ph-btn outline">
            <i className="fas fa-file-import" /> {AR.pharmacy.sidebar.bulk_import}
          </a>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        <div className="ph-stats">
          <div className="ph-stat">
            <i className="fas fa-pills teal" />
            <div>
              <strong>{total}</strong>
              <span>{D.stat_total}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
          <div className="ph-stat">
            <i className="fas fa-xmark red" />
            <div>
              <strong>{out}</strong>
              <span>{I.stat_out}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
          <div className="ph-stat">
            <i className="fas fa-triangle-exclamation orange" />
            <div>
              <strong>{low}</strong>
              <span>{I.stat_low}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
          <div className="ph-stat">
            <i className="fas fa-check green" />
            <div>
              <strong>{available}</strong>
              <span>{I.stat_available}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(340px,1fr))',
            gap: 20,
            marginBlockEnd: 20,
          }}
        >
          <Card title={I.chart_status_title} icon="fas fa-chart-pie" description={I.chart_status_desc}>
            <div className="ph-donut-wrap">
              <div className="ph-donut-chart">
                <Chart
                  kind="donut"
                  labels={statusLabels}
                  data={statusData}
                  colors={statusColors}
                  legend={false}
                  centerValue={String(total)}
                  centerLabel={I.center_total}
                />
              </div>
              <ul className="ph-legend">
                <li>
                  <span className="dot" style={{ background: 'var(--success)' }} /> {I.legend_available}{' '}
                  <b>{pct(available)}%</b>
                </li>
                <li>
                  <span className="dot" style={{ background: 'var(--warning)' }} /> {I.legend_low}{' '}
                  <b>{pct(low)}%</b>
                </li>
                <li>
                  <span className="dot" style={{ background: 'var(--danger)' }} /> {I.legend_out}{' '}
                  <b>{pct(out)}%</b>
                </li>
              </ul>
            </div>
          </Card>

          <Card title={I.trend_title} icon="fas fa-chart-line" description={I.trend_desc}>
            <div className="ph-empty" style={{ padding: 28 }}>
              <i className="fas fa-chart-line" />
              <h3>{I.trend_title}</h3>
              <p>{I.trend_desc}</p>
            </div>
          </Card>
        </div>

        <form className="ph-filters" onSubmit={(e) => e.preventDefault()}>
          <div className="ph-tabs">
            <button type="button" className={`ph-tab ${status === 'all' ? 'active' : ''}`} onClick={() => setStatus('all')}>
              {I.status_all}
            </button>
            <button type="button" className={`ph-tab ${status === 'ok' ? 'active' : ''}`} onClick={() => setStatus('ok')}>
              {I.status_available}
            </button>
            <button type="button" className={`ph-tab ${status === 'low' ? 'active' : ''}`} onClick={() => setStatus('low')}>
              {I.status_low}
            </button>
            <button type="button" className={`ph-tab ${status === 'out' ? 'active' : ''}`} onClick={() => setStatus('out')}>
              {I.status_out}
            </button>
          </div>
          <div className="ph-search" style={{ flex: 1, maxWidth: 340 }}>
            <i className="fas fa-search" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={I.search_placeholder}
              autoComplete="off"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => {
                setQ('');
                setStatus('all');
              }}
            >
              <i className="fas fa-xmark" /> {I.clear_filters}
            </button>
          )}
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div className="ph-card ph-inventory-table">
            <div className="ph-card-head">
              <h2>
                <i className="fas fa-boxes-stacked" /> {I.update_title}
              </h2>
            </div>
            {/*
              Selection bar. `role="status"` announces the count politely as it
              changes WITHOUT moving focus — a live region must never receive
              focus, or every tick would yank the keyboard away from the row the
              user is on. It is only rendered when something is selected, so it
              does not add a permanent landmark.
            */}
            {selCount > 0 ? (
              <div className="ph-bulk-bar" role="status" aria-live="polite">
                <span className="ph-bulk-count">
                  <i className="fas fa-check-square" aria-hidden="true" />{' '}
                  {I.selected_count.replace(':count', String(selCount))}
                </span>
                <div className="ph-bulk-actions">
                  <input
                    type="number"
                    className="ph-control ph-bulk-qty"
                    min={0}
                    inputMode="numeric"
                    value={bulkQty}
                    onChange={(e) => setBulkQty(e.target.value)}
                    aria-label={I.bulk_quantity_label}
                    placeholder="0"
                  />
                  <Btn
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={bulkQty.trim() === '' || bulkApply.isPending}
                    onClick={() => setConfirmBulk(true)}
                  >
                    <i className="fas fa-layer-group" /> {I.bulk_apply}
                  </Btn>
                  <button
                    type="button"
                    className="ph-btn ghost sm"
                    onClick={() => setSelected(new Set())}
                  >
                    <i className="fas fa-xmark" aria-hidden="true" /> {I.deselect_all}
                  </button>
                </div>
              </div>
            ) : null}
            <div className="ph-card-body ph-table-wrap" style={{ padding: 0 }}>
              <DataTable
                sticky
                onSort={(k) => toggleSort(k as 'medicine' | 'status' | 'qty')}
                columns={[
                  {
                    label: (
                      <span className="ph-select-head">
                        <input
                          type="checkbox"
                          ref={headerCheckRef}
                          checked={selState === 'all'}
                          onChange={() => setSelected((prev) => toggleAll(prev, visibleIds))}
                          aria-label={I.select_all}
                        />
                      </span>
                    ),
                    className: 'ph-select-cell',
                  },
                  {
                    label: I.col_medicine,
                    sort: {
                      key: 'medicine',
                      active: sort.key === 'medicine',
                      ariaSort: ariaSort(sort, 'medicine'),
                      direction: sort.key === 'medicine' ? sort.direction : null,
                    },
                  },
                  {
                    label: I.col_status,
                    sort: {
                      key: 'status',
                      active: sort.key === 'status',
                      ariaSort: ariaSort(sort, 'status'),
                      direction: sort.key === 'status' ? sort.direction : null,
                    },
                  },
                  {
                    label: I.col_current,
                    className: 'ac-num',
                    sort: {
                      key: 'qty',
                      active: sort.key === 'qty',
                      ariaSort: ariaSort(sort, 'qty'),
                      direction: sort.key === 'qty' ? sort.direction : null,
                    },
                  },
                  { label: I.col_edit },
                ]}
              >
                {items.length > 0 ? (
                  sortedItems.map((row) => {
                    const effective = effectiveQty(row);
                    const s = stockStatus(effective);
                    const rowName = row.medicine?.trade_name ?? '';
                    const isSel = selected.has(row.id);
                    return (
                      <tr key={row.id} data-status={s} data-min={LOW_STOCK_THRESHOLD}>
                        <td className="ph-select-cell">
                          {/*
                            Each row checkbox carries a REAL accessible name that
                            identifies the row — a bare "تحديد" leaves a screen
                            reader announcing a list of identical checkboxes with
                            no way to tell which medicine is which.
                          */}
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => setSelected((prev) => toggleOne(prev, row.id))}
                            aria-label={I.select_row.replace(':name', rowName)}
                          />
                        </td>
                        <td>
                          <strong>{rowName}</strong>
                          <br />
                          <small style={{ color: 'var(--ph-ink-faint)' }}>
                            {row.medicine?.active_ingredient}
                          </small>
                          <br />
                          <small style={{ color: 'var(--ph-ink-faint)' }}>{money(row.price)}</small>
                        </td>
                        <td>
                          <span className={`ph-badge ${s}`}>{STATUS_TEXT[s]}</span>
                        </td>
                        <td>{effective}</td>
                        <td>
                          <div className="ph-stepper">
                            <button type="button" className="dec" onClick={() => step(row, -1)}>
                              <i className="fas fa-minus" />
                            </button>
                            <input
                              type="number"
                              name={`quantities[${row.id}]`}
                              value={effective}
                              min={0}
                              onChange={(e) => setQty(row, Number(e.target.value))}
                            />
                            <button type="button" className="inc" onClick={() => step(row, 1)}>
                              <i className="fas fa-plus" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5}>
                      {/*
                        Empty inventory = the pharmacy has added no medicines
                        yet. A bare "لا توجد أدوية في المخزون" tells the user
                        nothing about what to do next, so it carries the one
                        action that actually resolves it: add a medicine.
                        (Phase 2 — item A. No new copy: reuses the existing
                        `medicines.index.add_medicine` label.)
                      */}
                      <EmptyState
                        icon="fas fa-box-open"
                        title={I.empty}
                        action={
                          <Btn variant="primary" to={ROUTES.medicineRequests}>
                            <i className="fas fa-plus" /> {M.add_medicine}
                          </Btn>
                        }
                      />
                    </td>
                  </tr>
                )}
              </DataTable>
            </div>

            {items.length === 0 && hasFilters && (
              <div className="ph-empty" style={{ padding: 24 }}>
                <i className="fas fa-magnifying-glass" />
                <h3>{I.no_results}</h3>
              </div>
            )}

            {items.length > 0 && (
              <div
                style={{
                  padding: '18px 22px',
                  borderBlockStart: '1px solid var(--ph-line-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <Btn type="submit" variant="primary" disabled={!hasChanges || save.isPending}>
                  <i className="fas fa-save" /> {I.save_button}
                </Btn>
                {save.isPending && <span style={{ color: 'var(--ph-ink-faint)' }}>…</span>}
                {/* The success/error text used to live here inline. It is a toast
                    now (see handleSave) — still pending-state only, because a
                    disabled button with no feedback reads as "broken". */}
              </div>
            )}
          </div>
        </form>
      </AsyncBoundary>

      {/*
        A bulk quantity set rewrites stock on many lines at once, so it confirms
        first. The dialog names the quantity and the count it will affect, so
        the user confirms the actual operation rather than a generic "are you
        sure".
      */}
      <Modal
        open={confirmBulk}
        title={I.bulk_apply_confirm_title}
        onClose={() => setConfirmBulk(false)}
        footer={
          <>
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => setConfirmBulk(false)}
              disabled={bulkApply.isPending}
            >
              {AR.accounting.common.cancel}
            </button>
            <button
              type="button"
              className="ph-btn primary"
              onClick={() => void runBulkApply()}
              disabled={bulkApply.isPending}
            >
              <i className="fas fa-check" aria-hidden="true" /> {I.bulk_apply}
            </button>
          </>
        }
      >
        <p>
          {I.bulk_apply_confirm_body
            .replace(':qty', bulkQty)
            .replace(':count', String(selCount))}
        </p>
      </Modal>
    </div>
  );
}
