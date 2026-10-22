import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  DataTable,
  EmptyState,
  Modal,
  PageHeader,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/LanguageContext';
import { useUrlState } from '@/lib/urlState';
import { formatDateTime, pageInfo } from '../shared';
import {
  errorMessage,
  paymentStatusLabel,
  problemCategoryLabel,
  problemStatusLabel,
} from './paymentShared';
import type {
  AdminPaymentProblem,
  AdminPaymentProblemsResponse,
  PaymentProblemStatus,
} from '@/api/adminTypes';

const PROBLEM_FILTER_VALUES: ReadonlyArray<PaymentProblemStatus | 'all'> = [
  'open',
  'resolved',
  'all',
];

/**
 * Admin payment problems — follow up on patient-reported transfer issues.
 *
 * Mirrors the medicine-requests screen: a status pill filter, a paginated
 * table, and a small modal that performs the single write action this screen
 * has. A problem can only be resolved while it is `open`; resolving requires a
 * note because the note is what the patient sees explaining the outcome.
 */
export function AdminPaymentProblemsPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const queryClient = useQueryClient();

  const P = STR.admin.payment_problems;
  const Payments = STR.admin.payments;

  const { state, set } = useUrlState({
    status: {
      key: 'status',
      parse: (raw) =>
        (PROBLEM_FILTER_VALUES as readonly string[]).includes(raw) ? raw : 'open',
      serialize: String,
      default: 'open',
    },
    page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  });

  const status = state.status as PaymentProblemStatus | 'all';
  const page = Math.max(1, Number(state.page) || 1);
  const setPage = (value: number | ((p: number) => number)) => {
    set({ page: typeof value === 'function' ? value(page) : value });
  };

  const [resolving, setResolving] = useState<AdminPaymentProblem | null>(null);
  const [adminNote, setAdminNote] = useState('');

  const query = useApiQuery<AdminPaymentProblemsResponse>(
    (signal) =>
      api.admin.paymentProblems({ status, page, per_page: 20 }, signal),
    [status, page],
    { queryKey: keys.paymentProblems.list({ status, page }) },
  );

  const rows = useMemo(() => query.data?.problems ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const info = useMemo(
    () => (pagination ? pageInfo(pagination, STR) : null),
    [pagination, STR],
  );

  useEffect(() => {
    if (!pagination || pagination.current_page <= pagination.last_page) return;
    set({ page: Math.max(1, pagination.last_page) });
  }, [pagination, set]);

  const isFiltered = status !== 'open';

  const resolveMutation = useApiMutation(
    async (payload: { id: number; note: string }) =>
      api.admin.resolvePaymentProblem(payload.id, payload.note),
  );

  function openResolve(problem: AdminPaymentProblem) {
    setAdminNote('');
    setResolving(problem);
  }

  function closeResolve() {
    setResolving(null);
    setAdminNote('');
  }

  function changeStatus(value: PaymentProblemStatus | 'all') {
    set({ status: value, page: 1 });
  }

  async function handleResolve() {
    if (!resolving) return;

    const note = adminNote.trim();
    if (!note) {
      toast.error(P.admin_note_required);
      return;
    }

    try {
      await resolveMutation.run({ id: resolving.id, note });
      toast.success(P.resolved_msg);
      closeResolve();
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: keys.paymentProblems.all,
          refetchType: 'all',
        }),
        queryClient.invalidateQueries({
          queryKey: keys.payments.all,
          refetchType: 'all',
        }),
      ]);
    } catch (err) {
      toast.error(errorMessage(err, P.action_failed));
    }
  }

  function problemStatusVariant(problemStatus: PaymentProblemStatus) {
    return problemStatus === 'open' ? ('low' as const) : ('ok' as const);
  }

  return (
    <>
      <PageHeader
        title={P.title}
        subtitle={P.subtitle}
        icon="fas fa-triangle-exclamation"
      />

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={query.refetch}
      >
        {query.data && (
          <Card>
            <div className="admin-filters">
              <div className="ph-pills">
                {(['open', 'resolved', 'all'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`ph-pill${status === key ? ' active' : ''}`}
                    aria-pressed={status === key}
                    onClick={() => changeStatus(key)}
                  >
                    {key === 'open'
                      ? P.filter_open
                      : key === 'resolved'
                        ? P.filter_resolved
                        : P.filter_all}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                icon="fas fa-circle-check"
                title={P.empty}
                description={
                  isFiltered ? STR.admin.common.empty_filtered_hint : P.empty_hint
                }
                action={
                  isFiltered ? (
                    <Btn size="sm" variant="outline" onClick={() => changeStatus('open')}>
                      <i className="fas fa-rotate-left" aria-hidden="true" />{' '}
                      {STR.admin.common.clear_filters}
                    </Btn>
                  ) : undefined
                }
              />
            ) : (
              <DataTable
                sticky
                caption={P.title}
                columns={[
                  P.col_order,
                  P.col_patient,
                  P.col_category,
                  P.col_message,
                  P.col_status,
                  Payments.col_payment_status,
                  P.col_date,
                  { label: P.col_actions, className: 'ac-actions' },
                ]}
              >
                {rows.map((problem) => (
                  <tr key={problem.id}>
                    <td>#{problem.order_id}</td>
                    <td>
                      {problem.patient?.name ?? '—'}
                      {problem.patient?.phone && (
                        <small className="admin-sub">{problem.patient.phone}</small>
                      )}
                    </td>
                    <td>{problemCategoryLabel(P, problem.category)}</td>
                    <td>{problem.message}</td>
                    <td>
                      <Badge variant={problemStatusVariant(problem.status)}>
                        {problemStatusLabel(P, problem.status)}
                      </Badge>
                    </td>
                    <td>
                      {problem.payment_status
                        ? paymentStatusLabel(Payments, problem.payment_status)
                        : '—'}
                    </td>
                    <td>{formatDateTime(problem.created_at)}</td>
                    <td className="ac-actions">
                      {problem.status === 'open' ? (
                        <Btn
                          size="xs"
                          variant="primary"
                          onClick={() => openResolve(problem)}
                        >
                          {P.resolve}
                        </Btn>
                      ) : (
                        <span className="admin-muted">{problem.admin_note ?? '—'}</span>
                      )}
                    </td>
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
                  {STR.admin.common.previous}
                </Btn>
                <span>{info?.label}</span>
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
          </Card>
        )}
      </AsyncBoundary>

      <Modal
        open={resolving !== null}
        title={P.resolve_title}
        onClose={closeResolve}
        footer={
          <>
            <Btn variant="outline" onClick={closeResolve}>
              {STR.admin.common.cancel}
            </Btn>
            <Btn
              variant="primary"
              onClick={handleResolve}
              disabled={resolveMutation.isPending || !adminNote.trim()}
            >
              {P.resolve}
            </Btn>
          </>
        }
      >
        {resolving && (
          <>
            <dl className="admin-detail-list">
              <div>
                <dt>{P.col_order}</dt>
                <dd>#{resolving.order_id}</dd>
              </div>
              <div>
                <dt>{P.col_patient}</dt>
                <dd>
                  {resolving.patient?.name ?? '—'}
                  {resolving.patient?.phone && (
                    <small className="admin-sub">{resolving.patient.phone}</small>
                  )}
                </dd>
              </div>
              <div>
                <dt>{P.col_category}</dt>
                <dd>{problemCategoryLabel(P, resolving.category)}</dd>
              </div>
              <div>
                <dt>{P.col_message}</dt>
                <dd>{resolving.message}</dd>
              </div>
            </dl>

            <label className="admin-field">
              <span>{P.admin_note}</span>
              <textarea
                rows={4}
                maxLength={2000}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                required
              />
            </label>
            {!adminNote.trim() && <p className="admin-hint">{P.admin_note_required}</p>}
          </>
        )}
      </Modal>
    </>
  );
}
