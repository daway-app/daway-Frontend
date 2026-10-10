import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { money, num, pageInfo, tpl } from '../shared';
import { ariaSort, useSort } from '@/lib/sort';
import type { AdminMedicinesResponse, AdminMedicine } from '@/api/adminTypes';

/**
 * Admin medicines — the platform's own catalogue with live stock rollups.
 *
 * Mirrors `medicines/index.blade.php`. Two deliberate divergences:
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
  const api = useAdminApi();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'available' | 'low' | 'out'>('all');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');

  const M = AR.admin.medicines;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminMedicinesResponse>(
    (signal) => api.admin.medicines({ q: debouncedQ, status, page, per_page: 50 }, signal),
    [debouncedQ, status, page],
  );

  const rows = useMemo(() => query.data?.medicines ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const stats = query.data?.stats;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

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

  return (
    <>
      <PageHeader title={M.title} subtitle={AR.admin.nav.medicines} icon="fas fa-pills" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <div className="ph-stats-grid">
              <StatCard tone="blue" icon="fas fa-pills" value={num(stats?.total)} label={M.stat_total} />
              <StatCard
                tone="green"
                icon="fas fa-circle-check"
                value={num(stats?.available)}
                label={M.stat_available}
              />
              <StatCard tone="orange" icon="fas fa-triangle-exclamation" value={num(stats?.low)} label={M.stat_low} />
              <StatCard tone="red" icon="fas fa-circle-xmark" value={num(stats?.out)} label={M.stat_out} />
            </div>

            <Card
              headExtra={
                <div className="admin-filters">
                  <input
                    type="search"
                    className="admin-search"
                    placeholder={AR.admin.common.search}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label={AR.admin.common.search}
                  />
                  <div className="ph-pills">
                    {(['all', 'available', 'low', 'out'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`ph-pill${status === key ? ' active' : ''}`}
                        aria-pressed={status === key}
                        onClick={() => {
                          setStatus(key);
                          setPage(1);
                        }}
                      >
                        {key === 'all'
                          ? M.filter_all
                          : key === 'available'
                            ? M.filter_available
                            : key === 'low'
                              ? M.filter_low
                              : M.filter_out}
                      </button>
                    ))}
                  </div>
                </div>
              }
            >
              {rows.length === 0 ? (
                <div className="admin-empty">
                  <p>{M.empty}</p>
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={M.title}
                  columns={[
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
                  ]}
                  onSort={toggle}
                >
                  {sorted.map((row) => {
                    const state = statusOf(row);
                    return (
                      <tr key={row.id}>
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
                      </tr>
                    );
                  })}
                </DataTable>
              )}

              {pagination && pagination.last_page > 1 && (
                <div className="admin-pagination">
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    {AR.admin.common.previous}
                  </Btn>
                  <span>{info?.label}</span>
                  <Btn
                    size="sm"
                    variant="outline"
                    disabled={pagination.current_page >= pagination.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {AR.admin.common.next}
                  </Btn>
                </div>
              )}
            </Card>
          </>
        )}
      </AsyncBoundary>
    </>
  );
}
