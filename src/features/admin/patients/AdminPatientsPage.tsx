import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
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
import { formatDate, num, pageInfo } from '../shared';
import type { AdminPatientsResponse, AdminPatient } from '@/api/adminTypes';

/**
 * Admin patients — a read-only roster.
 *
 * Mirrors the patients list in the Blade admin. Two deliberate divergences:
 *
 *  1. **The headline number is the real total.** Blade's controller computes
 *     `count()` over the *unfiltered* patient set but the translated label it
 *     binds to reads "active this month" — a number and a sentence that
 *     disagree. The API returns `total_patients` and this screen labels it
 *     honestly ("إجمالي المرضى"); no figure is presented with a claim it does
 *     not support.
 *  2. **Read-only, by design.** There is no admin action on a patient in the
 *     Blade panel either — patients are managed by the app, not by an operator.
 *     Adding a delete button here would be inventing a capability (and a
 *     destructive one) that the backend does not offer.
 *
 * Sorting is client-side over the loaded page, consistent with the other admin
 * list screens: the endpoint paginates by registration date and accepts no sort
 * parameter, so re-sorting 50 rows locally is instant and honest.
 */
export function AdminPatientsPage() {
  const api = useAdminApi();

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');

  const P = AR.admin.patients;

  // Debounce so typing does not fire one request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminPatientsResponse>(
    (signal) => api.admin.patients({ q: debouncedQ, page, per_page: 50 }, signal),
    [debouncedQ, page],
  );

  const rows = useMemo(() => query.data?.patients ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  const { sort, toggle, sorted } = useSort<AdminPatient, 'name' | 'date'>(
    rows,
    (row, key) => {
      switch (key) {
        case 'name':
          return row.name;
        case 'date':
          return row.created_at;
      }
    },
  );

  return (
    <>
      <PageHeader title={P.title} subtitle={AR.admin.nav.patients} icon="fas fa-user-injured" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <div className="ph-stats-grid">
              <StatCard
                tone="blue"
                icon="fas fa-user-injured"
                value={num(query.data.total_patients)}
                label={P.total}
              />
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
                  <p>{P.empty}</p>
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={P.title}
                  columns={[
                    {
                      label: P.col_name,
                      sort: {
                        key: 'name',
                        active: sort.key === 'name',
                        ariaSort: ariaSort(sort, 'name'),
                        direction: sort.key === 'name' ? sort.direction : null,
                      },
                    },
                    P.col_email,
                    P.col_phone,
                    {
                      label: P.col_date,
                      sort: {
                        key: 'date',
                        active: sort.key === 'date',
                        ariaSort: ariaSort(sort, 'date'),
                        direction: sort.key === 'date' ? sort.direction : null,
                      },
                    },
                  ]}
                  onSort={toggle}
                >
                  {sorted.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      {/* Contact details render LTR — an email or a phone number
                          reversed by the RTL context is unreadable. */}
                      <td dir="ltr">{row.email ?? '—'}</td>
                      <td dir="ltr">{row.phone ?? '—'}</td>
                      <td>{formatDate(row.created_at)}</td>
                    </tr>
                  ))}
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
