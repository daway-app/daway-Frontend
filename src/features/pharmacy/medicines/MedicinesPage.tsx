import { useMemo, useState } from 'react';
import { AR } from '@/lib/i18n';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { AsyncBoundary } from '@/components/ui';
import { countStock, stockStatus, LOW_STOCK_THRESHOLD } from '@/lib/stock';
import { money, thumbUrl } from '@/lib/format';
import type { ApiInventoryItem } from '@/api/pharmacyTypes';

/**
 * Pharmacy medicines index — live against `GET /api/pharmacy/medicines`.
 *
 * Structure still mirrors `resources/views/pharmacy/medicines/index.blade.php`
 * 1:1 (same wrappers, same `.ph-*` classes).
 *
 * Deliberate changes from the mock version:
 *
 *  1. **Counts are derived, not trusted.** `countStock(rows)` applies the
 *     approved quantity-only rule. The API's `stats.available_count` double
 *     counts low rows (DEFECT-1, see `src/lib/stock.ts`).
 *
 *  2. **Search is server-side.** Unlike the inventory screen, this endpoint
 *     exposes a `q` filter, so a search is a real request rather than a filter
 *     over the current page only. The status tabs stay client-side, because the
 *     API has no status parameter here.
 *
 *  3. The delete action keeps Blade's `confirm()` gate but performs nothing —
 *     deleting a medicine is a write the patient-facing catalogue depends on,
 *     and is out of scope for this wiring pass.
 */
const M = AR.pharmacy.medicines.index;
const S = AR.pharmacy.status;
const D = AR.pharmacy.dashboard;

type Tab = 'all' | 'out' | 'low' | 'ok';

const STATUS_TEXT: Record<'ok' | 'low' | 'out', string> = {
  ok: S.available,
  low: S.low,
  out: S.out,
};

export function MedicinesPage() {
  const api = usePharmacyApi();

  const [status, setStatus] = useState<Tab>('all');
  /** The committed search term — only this drives the request. */
  const [q, setQ] = useState('');
  /** The live input value (so typing does not refetch on every keystroke). */
  const [draft, setDraft] = useState('');

  const query = useApiQuery<{ data: ApiInventoryItem[] }>(
    (signal) => api.inventory({ per_page: 100, ...(q ? { q } : {}) }, signal),
    [q],
    { isEmpty: (r) => r.data.length === 0 },
  );

  /** Memoised so the `?? []` fallback does not break downstream memo identity. */
  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const { total, out, low, available } = useMemo(() => countStock(rows), [rows]);

  const hasFilters = q !== '' || status !== 'all';

  const visible = useMemo(() => {
    if (status === 'all') return rows;
    return rows.filter((row) => stockStatus(row.quantity) === status);
  }, [rows, status]);

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
          <a href="/medicines/create" className="ph-btn primary">
            <i className="fas fa-plus" /> {M.add_medicine}
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
            <i className="fas fa-xmark red" />
            <div>
              <strong>{out}</strong>
              <span>{S.out}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
          <div className="ph-stat">
            <i className="fas fa-triangle-exclamation orange" />
            <div>
              <strong>{low}</strong>
              <span>{S.low_stock}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
          <div className="ph-stat">
            <i className="fas fa-check green" />
            <div>
              <strong>{available}</strong>
              <span>{S.available}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
          <div className="ph-stat">
            <i className="fas fa-pills teal" />
            <div>
              <strong>{total}</strong>
              <span>{D.stat_total}</span>
            </div>
            <span className="ph-stat-progress" />
          </div>
        </div>

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
          {hasFilters && (
            <button
              type="button"
              className="ph-btn ghost"
              onClick={() => {
                setDraft('');
                setQ('');
                setStatus('all');
              }}
            >
              <i className="fas fa-xmark" /> {AR.pharmacy.inventory.clear_filters}
            </button>
          )}
        </form>

        <div className="ph-card ph-medicine-table">
          <div className="ph-card-body ph-table-wrap" style={{ padding: 0 }}>
            <table className="ph-table">
              <thead>
                <tr>
                  <th>{M.col_medicine}</th>
                  <th>{M.col_ingredient}</th>
                  <th>{M.col_price}</th>
                  <th>{M.col_quantity}</th>
                  <th>{M.col_status}</th>
                  <th>{M.col_actions}</th>
                </tr>
              </thead>
              <tbody>
                {visible.length > 0 ? (
                  visible.map((row) => {
                    const s = stockStatus(row.quantity);
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
                        <td>{row.quantity}</td>
                        <td>
                          <span className={`ph-badge ${s}`}>{STATUS_TEXT[s]}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <a
                              href={`/medicines/${row.medicine_id ?? row.id}`}
                              className="ph-btn icon outline"
                              title={M.edit_tooltip}
                            >
                              <i className="fas fa-pen" />
                            </a>
                            <button
                              type="button"
                              className="ph-btn icon danger"
                              title={M.delete_tooltip}
                              onClick={() => window.confirm(M.delete_confirm)}
                            >
                              <i className="fas fa-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6}>
                      <div className="ph-empty">
                        <i className="fas fa-box-open" />
                        <h3>{hasFilters ? AR.pharmacy.inventory.no_results : M.empty_title}</h3>
                        {!hasFilters && <p>{M.empty_desc}</p>}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </AsyncBoundary>
    </div>
  );
}
