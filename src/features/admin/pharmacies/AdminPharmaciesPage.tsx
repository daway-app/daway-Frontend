import { useEffect, useMemo, useState } from 'react';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  Modal,
  PageHeader,
  StatCard,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { AR } from '@/lib/i18n';
import { formatDate, num, pageInfo } from '../shared';
import { CredentialsModal } from './CredentialsModal';
import type { AdminPharmaciesResponse, DeliveredCredentials } from '@/api/adminTypes';

/**
 * Admin pharmacies — list, create, toggle, reset credentials, delete.
 *
 * Mirrors `pharmacies/index.blade.php` + `web/Pharmacy/PharmacyController`.
 *
 * ============================================================================
 * 🔴 THE CREDENTIALS FLOW IS THE POINT OF THIS SCREEN
 * ============================================================================
 * Two API responses can carry one-time credentials:
 *   · `POST /api/admin/pharmacies`            → always (a new account)
 *   · `PATCH .../toggle-status`               → only when activating a
 *                                               never-delivered pharmacy
 *   · `PATCH .../reset-credentials`           → always
 *
 * In every case they are captured into `credentials` STATE and shown in a modal.
 * They are never put in a URL, a toast, or a log — a toast would leak them into
 * the DOM briefly and any screenshot would expose them.
 *
 * ============================================================================
 * WHY A CARD GRID RATHER THAN THE TABLE PRIMITIVE
 * ============================================================================
 * Blade renders pharmacies as a card grid (name, id, item count, actions), not
 * a table, and each card carries 3–4 actions. DataTable is built for scannable
 * tabular data with one action column; forcing this screen into it would fight
 * the component. The grid keeps Blade's shape and the CSS that styles it.
 */
export function AdminPharmaciesPage() {
  const api = useAdminApi();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [page, setPage] = useState(1);
  const [debouncedQ, setDebouncedQ] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [credentials, setCredentials] = useState<DeliveredCredentials | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    { kind: 'delete' | 'toggle' | 'reset'; id: number; name: string } | null
  >(null);

  const C = AR.admin.pharmacies;

  // Debounce the search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  const query = useApiQuery<AdminPharmaciesResponse>(
    (signal) => api.admin.pharmacies({ q: debouncedQ, status, page, per_page: 50 }, signal),
    [debouncedQ, status, page],
  );

  const data = query.data;
  const pagination = data?.pagination;
  const info = useMemo(() => (pagination ? pageInfo(pagination) : null), [pagination]);

  const createMutation = useApiMutation(async (name: string) =>
    api.admin.createPharmacy(name),
  );
  const toggleMutation = useApiMutation(async (id: number) => api.admin.togglePharmacy(id));
  const resetMutation = useApiMutation(async (id: number) =>
    api.admin.resetPharmacyCredentials(id),
  );
  const deleteMutation = useApiMutation(async (id: number) => api.admin.deletePharmacy(id));

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      const response = await createMutation.run(name);
      setNewName('');
      setCreateOpen(false);
      // Show credentials BEFORE refetching — they only exist in this response.
      setCredentials(response.data.credentials);
      toast.success(C.created);
      query.refetch();
    } catch {
      toast.error('تعذّرت إضافة الصيدلية، حاول مرة أخرى.');
    }
  }

  async function handleConfirmedAction() {
    if (!confirmAction) return;
    const { kind, id } = confirmAction;
    setConfirmAction(null);

    try {
      if (kind === 'delete') {
        await deleteMutation.run(id);
        toast.success(C.deleted);
        query.refetch();
      } else if (kind === 'toggle') {
        const result = await toggleMutation.run(id);
        toast.success(C.status_updated);
        // Activating a never-delivered pharmacy delivers credentials here.
        if (result.credentials) setCredentials(result.credentials);
        query.refetch();
      } else {
        const response = await resetMutation.run(id);
        toast.success(C.updated);
        setCredentials(response.data.credentials);
        query.refetch();
      }
    } catch {
      toast.error('تعذّر تنفيذ العملية، حاول مرة أخرى.');
    }
  }

  const isPending =
    toggleMutation.isPending || resetMutation.isPending || deleteMutation.isPending;

  return (
    <>
      <PageHeader
        title={C.title}
        subtitle={AR.admin.nav.pharmacies}
        icon="fas fa-store"
        actions={
          <Btn variant="primary" onClick={() => setCreateOpen(true)}>
            <i className="fas fa-plus" /> {C.add_button}
          </Btn>
        }
      />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {data && (
          <>
            <div className="ph-stats-grid">
              <StatCard
                tone="teal"
                icon="fas fa-store"
                value={num(data.stats.total)}
                label={C.stat_total}
              />
              <StatCard
                tone="green"
                icon="fas fa-circle-check"
                value={num(data.stats.active)}
                label={C.stat_active}
              />
              <StatCard
                tone="red"
                icon="fas fa-circle-xmark"
                value={num(data.stats.disabled)}
                label={C.stat_disabled}
              />
              <StatCard
                tone="blue"
                icon="fas fa-pills"
                value={num(data.stats.total_items)}
                label={C.stat_items}
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
                  <div className="ph-pills">
                    {(['all', 'active', 'disabled'] as const).map((key) => (
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
                        {key === 'all' ? C.filter_all : key === 'active' ? C.filter_active : C.filter_disabled}
                      </button>
                    ))}
                  </div>
                </div>
              }
            >
              {data.pharmacies.length === 0 ? (
                <div className="admin-empty">
                  <p>{C.empty}</p>
                  <span>{C.empty_hint}</span>
                </div>
              ) : (
                <div className="admin-card-grid">
                  {data.pharmacies.map((pharmacy) => (
                    <article key={pharmacy.id} className="admin-pharmacy-card">
                      <header>
                        <h3>{pharmacy.pharmacy_name}</h3>
                        <Badge variant={pharmacy.is_active ? 'ok' : 'out'}>
                          {pharmacy.is_active ? C.status_active : C.status_disabled}
                        </Badge>
                      </header>

                      <dl className="admin-pharmacy-card__meta">
                        <div>
                          <dt>{C.col_id}</dt>
                          <dd dir="ltr">{pharmacy.pharmacy_custom_id}</dd>
                        </div>
                        <div>
                          <dt>{C.col_items}</dt>
                          <dd>{num(pharmacy.pharmacy_medicines_count)}</dd>
                        </div>
                        <div>
                          <dt>{AR.admin.requests.col_date}</dt>
                          <dd>{formatDate(pharmacy.delivered_at)}</dd>
                        </div>
                      </dl>

                      <div className="admin-pharmacy-card__actions">
                        <Btn
                          size="sm"
                          variant="outline"
                          disabled={isPending}
                          onClick={() =>
                            setConfirmAction({
                              kind: 'toggle',
                              id: pharmacy.id,
                              name: pharmacy.pharmacy_name,
                            })
                          }
                        >
                          {pharmacy.is_active ? C.action_disable : C.action_activate}
                        </Btn>
                        <Btn
                          size="sm"
                          variant="ghost"
                          disabled={isPending}
                          onClick={() =>
                            setConfirmAction({
                              kind: 'reset',
                              id: pharmacy.id,
                              name: pharmacy.pharmacy_name,
                            })
                          }
                        >
                          {C.action_reset}
                        </Btn>
                        <Btn
                          size="sm"
                          variant="danger"
                          disabled={isPending}
                          onClick={() =>
                            setConfirmAction({
                              kind: 'delete',
                              id: pharmacy.id,
                              name: pharmacy.pharmacy_name,
                            })
                          }
                        >
                          {C.action_delete}
                        </Btn>
                      </div>
                    </article>
                  ))}
                </div>
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

      {/* Create */}
      <Modal
        open={createOpen}
        title={C.add_title}
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Btn variant="outline" onClick={() => setCreateOpen(false)}>
              {AR.admin.common.cancel}
            </Btn>
            <Btn
              variant="primary"
              onClick={handleCreate}
              disabled={createMutation.isPending || !newName.trim()}
            >
              {AR.admin.common.save}
            </Btn>
          </>
        }
      >
        <p className="admin-hint">{C.add_hint}</p>
        <label className="admin-field">
          <span>{C.name_label}</span>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            required
          />
        </label>
      </Modal>

      {/* Confirm toggle / reset / delete */}
      <Modal
        open={confirmAction !== null}
        title={
          confirmAction?.kind === 'delete'
            ? C.action_delete
            : confirmAction?.kind === 'reset'
              ? C.action_reset
              : C.action_activate
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
        <p>
          {confirmAction?.kind === 'delete'
            ? C.confirm_delete
            : confirmAction?.kind === 'reset'
              ? C.confirm_reset
              : C.confirm_toggle}
        </p>
        {confirmAction && <strong>{confirmAction.name}</strong>}
      </Modal>

      {/* One-time credentials */}
      <CredentialsModal
        open={credentials !== null}
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
    </>
  );
}
