import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AsyncBoundary,
  Badge,
  Btn,
  DataTable,
  EmptyState,
  Modal,
} from '@/components/ui';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/LanguageContext';
import { useUrlState } from '@/lib/urlState';
import { money, num, pageInfo, tpl } from '../shared';
import { thumbUrl } from '@/lib/format';
import { ariaSort, useSort } from '@/lib/sort';
import { toast } from '@/lib/toast';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import type { AdminMedicinesResponse, AdminMedicine } from '@/api/adminTypes';

/**
 * Admin medicines — the platform's own catalogue with live stock rollups.
 *
 * Mirrors `medicines/index.blade.php`: the same header block, breadcrumb, four
 * stat cards, the two CSS-only charts, the filter card, the table and the row
 * actions. Two deliberate divergences from the Blade table:
 *
 *  1. **No `col_alternative` column.** Blade renders one and hard-codes `• —`
 *     in every row — a column that has never shown a value. Rendering a
 *     permanently-empty column adds noise and claims the data exists.
 *  2. **No `is_available` column either.** The controller selects it and no
 *     template reads it (dead column). Stock status is computed from real
 *     quantities, which is what the column actually showed anyway.
 *
 * Sorting is client-side over the current page, matching the inventory screen's
 * precedent: the API paginates by `created_at`, and re-sorting 50 loaded rows is
 * instant, whereas a server-side sort would mean a request per click and a new
 * `sort` parameter the endpoint does not accept.
 */
export function AdminMedicinesPage() {
  const { STR } = useLang();
  const api = useAdminApi();

  // Phase 3: filters + pagination in the URL (shareable, back/forward-safe).
  const { state, set } = useUrlState({
    q: { key: 'q', parse: String, serialize: String, default: '' },
    status: { key: 'status', parse: String, serialize: String, default: 'all' },
    page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  });

  /** The live input value; the URL `q` is the committed (debounced) term. */
  const [q, setQ] = useState(state.q as string);
  const committedQ = state.q as string;
  const status = state.status as 'all' | 'available' | 'low' | 'out';
  const setStatus = (value: typeof status) => set({ status: value, page: 1 });
  const page = Math.max(1, Number(state.page) || 1);
  const setPage = (value: number | ((p: number) => number)) => {
    set({ page: typeof value === 'function' ? value(page) : value });
  };
  const [pendingDelete, setPendingDelete] = useState<AdminMedicine | null>(null);
  const [deleting, setDeleting] = useState(false);

  const M = STR.admin.medicines;

  // Commit the live input to the URL after a pause, and reset to page 1 — but
  // only when the term actually changed, so a deep link (`?q=…&page=3`) is not
  // rewritten on mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q !== committedQ) set({ q, page: 1 });
    }, 350);
    return () => clearTimeout(timer);
  }, [q, committedQ, set]);

  const query = useApiQuery<AdminMedicinesResponse>(
    (signal) => api.admin.medicines({ q: committedQ, status, page, per_page: 50 }, signal),
    [committedQ, status, page],
  );

  const rows = useMemo(() => query.data?.medicines ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const stats = query.data?.stats;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  /** See AdminMedicineRequestsPage — the recovery action only appears when a
   *  filter is actually responsible for the empty list. */
  const isFiltered = q.trim() !== '' || status !== 'all';
  function clearFilters() {
    setQ('');
    set({ q: '', status: 'all', page: 1 });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await api.admin.deleteMedicine(pendingDelete.id);
      toast.success(M.deleted);
      setPendingDelete(null);
      query.refetch();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : M.delete_failed);
    } finally {
      setDeleting(false);
    }
  }

  /** Status derived per row from the quantity — never from a stored flag. */
  function statusOf(row: AdminMedicine): { label: string; variant: 'ok' | 'low' | 'out' } {
    const stock = num(row.stock);
    if (stock <= 0) return { label: M.status_out, variant: 'out' };
    if (stock <= 10) return { label: M.status_low, variant: 'low' };
    return { label: M.status_available, variant: 'ok' };
  }

  const { sort, toggle, sorted } = useSort<AdminMedicine, 'medicine' | 'stock' | 'price'>(
    rows,
    (row, key) => {
      switch (key) {
        case 'medicine':
          return row.trade_name;
        case 'stock':
          return num(row.stock);
        case 'price':
          return num(row.min_price);
      }
    },
  );

  /*
   * The donut's slice boundary. `in_pharmacy_pct` is an INTEGER percentage, so
   * the angle is `pct * 3.6` — exactly what the Blade template computes inline
   * (`style="--seg1: {{ $stats['in_pharmacy_pct'] * 3.6 }}deg"`).
   */
  const seg1 = num(stats?.in_pharmacy_pct) * 3.6;

  return (
    <div className="admin-page animated-page">
      {/* 1. Top header — title block + the create action, matching Blade's
             `.top-header-bar` / `.header-actions` pair. */}
      <div className="top-header-bar">
        <div className="header-title-section">
          <h1>{M.main_heading}</h1>
          <p>{M.main_description}</p>
        </div>
        <div className="header-actions">
          {/* `variant="primary"` — Blade's `.btn-add-pharmacy` is a FILLED
              gradient button (backend `medicines.css:138`). The class name was
              never carried into this repo (see `admin-shell.css` §3), so the
              button rendered as bare text while the pharmacies screen — which
              passes `variant="primary"` — rendered filled. One button system. */}
          <Btn to={ADMIN_ROUTES.medicineCreate} variant="primary" icon="fas fa-plus">
            {M.add_button}
          </Btn>
        </div>
      </div>

      {/* 2. Breadcrumb trail */}
      <nav className="breadcrumb-trail" aria-label="مسار التنقل">
        <Link to={ADMIN_ROUTES.dashboard}>{M.breadcrumb_main}</Link>
        <span aria-hidden="true">‹</span>
        <span>{M.breadcrumb_current}</span>
      </nav>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            {/* 3. Stats — Blade's `.stats-grid` / `.stat-card` / `.stat-value`
                   vocabulary, verbatim. */}
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-title">{M.stat_total}</span>
                <span className="stat-value total">{num(stats?.total)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">{M.stat_available}</span>
                <span className="stat-value available">{num(stats?.available)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">{M.stat_low}</span>
                <span className="stat-value low">{num(stats?.low)}</span>
              </div>
              <div className="stat-card">
                <span className="stat-title">{M.stat_out}</span>
                <span className="stat-value out">{num(stats?.out)}</span>
              </div>
            </div>

            {/* 4. Charts — pure CSS, no canvas and no chart library. The donut
                   is a `conic-gradient` driven by `--seg1`; the bars are divs
                   whose width arrives as `--fill-w`. Both read the `stats`
                   payload the list request already returned. */}
            <div className="charts-section-grid">
              <div className="chart-card">
                <div className="chart-card-header">
                  <div className="header-icon icon-teal" aria-hidden="true">
                    <i className="fas fa-chart-pie" />
                  </div>
                  <div>
                    <h3>{M.coverage_title}</h3>
                    <p className="chart-subtext">{M.coverage_desc}</p>
                  </div>
                </div>

                <div className="chart-donut-layout">
                  {/* A decorative ring: the numbers are printed inside and in
                      the legend beside it, so the graphic itself carries no
                      information a screen reader would miss. */}
                  <div className="donut-container-lg" aria-hidden="true">
                    <div className="donut-chart-animated" style={{ '--seg1': `${seg1}deg` } as React.CSSProperties}>
                      <div className="donut-inner-hole">
                        <span className="donut-number">{num(stats?.total)}</span>
                        <span className="donut-caption">{M.total_medicines_label}</span>
                      </div>
                    </div>
                  </div>

                  <dl className="chart-legend-vertical">
                    <div className="legend-row">
                      <span className="dot-indicator" style={{ '--dot-color': '#1C72A6' } as React.CSSProperties} aria-hidden="true" />
                      <dt className="legend-text">{M.coverage_in}</dt>
                      <dd className="badge-percent badge-teal">{num(stats?.in_pharmacy_pct)}%</dd>
                    </div>
                    <div className="legend-row">
                      <span className="dot-indicator" style={{ '--dot-color': '#e11d48' } as React.CSSProperties} aria-hidden="true" />
                      <dt className="legend-text">{M.coverage_out}</dt>
                      <dd className="badge-percent badge-rose">{num(stats?.not_in_pharmacy_pct)}%</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="chart-card">
                <div className="chart-card-header">
                  <div className="header-icon icon-emerald" aria-hidden="true">
                    <i className="fas fa-box" />
                  </div>
                  <div>
                    <h3>{M.availability_status_title}</h3>
                    <p className="chart-subtext">{M.availability_status_desc}</p>
                  </div>
                </div>

                <div className="bars-chart-container">
                  {(
                    [
                      ['emerald', M.available_status, num(stats?.available_pct)],
                      ['amber', M.low_stock_status, num(stats?.low_pct)],
                      ['rose', M.out_of_stock_status, num(stats?.out_pct)],
                    ] as const
                  ).map(([tone, label, pct]) => (
                    <div className="bar-progress-group" key={tone}>
                      <div className="bar-info-row">
                        <span className="bar-title">
                          <span aria-hidden="true">● </span>
                          {label}
                        </span>
                        <span className={`bar-percentage text-${tone}`}>{pct}%</span>
                      </div>
                      {/* A real progressbar, so the value is announced rather
                          than only drawn. */}
                      <div
                        className="bar-track"
                        role="progressbar"
                        aria-label={label}
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`bar-fill fill-${tone}`}
                          style={{ '--fill-w': `${pct}%` } as React.CSSProperties}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. Filter card */}
            <div className="filter-card">
              <div className="filter-row">
                <input
                  type="search"
                  className="filter-input"
                  placeholder={STR.admin.common.search}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={STR.admin.common.search}
                  autoComplete="off"
                />
                <select
                  className="filter-select"
                  value={status}
                  onChange={(e) => {
                    const next = e.target.value as typeof status;
                    setStatus(next);
                    setPage(1);
                  }}
                  aria-label={M.filter_all}
                >
                  <option value="all">{M.filter_all}</option>
                  <option value="available">{M.filter_available}</option>
                  <option value="low">{M.filter_low}</option>
                  <option value="out">{M.filter_out}</option>
                </select>
              </div>
            </div>

            {/* 6. Table card */}
            <div className="main-card">
              <div className="card-top-bar">
                <h3>{M.table_heading}</h3>
                <span>{tpl(M.registered_medicines, { count: num(pagination?.total) })}</span>
              </div>

              {rows.length === 0 ? (
                <div className="table-empty-cell">
                  <EmptyState
                    icon="fas fa-pills"
                    title={M.empty}
                    description={isFiltered ? STR.admin.common.empty_filtered_hint : M.empty_hint}
                    action={
                      isFiltered ? (
                        <Btn size="sm" variant="outline" onClick={clearFilters}>
                          <i className="fas fa-rotate-left" aria-hidden="true" />{' '}
                          {STR.admin.common.clear_filters}
                        </Btn>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={M.title}
                  columns={[
                    { label: M.col_image, className: 'ac-thumb' },
                    {
                      label: M.col_medicine,
                      sort: {
                        key: 'medicine',
                        active: sort.key === 'medicine',
                        ariaSort: ariaSort(sort, 'medicine'),
                        direction: sort.key === 'medicine' ? sort.direction : null,
                      },
                    },
                    M.col_ingredient,
                    {
                      label: M.col_stock,
                      className: 'ac-num',
                      sort: {
                        key: 'stock',
                        active: sort.key === 'stock',
                        ariaSort: ariaSort(sort, 'stock'),
                        direction: sort.key === 'stock' ? sort.direction : null,
                      },
                    },
                    {
                      label: M.col_lowest_price,
                      className: 'ac-num',
                      sort: {
                        key: 'price',
                        active: sort.key === 'price',
                        ariaSort: ariaSort(sort, 'price'),
                        direction: sort.key === 'price' ? sort.direction : null,
                      },
                    },
                    M.col_available_in,
                    M.col_status,
                    { label: M.col_actions, className: 'ac-actions' },
                  ]}
                  onSort={toggle}
                >
                  {sorted.map((row) => {
                    const state = statusOf(row);
                    const image = thumbUrl(row.image_url, 88, 88);
                    return (
                      <tr key={row.id}>
                        <td className="ac-thumb">
                          <span className="ph-med-thumb">
                            {image ? (
                              <img
                                src={image}
                                alt={row.trade_name}
                                width={44}
                                height={44}
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <i className="fas fa-pills" aria-hidden="true" />
                            )}
                          </span>
                        </td>
                        <td>{row.trade_name}</td>
                        <td>{row.active_ingredient ?? '—'}</td>
                        <td className="ac-num">{num(row.stock)}</td>
                        <td className="ac-num">{money(row.min_price)}</td>
                        <td>
                          {num(row.pharmacy_count) > 0
                            ? tpl(M.pharmacy_count, { count: num(row.pharmacy_count) })
                            : '—'}
                        </td>
                        <td>
                          <Badge variant={state.variant}>{state.label}</Badge>
                        </td>
                        <td className="ac-actions">
                          {/* Blade renders delete BEFORE edit in the RTL group
                              (delete is the leading visual button). Kept in the
                              same order so the two screens match. */}
                          <div className="action-btn-group">
                            <button
                              type="button"
                              className="action-btn delete"
                              title={M.action_delete}
                              aria-label={`${M.action_delete} — ${row.trade_name}`}
                              onClick={() => setPendingDelete(row)}
                            >
                              <i className="fas fa-trash-can" aria-hidden="true" />
                            </button>
                            <Link
                              to={ADMIN_ROUTES.medicineEdit(row.id)}
                              className="action-btn edit"
                              title={M.action_edit}
                              aria-label={`${M.action_edit} — ${row.trade_name}`}
                            >
                              <i className="fas fa-pen" aria-hidden="true" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </DataTable>
              )}

              {pagination && pagination.last_page > 1 && (
                <div className="pagination-wrapper">
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {STR.admin.common.previous}
                  </Btn>
                  <span className="page-meta">{info?.label}</span>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {STR.admin.common.next}
                  </Btn>
                </div>
              )}
            </div>
          </>
        )}
      </AsyncBoundary>

      {/* Deletion is destructive and irreversible — it goes through a real
          dialog rather than a `confirm()` so the medicine's name is on screen
          while the choice is made. */}
      <Modal
        open={pendingDelete !== null}
        title={M.action_delete}
        onClose={() => !deleting && setPendingDelete(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn variant="danger" onClick={confirmDelete} disabled={deleting}>
              {deleting ? STR.admin.common.loading : STR.admin.common.confirm}
            </Btn>
          </>
        }
      >
        <p>{M.delete_confirm}</p>
        {pendingDelete && <p className="ac-strong">{pendingDelete.trade_name}</p>}
      </Modal>
    </div>
  );
}
