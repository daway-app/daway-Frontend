import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AR } from '@/lib/i18n';
import { usePharmacyApi } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { AsyncBoundary, Btn, EmptyState } from '@/components/ui';
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
  /** The committed search term — filters the loaded rows. */
  const [q, setQ] = useState('');
  /** The live input value. */
  const [draft, setDraft] = useState('');

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
    { isEmpty: (r) => r.data.length === 0 },
  );

  /** Memoised so the `?? []` fallback does not break downstream memo identity. */
  const rows = useMemo(() => query.data?.data ?? [], [query.data]);
  const { total, out, low, available } = useMemo(() => countStock(rows), [rows]);

  const hasFilters = q !== '' || status !== 'all';

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && stockStatus(row.quantity) !== status) return false;
      if (needle === '') return true;
      const name = row.medicine?.trade_name ?? '';
      const ingredient = row.medicine?.active_ingredient ?? '';
      return (
        name.toLowerCase().includes(needle) || ingredient.toLowerCase().includes(needle)
      );
    });
  }, [rows, status, q]);

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
          {/*
            Was `/medicines/create`, which has NO route in this SPA — the router
            only declares `medicines/*` → a placeholder, so the button opened an
            empty page. The working destination for adding a medicine is the
            request form, which posts to `/api/pharmacy/medicine-requests`.
          */}
          <Link to="/medicines/request" className="ph-btn primary">
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
                            {/*
                              ⚠️ There is no medicine-edit screen in this SPA yet,
                              so this lands on the `medicines/*` placeholder. It is
                              a `Link` (not a raw <a>) so the click stays inside
                              the SPA and does not trigger a full page reload.
                              Building the edit screen is an open follow-up.
                            */}
                            <Link
                              to={`/medicines/${row.medicine_id ?? row.id}`}
                              className="ph-btn icon outline"
                              title={M.edit_tooltip}
                            >
                              <i className="fas fa-pen" />
                            </Link>
                            {/*
                              🔴 This button used to call `window.confirm("…delete
                              this medicine?")` and then DO NOTHING — there is no
                              delete endpoint (`routes/api.php` only exposes GET
                              for medicines). Confirming a destructive action and
                              having nothing happen is worse than not offering it.

                              The button is kept (removing it would drop a piece
                              of the UI the Blade page has) but disabled, with a
                              title that states the truth instead of a fake
                              confirmation.
                            */}
                            <button
                              type="button"
                              className="ph-btn icon danger"
                              title={M.delete_unavailable}
                              aria-label={M.delete_unavailable}
                              disabled
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
                      {/*
                        First-use: a brand-new pharmacy sees an empty table with
                        no way forward. The unfiltered case now carries the one
                        action that resolves it. The FILTERED case must NOT — the
                        user already knows how to add; they just searched for
                        something that is not there. (Phase 2.)
                      */}
                      {hasFilters ? (
                        <div className="ph-empty">
                          <i className="fas fa-magnifying-glass" />
                          <h3>{AR.pharmacy.inventory.no_results}</h3>
                        </div>
                      ) : (
                        <EmptyState
                          icon="fas fa-box-open"
                          title={M.empty_title}
                          description={M.empty_desc}
                          action={
                            <Btn variant="primary" to="/medicines/request">
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
        </div>
      </AsyncBoundary>
    </div>
  );
}
