import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AsyncBoundary,
  Badge,
  Btn,
  Card,
  FormField,
  Modal,
  Notice,
  PageHeader,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { formatDateTime } from '../shared';
import type { AccountClosureStatus, AdminAccountClosureRequest } from '@/api/adminTypes';

const FILTERS: ReadonlyArray<AccountClosureStatus | 'all'> = [
  'pending',
  'approved',
  'rejected',
  'all',
];

/**
 * Admin review of pharmacy closure requests.
 *
 * The screen never decides whether a closure is allowed — the backend returns
 * `blockers[]` and refuses approval with 409 while any remain. Rendering those
 * blockers verbatim is the whole point: it tells the admin exactly what the
 * pharmacy still owes before the account can be closed.
 */
export function AdminAccountClosuresPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const queryClient = useQueryClient();

  const C = STR.admin.account_closures;

  const [status, setStatus] = useState<AccountClosureStatus | 'all'>('pending');
  const [review, setReview] = useState<{ row: AdminAccountClosureRequest; action: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useApiQuery<AdminAccountClosureRequest[]>(
    (signal) => api.admin.accountClosures(status, signal),
    [status],
    { queryKey: keys.accountClosures.list({ status }) },
  );

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const approveMutation = useApiMutation(
    async (payload: { id: number; note: string }) =>
      api.admin.approveAccountClosure(payload.id, payload.note),
  );

  const rejectMutation = useApiMutation(
    async (payload: { id: number; note: string }) =>
      api.admin.rejectAccountClosure(payload.id, payload.note),
  );

  const reopenMutation = useApiMutation(
    async (pharmacyId: number) => api.admin.reopenPharmacy(pharmacyId),
  );

  const busy = approveMutation.isPending || rejectMutation.isPending;

  function openReview(row: AdminAccountClosureRequest, action: 'approve' | 'reject') {
    setNote('');
    setFormError(null);
    setReview({ row, action });
  }

  function closeReview() {
    if (busy) return;
    setReview(null);
    setNote('');
    setFormError(null);
  }

  async function submit() {
    if (!review) return;

    const trimmed = note.trim();

    // الرفض يتطلب سببًا — الباك-إند يرفضه بـ422 بدونه، ولا معنى لرفض صامت.
    if (review.action === 'reject' && !trimmed) {
      setFormError(C.note_required);
      return;
    }

    setFormError(null);

    try {
      if (review.action === 'approve') {
        await approveMutation.run({ id: review.row.id, note: trimmed });
        toast.success(C.approve_success);
      } else {
        await rejectMutation.run({ id: review.row.id, note: trimmed });
        toast.success(C.reject_success);
      }

      setReview(null);
      setNote('');
      await queryClient.invalidateQueries({ queryKey: keys.accountClosures.all });
    } catch (error) {
      // 409 = التزامات ظهرت بعد الطلب؛ نعرض رسالة الباك-إند كما هي.
      setFormError(error instanceof Error ? error.message : C.action_failed);
      await queryClient.invalidateQueries({ queryKey: keys.accountClosures.all });
    }
  }

  async function reopen(row: AdminAccountClosureRequest) {
    try {
      await reopenMutation.run(row.subject_id);
      toast.success(C.reopen_success);
      await queryClient.invalidateQueries({ queryKey: keys.accountClosures.all });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : C.action_failed);
    }
  }

  return (
    <>
      <PageHeader title={C.title} subtitle={C.subtitle} />

      <div className="admin-filter-row">
        {FILTERS.map((value) => (
          <Btn
            key={value}
            variant={status === value ? 'primary' : 'ghost'}
            onClick={() => setStatus(value)}
          >
            {C[`filter_${value}` as keyof typeof C] as string}
          </Btn>
        ))}
      </div>

      <AsyncBoundary
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={rows.length === 0}
        emptyTitle={C.empty_title}
      >
        <div className="admin-closure-list">
          {rows.map((row) => (
            <Card key={row.id}>
              <article className="admin-closure-row">
                <header>
                  <h2>{row.subject_name ?? `#${row.subject_id}`}</h2>
                  <Badge variant={row.status === 'pending' ? 'unpaid' : 'paid'}>
                    {C[`status_${row.status}` as keyof typeof C] as string}
                  </Badge>
                </header>

                <p>{C.requested_at}: {formatDateTime(row.created_at)}</p>
                {row.reason && <p>{C.reason}: {row.reason}</p>}
                {row.review_note && <p>{C.review_note}: {row.review_note}</p>}

                {row.blockers.length > 0 ? (
                  <Notice tone="warning">
                    <strong>{C.blockers_title}</strong>
                    <ul>
                      {row.blockers.map((blocker) => (
                        <li key={blocker.key}>{blocker.label} — {blocker.count}</li>
                      ))}
                    </ul>
                  </Notice>
                ) : (
                  <Notice tone="info">{C.no_blockers}</Notice>
                )}

                <div className="admin-closure-actions">
                  {row.status === 'pending' && (
                    <>
                      <Btn
                        variant="primary"
                        disabled={busy || row.blockers.length > 0}
                        onClick={() => openReview(row, 'approve')}
                      >
                        {C.approve}
                      </Btn>
                      <Btn variant="ghost" disabled={busy} onClick={() => openReview(row, 'reject')}>
                        {C.reject}
                      </Btn>
                    </>
                  )}
                  {row.status === 'approved' && (
                    <Btn variant="ghost" disabled={reopenMutation.isPending} onClick={() => void reopen(row)}>
                      {C.reopen}
                    </Btn>
                  )}
                </div>

                {row.status === 'pending' && row.blockers.length > 0 && (
                  <p className="admin-closure-hint">{C.blocked_hint}</p>
                )}
              </article>
            </Card>
          ))}
        </div>
      </AsyncBoundary>

      <Modal
        open={review !== null}
        title={review?.action === 'reject' ? C.reject_title : C.approve_title}
        onClose={closeReview}
      >
        <FormField label={C.note} hint={review?.action === 'reject' ? C.note_required : C.note_optional}>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} />
        </FormField>

        {formError && <Notice tone="error">{formError}</Notice>}

        <div className="admin-closure-actions">
          <Btn variant="primary" disabled={busy} onClick={() => void submit()}>
            {review?.action === 'reject' ? C.reject : C.approve}
          </Btn>
          <Btn variant="ghost" disabled={busy} onClick={closeReview}>
            {C.cancel}
          </Btn>
        </div>
      </Modal>
    </>
  );
}
