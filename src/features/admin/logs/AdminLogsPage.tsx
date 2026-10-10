import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  PageHeader,
} from '@/components/ui';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery } from '@/api/useApiQuery';
import { AR, labelOf } from '@/lib/i18n';
import { ariaSort, useSort } from '@/lib/sort';import { formatDateTime, pageInfo } from '../shared';
import type { AdminLogsResponse, AdminLogRow } from '@/api/adminTypes';

/**
 * Admin activity log — a read-only audit trail.
 *
 * ============================================================================
 * WHY `event` IS LOOKED UP, NOT RENDERED
 * ============================================================================
 * Spatie's activity log stores `event` as a machine token (`created`,
 * `updated`, `deleted`, `login`, `logout`) — sometimes `null` for rows written
 * without one. Rendering the raw column would show English internals in an
 * Arabic panel, and `null` would show an empty cell.
 *
 * `labelOf` maps the token through the localised table and falls back to the
 * token itself, so a new event type the backend adds shows up as a readable
 * word immediately instead of a blank — no client change required.
 *
 * `description` IS rendered as-is. It is generated server-side by Spatie from
 * the subject's own model name, and rewriting it client-side would mean
 * re-deriving which model a `subject_type` refers to.
 */
export function AdminLogsPage() {
  const api = useAdminApi();

  const [q, setQ] = useState('');
  const [event, setEvent] = useState<'all' | 'created' | 'updated' | 'deleted' | 'auth'>('all');
  const [date, setDate] = useState('');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');

  const L = AR.admin.logs;
  const C = AR.admin.common;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  /** Machine token → Arabic label, with the token as a safe fallback. */
  const EVENT_LABELS: Record<string, string> = {
    created: L.event_created,
    updated: L.event_updated,
    deleted: L.event_deleted,
    login: L.event_login,
    logout: L.event_logout,
  };

  const query = useApiQuery<AdminLogsResponse>(
    (signal) =>
      api.admin.logs(
        {
          q: debouncedQ,
          // `auth` is a client-side grouping the API does not know; the two
          // real tokens behind it are sent as-is only when one is chosen.
          event: event === 'all' || event === 'auth' ? '' : event,
          date,
          page,
          per_page: 50,
        },
        signal,
      ),
    [debouncedQ, event, date, page],
  );

  const rows = useMemo(() => query.data?.logs ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  /*
   * The `auth` pill filters login/logout CLIENT-SIDE over the loaded page.
   *
   * The endpoint takes a single `event` value, so there is no way to ask for
   * "login OR logout" server-side. Sending `login` would silently drop every
   * logout row, which is worse than not offering the filter. Filtering the
   * current page is honest about its scope, and the pill is labelled as a
   * grouping rather than a status.
   */
  const visible = useMemo(() => {
    if (event !== 'auth') return rows;
    return rows.filter((r) => r.event === 'login' || r.event === 'logout');
  }, [rows, event]);

  const { sort, toggle, sorted } = useSort<AdminLogRow, 'event' | 'date'>(
    visible,
    (row, key) => {
      switch (key) {
        case 'event':
          return labelOf(EVENT_LABELS, row.event, '');
        case 'date':
          return row.created_at;
      }
    },
  );

  /** Tone an event badge by its nature, so the eye catches writes and deletes. */
  function eventVariant(value: string | null): string {
    switch (value) {
      case 'created':
        return 'ok';
      case 'updated':
        return 'new';
      case 'deleted':
        return 'out';
      default:
        return 'closed';
    }
  }

  return (
    <>
      <PageHeader title={L.title} subtitle={AR.admin.nav.activity_log} icon="fas fa-clock-rotate-left" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <Card
            headExtra={
              <div className="admin-filters">
                <input
                  type="search"
                  className="admin-search"
                  placeholder={C.search}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={C.search}
                />
                <div className="ph-pills">
                  {(['all', 'created', 'updated', 'deleted', 'auth'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`ph-pill${event === key ? ' active' : ''}`}
                      aria-pressed={event === key}
                      onClick={() => {
                        setEvent(key);
                        setPage(1);
                      }}
                    >
                      {key === 'all'
                        ? L.filter_all
                        : key === 'created'
                          ? L.filter_created
                          : key === 'updated'
                            ? L.filter_updated
                            : key === 'deleted'
                              ? L.filter_deleted
                              : L.filter_auth}
                    </button>
                  ))}
                </div>
                <label className="admin-field admin-field--inline">
                  <span>{L.date_label}</span>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => {
                      setDate(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </div>
            }
          >
            {sorted.length === 0 ? (
              <div className="admin-empty">
                <p>{L.empty}</p>
              </div>
            ) : (
              <DataTable
                sticky
                caption={L.title}
                columns={[
                  {
                    label: L.col_event,
                    sort: {
                      key: 'event',
                      active: sort.key === 'event',
                      ariaSort: ariaSort(sort, 'event'),
                      direction: sort.key === 'event' ? sort.direction : null,
                    },
                  },
                  L.col_user,
                  L.col_description,
                  {
                    label: L.col_date,
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
                    <td>
                      <Badge variant={eventVariant(row.event)}>
                        {labelOf(EVENT_LABELS, row.event, '—')}
                      </Badge>
                    </td>
                    <td>{row.causer_name ?? L.system}</td>
                    <td>{row.description ?? '—'}</td>
                    <td>{formatDateTime(row.created_at)}</td>
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
                  {C.previous}
                </Btn>
                <span>{info?.label}</span>
                <Btn
                  size="sm"
                  variant="outline"
                  disabled={pagination.current_page >= pagination.last_page}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {C.next}
                </Btn>
              </div>
            )}
          </Card>
        )}
      </AsyncBoundary>
    </>
  );
}
