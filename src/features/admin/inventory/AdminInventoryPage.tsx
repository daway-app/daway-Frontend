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
import { ariaSort, useSort } from '@/lib/sort';
import { num, pageInfo } from '../shared';
import type { AdminInventoryResponse, AdminInventoryRow } from '@/api/adminTypes';

/**
 * Admin inventory — the platform-wide stock rollup.
 *
 * Mirrors `inventory/index.blade.php` (or the inventory tab of the admin
 * panel): every medicine in the catalogue with its total quantity summed
 * across all pharmacies, and how many pharmacies carry it.
 *
 * WHY THE STATUS IS DERIVED, NOT READ
 * -----------------------------------
 * The backend returns `pharmacy_medicines_sum_quantity` (a raw `SUM()`), not a
 * status field. The status shown here is computed from that quantity with the
 * SAME thresholds the rest of the admin uses (0 → out, ≤10 → low, else in
 * stock). How those totals were produced is not re-implemented — only the
 * display bucket, which keeps this screen consistent with the medicines page
 * and the dashboard's stock summary.
 *
 * `SUM()` and `COUNT()` arrive as numeric STRINGS over some MySQL drivers, so
 * every comparison goes through `num()` first. `'0' <= 0` is `true` in JS but
 * `'5' <= 10` is also `true` only by coercion — relying on that is how a
 * quantity ends up labelled wrongly.
 */
export function AdminInventoryPage() {
  const api = useAdminApi();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');

  const I = AR.admin.inventory;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminInventoryResponse>(
    (signal) => api.admin.inventory({ q: debouncedQ, page, per_page: 50 }, signal),
    [debouncedQ, page],
  );

  const rows = useMemo(() => query.data?.medicines ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const summary = query.data?.stock_summary;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  /** Bucket a row by its summed quantity — see the note above. */
  function statusOf(row: AdminInventoryRow): {
    label: string;
    variant: 'ok' | 'low' | 'out';
  } {
    const total = num(row.pharmacy_medicines_sum_quantity);
    if (total <= 0) return { label: I.status_out_of_stock, variant: 'out' };
    if (total <= 10) return { label: I.status_low_stock, variant: 'low' };
    return { label: I.status_in_stock, variant: 'ok' };
  }

  const { sort, toggle, sorted } = useSort<AdminInventoryRow, 'medicine' | 'qty' | 'pharmacies'>(
    rows,
    (row, key) => {
      switch (key) {
        case 'medicine':
          return row.trade_name;
        case 'qty':
          return num(row.pharmacy_medicines_sum_quantity);
        case 'pharmacies':
          return num(row.pharmacy_medicines_count);
      }
    },
  );

  return (
    <>
      <PageHeader title={I.title} subtitle={AR.admin.nav.inventory} icon="fas fa-boxes-stacked" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <div className="ph-stats-grid">
              <StatCard tone="blue" icon="fas fa-boxes-stacked" value={num(summary?.total_items)} label={I.stat_total} />
              <StatCard tone="green" icon="fas fa-circle-check" value={num(summary?.in_stock)} label={I.stat_in_stock} />
              <StatCard
                tone="orange"
                icon="fas fa-triangle-exclamation"
                value={num(summary?.low_stock)}
                label={I.stat_low_stock}
              />
              <StatCard tone="red" icon="fas fa-circle-xmark" value={num(summary?.out_of_stock)} label={I.stat_out_of_stock} />
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
                </div>
              }
            >
              {rows.length === 0 ? (
                <div className="admin-empty">
                  <p>{I.empty}</p>
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={I.title}
                  columns={[
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
                      label: I.col_total_qty,
                      className: 'ac-num',
                      sort: {
                        key: 'qty',
                        active: sort.key === 'qty',
                        ariaSort: ariaSort(sort, 'qty'),
                        direction: sort.key === 'qty' ? sort.direction : null,
                      },
                    },
                    {
                      label: I.col_pharmacies,
                      className: 'ac-num',
                      sort: {
                        key: 'pharmacies',
                        active: sort.key === 'pharmacies',
                        ariaSort: ariaSort(sort, 'pharmacies'),
                        direction: sort.key === 'pharmacies' ? sort.direction : null,
                      },
                    },
                    I.col_status,
                  ]}
                  onSort={toggle}
                >
                  {sorted.map((row) => {
                    const state = statusOf(row);
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.trade_name}
                          {row.scientific_name && (
                            <span className="admin-sub"> — {row.scientific_name}</span>
                          )}
                        </td>
                        <td className="ac-num">{num(row.pharmacy_medicines_sum_quantity)}</td>
                        <td className="ac-num">{num(row.pharmacy_medicines_count)}</td>
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
