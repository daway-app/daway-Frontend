import { useEffect, useMemo, useState } from 'react';
import { Chart } from '@/components/ui/Chart';
import { AsyncBoundary, Card, Btn, EmptyState } from '@/components/ui';
import { AR } from '@/lib/i18n';
import { ROUTES } from '@/routes/paths';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { countStock, stockStatus, LOW_STOCK_THRESHOLD } from '@/lib/stock';
import { money } from '@/lib/format';
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

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

  async function handleSave() {
    if (!hasChanges) return;
    setSaveMessage(null);
    try {
      const result = await save.run(dirtyChanges);
      setSaveMessage(`${I.save_button} — ${result.updated_count}`);
      query.refetch();
    } catch {
      // `save.error` carries the message; it is rendered below.
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
            <div className="ph-card-body ph-table-wrap" style={{ padding: 0 }}>
              <table className="ph-table">
                <thead>
                  <tr>
                    <th>{I.col_medicine}</th>
                    <th>{I.col_status}</th>
                    <th>{I.col_current}</th>
                    <th>{I.col_edit}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length > 0 ? (
                    items.map((row) => {
                      const effective = effectiveQty(row);
                      const s = stockStatus(effective);
                      return (
                        <tr key={row.id} data-status={s} data-min={LOW_STOCK_THRESHOLD}>
                          <td>
                            <strong>{row.medicine?.trade_name}</strong>
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
                      <td colSpan={4}>
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
                </tbody>
              </table>
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
                {saveMessage && !save.isPending && (
                  <span style={{ color: 'var(--ph-success)' }}>{saveMessage}</span>
                )}
                {save.error && (
                  <span style={{ color: 'var(--ph-red)' }}>{save.error.message}</span>
                )}
              </div>
            )}
          </div>
        </form>
      </AsyncBoundary>
    </div>
  );
}
