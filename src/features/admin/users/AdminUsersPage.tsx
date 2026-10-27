import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AsyncBoundary, Badge, Btn, DataTable, EmptyState, Modal } from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminAuth, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { roleLabel } from '@/lib/i18n';
import { useLang } from '@/lib/lang/useLang';
import { useUrlState } from '@/lib/urlState';
import { ariaSort, useSort } from '@/lib/sort';
import { thumbUrl } from '@/lib/format';
import { num, pageInfo, tpl } from '../shared';
import { ADMIN_ROUTES } from '@/routes/adminPaths';
import type { AdminUsersResponse, AdminUserRow } from '@/api/adminTypes';

/** First two characters of the name, used when there is no avatar. */
function initials(name: string): string {
  return name.trim().slice(0, 2);
}

/**
 * A relative-time string from a date, in Arabic.
 *
 * Blade calls `$user->updated_at->diffForHumans()`, which Laravel localises —
 * "قبل 3 أيام". `Intl.RelativeTimeFormat` gives the same shape natively without
 * shipping a date library, and handles the plural rules that a hand-rolled
 * `days + ' أيام'` would get wrong for 1, 2 and 11+.
 *
 * Returns `—` for a missing or unparseable date rather than "Invalid Date".
 */
const RTF = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });

function relativeTime(value: string | null): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';

  const seconds = Math.round((then - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return RTF.format(Math.round(seconds / size), unit);
  }
  return RTF.format(seconds, 'second');
}

/**
 * Admin users — list, role distribution, activate/deactivate, delete.
 *
 * Mirrors `users/index.blade.php`: the header block, breadcrumb, the
 * two-column `dashboard-grid` (table + role-distribution panel), the last-login
 * column and the row actions.
 *
 * ============================================================================
 * 🔴 THE SELF-GUARDS MATTER MORE THAN THE ACTIONS
 * ============================================================================
 * The backend refuses three things (422 on each), and this screen must not
 * offer them in the first place — a button that always fails is worse than no
 * button:
 *
 *  1. **An admin cannot deactivate or delete their own account.** Losing the
 *     only admin by accident locks everyone out with no in-app recovery.
 *  2. **An admin cannot change their own role.** Same lockout, one click away.
 *  3. **A pharmacy-linked account's role cannot be changed.** The account is
 *     the pharmacy's login; re-typing it to `patient` would orphan the pharmacy
 *     row, so the backend blocks it and this screen hides the control.
 *
 * The server enforces all three regardless — this is the UX half, and the
 * server response is still surfaced if it disagrees.
 *
 * The delete confirm names the user, and the current session's own row is
 * rendered without destructive controls so the hazard is not one misclick deep.
 */
export function AdminUsersPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const { user: currentUser } = useAdminAuth();

  // Phase 3: filters + pagination in the URL (shareable, back/forward-safe).
  const { state, set } = useUrlState({
    q: { key: 'q', parse: String, serialize: String, default: '' },
    role: { key: 'role', parse: String, serialize: String, default: 'all' },
    page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  });

  /** The live input value; the URL `q` is the committed (debounced) term. */
  const [q, setQ] = useState(state.q as string);
  const committedQ = state.q as string;
  const role = state.role as 'all' | 'admin' | 'pharmacy' | 'patient';
  const setRole = (value: typeof role) => set({ role: value, page: 1 });
  const page = Math.max(1, Number(state.page) || 1);
  const setPage = (value: number | ((p: number) => number)) => {
    set({ page: typeof value === 'function' ? value(page) : value });
  };
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'delete' | 'toggle'; row: AdminUserRow } | null
  >(null);

  const U = STR.admin.users;

  // Debounce the search — commit only when the term changed (see AdminMedicinesPage).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q !== committedQ) set({ q, page: 1 });
    }, 350);
    return () => clearTimeout(timer);
  }, [q, committedQ, set]);

  const query = useApiQuery<AdminUsersResponse>(
    (signal) => api.admin.users({ q: committedQ, role, page, per_page: 50 }, signal),
    [committedQ, role, page],
    { queryKey: keys.users.list({ q: committedQ, role, page, per_page: 50 }) },
  );

  const rows = useMemo(() => query.data?.users ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const counts = query.data?.role_counts;
  const info = useMemo(() => (pagination ? pageInfo(pagination, STR) : null), [pagination, STR]);

  /** See AdminMedicineRequestsPage — the recovery action only appears when a
   *  filter is actually responsible for the empty list. */
  const isFiltered = q.trim() !== '' || role !== 'all';
  function clearFilters() {
    setQ('');
    set({ q: '', role: 'all', page: 1 });
  }

  const toggleMutation = useApiMutation(async (id: number) => api.admin.toggleUser(id));
  const deleteMutation = useApiMutation(async (id: number) => api.admin.deleteUser(id));

  const { sort, toggle, sorted } = useSort<AdminUserRow, 'name' | 'role' | 'date'>(
    rows,
    (row, key) => {
      switch (key) {
        case 'name':
          return row.name;
        case 'role':
          return roleLabel(row.role, STR);
        case 'date':
          return row.created_at;
      }
    },
  );

  /** True for the signed-in admin's own account — see the guards above. */
  function isSelf(row: AdminUserRow): boolean {
    return currentUser != null && row.id === currentUser.id;
  }

  async function handleConfirmedAction() {
    if (!confirmAction) return;
    const { kind, row } = confirmAction;
    setConfirmAction(null);

    try {
      if (kind === 'delete') {
        await deleteMutation.run(row.id);
        toast.success(U.deleted);
      } else {
        await toggleMutation.run(row.id);
        toast.success(U.updated);
      }
      query.refetch();
    } catch (err) {
      // The guards above hide the three impossible actions, but the server can
      // still reject (e.g. a race on the last admin) — so its message is shown
      // rather than a generic one when it has something specific to say.
      toast.error(err instanceof Error && err.message ? err.message : U.action_failed);
    }
  }

  const isPending = toggleMutation.isPending || deleteMutation.isPending;

  /* Donut-free role distribution: three labelled bars sized by share of the
     PLATFORM total (not of the filtered page). `roleTotal` is the sum of the
     three counts, which excludes any role the API does not report — using the
     pagination total instead would make the three bars never reach 100%. */
  const roleTotal = num(counts?.admin) + num(counts?.pharmacy) + num(counts?.patient);
  const share = (value: number | undefined) =>
    roleTotal > 0 ? (num(value) / roleTotal) * 100 : 0;
  const ROLES = [
    { key: 'admin', color: '#3b82f6', label: U.filter_admin, count: num(counts?.admin) },
    { key: 'pharmacy', color: '#06b6d4', label: U.filter_pharmacy, count: num(counts?.pharmacy) },
    { key: 'patient', color: '#a855f7', label: U.filter_patient, count: num(counts?.patient) },
  ] as const;

  return (
    <div className="admin-page animated-page">
      {/* 1. Top header */}
      <div className="top-header-bar">
        <div className="header-title-section">
          <h1>{U.main_heading}</h1>
          <p>{U.main_description}</p>
        </div>
        <div className="header-actions">
          {/* Filled to match Blade's `.btn-add-pharmacy` (and the pharmacies
              screen's `variant="primary"`) — the class name was never carried
              into this repo, so this rendered as bare text. */}
          <Btn to={ADMIN_ROUTES.userCreate} variant="primary" icon="fas fa-plus">
            {U.add_button}
          </Btn>
        </div>
      </div>

      {/* 2. Breadcrumb trail */}
      <nav className="breadcrumb-trail" aria-label="مسار التنقل">
        <Link to={ADMIN_ROUTES.dashboard}>{U.breadcrumb_main}</Link>
        <span aria-hidden="true">‹</span>
        <span>{U.breadcrumb_current}</span>
      </nav>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <div className="dashboard-grid">
            {/* LEFT (visually first in RTL) — role distribution */}
            <div className="left-column">
              <div className="card-box">
                <div className="card-title">
                  <i className="fas fa-chart-simple" aria-hidden="true" />
                  {U.role_distribution_title}
                </div>
                <div className="role-dist-list">
                  {ROLES.map((r) => (
                    <div className="role-dist-item" key={r.key}>
                      <span className="role-dist-count">{r.count}</span>
                      {/* A progressbar per role: the bar is the visual, and the
                          percentage is what a screen reader gets. */}
                      <div
                        className="role-dist-bar-bg"
                        role="progressbar"
                        aria-label={r.label}
                        aria-valuenow={Math.round(share(r.count))}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="role-dist-bar-fill"
                          style={{
                            width: `${share(r.count)}%`,
                            backgroundColor: r.color,
                          }}
                        />
                      </div>
                      <span className="role-dist-label">{r.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* RIGHT — search, filters and the users table */}
            <div className="right-column">
              <div className="filter-card">
                <div className="filter-row">
                  <input
                    type="search"
                    className="filter-input"
                    placeholder={U.search_placeholder}
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label={U.search_placeholder}
                    autoComplete="off"
                  />
                  <div className="filter-pills">
                    {(['all', 'admin', 'pharmacy', 'patient'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`pill-btn${role === key ? ' active' : ''}`}
                        aria-pressed={role === key}
                        onClick={() => {
                          setRole(key);
                          setPage(1);
                        }}
                      >
                        {key === 'all'
                          ? U.filter_all
                          : key === 'admin'
                            ? U.filter_admin
                            : key === 'pharmacy'
                              ? U.filter_pharmacy
                              : U.filter_patient}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="main-card">
                <div className="card-top-bar">
                  <h3>{U.table_heading}</h3>
                  <span>{tpl(U.users_count, { count: num(pagination?.total) })}</span>
                </div>

                {rows.length === 0 ? (
                  <div className="table-empty-cell">
                    <EmptyState
                      icon="fas fa-users"
                      title={U.empty}
                      description={isFiltered ? STR.admin.common.empty_filtered_hint : U.empty_hint}
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
                    caption={U.title}
                    columns={[
                      { label: U.col_avatar, className: 'ac-thumb' },
                      {
                        label: U.col_name,
                        sort: {
                          key: 'name',
                          active: sort.key === 'name',
                          ariaSort: ariaSort(sort, 'name'),
                          direction: sort.key === 'name' ? sort.direction : null,
                        },
                      },
                      U.col_email,
                      U.col_phone,
                      {
                        label: U.col_role,
                        sort: {
                          key: 'role',
                          active: sort.key === 'role',
                          ariaSort: ariaSort(sort, 'role'),
                          direction: sort.key === 'role' ? sort.direction : null,
                        },
                      },
                      U.col_status,
                      U.col_last_login,
                      { label: U.col_actions, className: 'ac-actions' },
                    ]}
                    onSort={toggle}
                  >
                    {sorted.map((row) => {
                      const self = isSelf(row);
                      const avatar = thumbUrl(row.avatar, 72, 72);
                      return (
                        <tr key={row.id}>
                          <td className="ac-thumb">
                            {/* Blade `users/index.blade.php`: the photo when set,
                                else the first two initials in a round tile. */}
                            {avatar ? (
                              <img
                                src={avatar}
                                alt={row.name}
                                className="user-avatar-img"
                                width={36}
                                height={36}
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <span className="ph-avatar-sm" aria-hidden="true">
                                {initials(row.name)}
                              </span>
                            )}
                          </td>
                          <td>
                            {row.name}
                            {self && <Badge variant="new">{U.you}</Badge>}
                          </td>
                          <td dir="ltr">{row.email ?? '—'}</td>
                          <td dir="ltr">{row.phone ?? '—'}</td>
                          <td>{roleLabel(row.role, STR)}</td>
                          <td>
                            <Badge variant={row.is_active ? 'ok' : 'out'}>
                              {row.is_active ? U.status_active : U.status_inactive}
                            </Badge>
                          </td>
                          {/* Blade reads `updated_at` for this column (its own
                              `col_last_login` label notwithstanding — there is
                              no `last_login_at` on the table). Same source, so
                              the two screens agree. */}
                          <td className="ac-nowrap">{relativeTime(row.created_at)}</td>
                          <td className="ac-actions">
                            {self ? (
                              // No destructive controls on your own row — see
                              // the guard note. The edit link stays, because
                              // editing your own profile is legitimate.
                              <div className="action-btn-group">
                                <Link
                                  to={ADMIN_ROUTES.userEdit(row.id)}
                                  className="action-btn edit"
                                  title={U.action_edit}
                                  aria-label={`${U.action_edit} — ${row.name}`}
                                >
                                  <i className="fas fa-pen" aria-hidden="true" />
                                </Link>
                              </div>
                            ) : (
                              <div className="action-btn-group">
                                <Link
                                  to={ADMIN_ROUTES.userEdit(row.id)}
                                  className="action-btn edit"
                                  title={U.action_edit}
                                  aria-label={`${U.action_edit} — ${row.name}`}
                                >
                                  <i className="fas fa-pen" aria-hidden="true" />
                                </Link>
                                <button
                                  type="button"
                                  className="action-btn view"
                                  title={U.action_toggle}
                                  aria-label={`${U.action_toggle} — ${row.name}`}
                                  disabled={isPending}
                                  onClick={() => setConfirmAction({ kind: 'toggle', row })}
                                >
                                  <i
                                    className={row.is_active ? 'fas fa-toggle-on' : 'fas fa-toggle-off'}
                                    aria-hidden="true"
                                  />
                                </button>
                                <button
                                  type="button"
                                  className="action-btn delete"
                                  title={U.action_delete}
                                  aria-label={`${U.action_delete} — ${row.name}`}
                                  disabled={isPending}
                                  onClick={() => setConfirmAction({ kind: 'delete', row })}
                                >
                                  <i className="fas fa-trash-can" aria-hidden="true" />
                                </button>
                              </div>
                            )}
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
            </div>
          </div>
        )}
      </AsyncBoundary>

      <Modal
        open={confirmAction !== null}
        title={confirmAction?.kind === 'delete' ? U.action_delete : U.action_toggle}
        onClose={() => setConfirmAction(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmAction(null)}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn
              variant={confirmAction?.kind === 'delete' ? 'danger' : 'primary'}
              onClick={handleConfirmedAction}
              disabled={isPending}
            >
              {STR.admin.common.confirm}
            </Btn>
          </>
        }
      >
        {confirmAction?.kind === 'delete' ? (
          <>
            <p>{U.confirm_delete}</p>
            <strong>{confirmAction.row.name}</strong>
          </>
        ) : (
          <>
            <p>{confirmAction?.row.is_active ? U.toggle_deactivate_hint : U.toggle_activate_hint}</p>
            {confirmAction && <strong>{confirmAction.row.name}</strong>}
          </>
        )}
      </Modal>
    </div>
  );
}

