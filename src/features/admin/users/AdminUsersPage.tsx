import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  Modal,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminAuth } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { AR, roleLabel } from '@/lib/i18n';
import { ariaSort, useSort } from '@/lib/sort';
import { num, pageInfo } from '../shared';
import type { AdminUsersResponse, AdminUserRow } from '@/api/adminTypes';

/**
 * Admin users — list, activate/deactivate, delete.
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
  const api = useAdminApi();
  const { user: currentUser } = useAdminAuth();

  const [q, setQ] = useState('');
  const [role, setRole] = useState<'all' | 'admin' | 'pharmacy' | 'patient'>('all');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'delete' | 'toggle'; row: AdminUserRow } | null
  >(null);

  const U = AR.admin.users;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminUsersResponse>(
    (signal) => api.admin.users({ q: debouncedQ, role, page, per_page: 50 }, signal),
    [debouncedQ, role, page],
  );

  const rows = useMemo(() => query.data?.users ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const counts = query.data?.role_counts;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  const toggleMutation = useApiMutation(async (id: number) => api.admin.toggleUser(id));
  const deleteMutation = useApiMutation(async (id: number) => api.admin.deleteUser(id));

  const { sort, toggle, sorted } = useSort<AdminUserRow, 'name' | 'role' | 'date'>(
    rows,
    (row, key) => {
      switch (key) {
        case 'name':
          return row.name;
        case 'role':
          return roleLabel(row.role);
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
    } catch {
      // The client already hides the three impossible actions (self-deactivate,
      // self-delete, pharmacy-linked role change), so a failure here is
      // genuinely unexpected rather than a predictable guard rejection.
      toast.error('تعذّر تنفيذ العملية، حاول مرة أخرى.');
    }
  }

  const isPending = toggleMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <PageHeader title={U.title} subtitle={AR.admin.nav.users} icon="fas fa-users" />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <>
            <div className="ph-stats-grid">
              <StatCard tone="blue" icon="fas fa-user-shield" value={num(counts?.admin)} label={U.filter_admin} />
              <StatCard tone="teal" icon="fas fa-store" value={num(counts?.pharmacy)} label={U.filter_pharmacy} />
              <StatCard
                tone="green"
                icon="fas fa-user-injured"
                value={num(counts?.patient)}
                label={U.filter_patient}
              />
              <StatCard tone="gray" icon="fas fa-users" value={num(pagination?.total)} label={U.filter_all} />
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
                    {(['all', 'admin', 'pharmacy', 'patient'] as const).map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`ph-pill${role === key ? ' active' : ''}`}
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
              }
            >
              {rows.length === 0 ? (
                <div className="admin-empty">
                  <p>{U.empty}</p>
                </div>
              ) : (
                <DataTable
                  sticky
                  caption={U.title}
                  columns={[
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
                    { label: U.col_actions, className: 'ac-actions' },
                  ]}
                  onSort={toggle}
                >
                  {sorted.map((row) => {
                    const self = isSelf(row);
                    return (
                      <tr key={row.id}>
                        <td>
                          {row.name}
                          {self && <Badge variant="new">أنت</Badge>}
                        </td>
                        <td dir="ltr">{row.email ?? '—'}</td>
                        <td dir="ltr">{row.phone ?? '—'}</td>
                        <td>{roleLabel(row.role)}</td>
                        <td>
                          <Badge variant={row.is_active ? 'ok' : 'out'}>
                            {row.is_active ? U.status_active : U.status_inactive}
                          </Badge>
                        </td>
                        <td className="ac-actions">
                          {self ? (
                            // No controls on your own row — see the guard note.
                            <span className="admin-muted">—</span>
                          ) : (
                            <>
                              <Btn
                                size="xs"
                                variant="outline"
                                disabled={isPending}
                                onClick={() => setConfirmAction({ kind: 'toggle', row })}
                              >
                                {U.action_toggle}
                              </Btn>
                              <Btn
                                size="xs"
                                variant="danger"
                                disabled={isPending}
                                onClick={() => setConfirmAction({ kind: 'delete', row })}
                              >
                                {U.action_delete}
                              </Btn>
                            </>
                          )}
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

      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.kind === 'delete' ? U.action_delete : U.action_toggle
        }
        onClose={() => setConfirmAction(null)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setConfirmAction(null)}>
              {AR.admin.common.cancel}
            </Btn>
            <Btn
              variant={confirmAction?.kind === 'delete' ? 'danger' : 'primary'}
              onClick={handleConfirmedAction}
              disabled={isPending}
            >
              {AR.admin.common.confirm}
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
            <p>
              {confirmAction?.row.is_active
                ? 'سيتم تعطيل هذا الحساب ومنعه من الدخول.'
                : 'سيتم تفعيل هذا الحساب والسماح له بالدخول.'}
            </p>
            {confirmAction && <strong>{confirmAction.row.name}</strong>}
          </>
        )}
      </Modal>
    </>
  );
}
