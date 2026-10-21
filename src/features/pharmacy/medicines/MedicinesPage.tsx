import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/lang/LanguageContext';
import { useUrlState } from '@/lib/urlState';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { AsyncBoundary, Btn, EmptyState } from '@/components/ui';
import { toast } from '@/lib/toast';
import { stockStatus, LOW_STOCK_THRESHOLD } from '@/lib/stock';
import { money, thumbUrl } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import type { ApiInventoryItem } from '@/api/pharmacyTypes';

type Tab = 'all' | 'out' | 'low' | 'ok';

export function MedicinesPage() {
  const { STR } = useLang();
  const M = STR.pharmacy.medicines.index;
  const S = STR.pharmacy.status;
  const I = STR.pharmacy.inventory;
  const T = STR.pharmacy.toast;
  const STATUS_TEXT: Record<'ok' | 'low' | 'out', string> = {
    ok: S.available,
    low: S.low,
    out: S.out,
  };
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();

  // Phase 3: tab + committed search live in the URL (shareable, back/forward-safe).
  const { state, set } = useUrlState({
    tab: { key: 'tab', parse: String, serialize: String, default: 'all' },
    q: { key: 'q', parse: String, serialize: String, default: '' },
  });

  const status = state.tab as Tab;
  const setStatus = (value: Tab) => set({ tab: value });
  /** The committed search term — filters the loaded rows. */
  const q = state.q as string;
  const setQ = (value: string) => set({ q: value });
  /** The live input value. */
  const [draft, setDraft] = useState(q);

  /**
   * ⚠️ The search is CLIENT-SIDE, on purpose.
   *
   * This screen originally sent `?q=` to `/api/pharmacy/inventory`, but
   * `PharmacyInventoryController::index` does **not** read a `q` parameter at
   * all — so the request succeeded and every row came back, i.e. the search box
   * silently did nothing.
   *
   * Filtering the loaded page is the honest fix while the backend has no search
   * parameter here. It is scoped to the rows fetched below (`per_page: 100`), so
   * a catalogue larger than that needs server-side search — reported as GAP-4.
   * The inventory screen (`/inventory`) filters the same way.
   */
  const query = useApiQuery<{ data: ApiInventoryItem[] }>(
    (signal) => api.inventory({ per_page: 100 }, signal),
    [],
    { queryKey: keys.inventory.list({ per_page: 100 }), isEmpty: (r) => r.data.length === 0 },
  );

  /** Memoised so the `?? []` fallback does not break downstream memo identity. */
  const rows = useMemo(() => query.data?.data ?? [], [query.data]);

  /** Local quantity edits, keyed by pharmacy_medicine id. */
  const [drafts, setDrafts] = useState<Record<number, number>>({});

  const effectiveQty = (row: ApiInventoryItem) => drafts[row.id] ?? row.quantity;

  const dirtyChanges = useMemo(
    () =>
      rows
        .filter((row) => drafts[row.id] !== undefined && drafts[row.id] !== row.quantity)
        .map((row) => {
          const quantity = drafts[row.id] ?? row.quantity;
          return { id: row.id, quantity, is_available: quantity > 0 };
        }),
    [rows, drafts],
  );
  const hasChanges = dirtyChanges.length > 0;

  const save = useApiMutation(
    (changes: Array<{ id: number; quantity: number; is_available: boolean }>) =>
      api.bulkUpdateInventory(changes),
    {
      invalidates: [
        keys.inventory.list({ per_page: 100 }),
        keys.dashboardStats,
        keys.sidebarCounts,
      ],
    },
  );
  const remove = useApiMutation((id: number) => api.deleteMedicine(id), {
    invalidates: [
      keys.inventory.list({ per_page: 100 }),
      keys.dashboardStats,
      keys.sidebarCounts,
    ],
  });

  const step = (row: ApiInventoryItem, delta: number) =>
    setDrafts((prev) => ({
      ...prev,
      [row.id]: Math.max(0, (prev[row.id] ?? row.quantity) + delta),
    }));

  const setQty = (row: ApiInventoryItem, value: number) =>
    setDrafts((prev) => ({
      ...prev,
      [row.id]: Math.max(0, Number.isFinite(value) ? Math.trunc(value) : 0),
    }));

  async function handleSave() {
    if (!hasChanges) return;
    try {
      const result = await save.run(dirtyChanges);
      toast.success(I.toast_saved.replace(':count', String(result.updated_count)));
      setDrafts({});
    } catch (err) {
      const serverMessage = save.error?.message;
      const thrown = err instanceof Error ? err.message : undefined;
      toast.error(serverMessage || thrown || I.toast_error);
    }
  }

  async function handleDelete(row: ApiInventoryItem) {
    if (!window.confirm(M.delete_confirm)) return;
    try {
      await remove.run(row.id);
      toast.success(T.deleted);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : T.delete_failed);
    }
  }

  const hasFilters = q !== '' || status !== 'all';

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      const quantity = drafts[row.id] ?? row.quantity;
      const rowStatus = row.is_available ? stockStatus(quantity) : 'out';
      if (status !== 'all' && rowStatus !== status) return false;
      if (needle === '') return true;
      const name = row.medicine?.trade_name ?? '';
      const ingredient = row.medicine?.active_ingredient ?? '';
      return (
        name.toLowerCase().includes(needle) || ingredient.toLowerCase().includes(needle)
      );
    });
  }, [rows, status, q, drafts]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(draft.trim());
  }

  return (
    <div className="ph-page">
      <div className="ph-head">
        <div className="ph-page-title">
          <h1>{M.heading_page}</h1>
          <p>{M.subtitle_page}</p>
        </div>
        <div className="ph-actions">
          <Link to={ROUTES.medicineCreate} className="ph-btn primary">
            <i className="fas fa-plus" /> {M.add_medicine}
          </Link>
        </div>
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
        loadingRows={4}
      >
        <form className="ph-filters" onSubmit={submitSearch}>
          <div className="ph-tabs">
            {(['all', 'out', 'low', 'ok'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                className={`ph-tab ${status === t ? 'active' : ''}`}
                onClick={() => setStatus(t)}
              >
                {t === 'all' ? S.all : t === 'out' ? S.out : t === 'low' ? S.low : S.available}
              </button>
            ))}
          </div>
          <div className="ph-search">
            <i className="fas fa-search" />
            <input
              type="search"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={M.search_placeholder}
              autoComplete="off"
              name="q"
            />
          </div>
        </form>

        <div className="ph-card ph-medicine-table">
          <div className="ph-card-body ph-table-wrap" style={{ padding: 0 }}>
            <table className="ph-table">
              <thead>
                <tr>
                  <th>{M.col_medicine}</th>
                  <th>{M.col_ingredient}</th>
                  <th>{M.col_price}</th>
                  <th>{M.col_status}</th>
                  <th>{M.col_quantity}</th>
                  <th>{M.col_actions}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length > 0 ? (
                  visible.map((row) => {
                    const effective = effectiveQty(row);
                    const s = row.is_available ? stockStatus(effective) : 'out';
                    const name = row.medicine?.trade_name ?? '';
                    const ingredient = row.medicine?.active_ingredient ?? '';
                    const image = thumbUrl(row.medicine?.image_url, 88, 88);
                    return (
                      <tr key={row.id} data-status={s} data-min={LOW_STOCK_THRESHOLD}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div className="ph-med-thumb">
                              {image ? (
                                <img src={image} alt={name} width={44} height={44} loading="lazy" decoding="async" />
                              ) : (
                                <i className="fas fa-pills" />
                              )}
                            </div>
                            <div className="med-cell-text">
                              <strong title={name}>{name}</strong>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="med-ingredient-text" title={ingredient}>
                            {ingredient}
                          </span>
                        </td>
                        <td>{money(row.price)}</td>
                        <td>
                          <span className={`ph-badge ${s}`}>{STATUS_TEXT[s]}</span>
                        </td>
                        <td>
                          <div className="ph-stepper">
                            <button type="button" className="dec" onClick={() => step(row, -1)} aria-label="−">
                              <i className="fas fa-minus" />
                            </button>
                            <input
                              type="number"
                              name={`quantities[${row.id}]`}
                              min={0}
                              step={1}
                              inputMode="numeric"
                              value={effective}
                              onChange={(e) => setQty(row, Number(e.target.value))}
                            />
                            <button type="button" className="inc" onClick={() => step(row, 1)} aria-label="+">
                              <i className="fas fa-plus" />
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ph-btn icon danger"
                            title={M.delete_tooltip}
                            aria-label={M.delete_tooltip}
                            disabled={remove.isPending || save.isPending}
                            onClick={() => void handleDelete(row)}
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      {hasFilters ? (
                        <div className="ph-empty">
                          <i className="fas fa-magnifying-glass" />
                          <h3>{I.no_results}</h3>
                        </div>
                      ) : (
                        <EmptyState
                          icon="fas fa-box-open"
                          title={M.empty_title}
                          description={M.empty_desc}
                          action={
                            <Btn variant="primary" to={ROUTES.medicineCreate}>
                              <i className="fas fa-plus" /> {M.add_medicine}
                            </Btn>
                          }
                        />
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {rows.length > 0 && (
            <div
              style={{
                padding: '18px 22px',
                borderBlockStart: '1px solid var(--ph-line-soft)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <Btn
                type="button"
                variant="primary"
                disabled={!hasChanges || save.isPending || remove.isPending}
                onClick={() => void handleSave()}
              >
                <i className="fas fa-save" /> {I.save_button}
              </Btn>
              {save.isPending && <span style={{ color: 'var(--ph-ink-faint)' }}>…</span>}
            </div>
          )}
        </div>
      </AsyncBoundary>
    </div>
  );
}
