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
  Notice,
  PageHeader,
} from '@/components/ui';
import { toast } from '@/lib/toast';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiQuery, useApiMutation } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { useUrlState } from '@/lib/urlState';
import { formatDateTime, money, pageInfo } from '../shared';
import {
  errorMessage,
  paymentStatusLabel,
  paymentStatusVariant,
  problemCategoryLabel,
  problemStatusLabel,
  saveBlob,
  submissionStatusLabel,
  parseAmountUnmatched,
  amountStatusLabel,
  amountStatusVariant,
} from './paymentShared';
import type {
  AdminPaymentDetail,
  AdminPaymentSubmission,
  AdminPaymentsResponse,
  AmountUnmatchedError,
  PaymentStatus,
  PaymentSubmissionStatus,
} from '@/api/adminTypes';

/**
 * Admin payments — review bank-transfer receipts for orders.
 *
 * Mirrors the medicine-requests screen: a status pill filter, a debounced
 * search, a paginated table, and a modal that loads the full order detail.
 *
 * ============================================================================
 * 🔴 AN OPEN PROBLEM BLOCKS REVIEW
 * ============================================================================
 * The backend refuses to approve or reject while a payment problem is open,
 * because the problem is the patient's chance to correct a bad transfer. The
 * detail endpoint already turns both `can_approve` and `can_reject` false in
 * that case, but the UI also checks the problems array itself: showing the
 * reason (`blocked_problem`) is more useful than silently hiding the controls,
 * and the explicit check keeps the buttons hidden even if the flags and the
 * problems list ever disagree.
 *
 * Receipts are downloaded through the authenticated API as a Blob and saved
 * with their original filename — the receipt path is never exposed to the
 * browser.
 */
const PAYMENT_FILTER_VALUES: ReadonlyArray<PaymentStatus | 'all'> = [
  'all',
  'pending',
  'under_review',
  'problem_reported',
  'paid',
  'rejected',
];

function submissionVariant(status: PaymentSubmissionStatus): 'ok' | 'out' | 'low' {
  if (status === 'approved') return 'ok';
  if (status === 'rejected') return 'out';
  return 'low';
}

export function AdminPaymentsPage() {
  const { STR } = useLang();
  const api = useAdminApi();
  const keys = useAdminKeys();
  const queryClient = useQueryClient();
  const S = STR.admin.payments;
  const P = STR.admin.payment_problems;

  // Filters + pagination live in the URL, matching the other admin lists.
  const { state, set } = useUrlState({
    payment_status: {
      key: 'payment_status',
      parse: (raw) =>
        (PAYMENT_FILTER_VALUES as readonly string[]).includes(raw) ? raw : 'all',
      serialize: String,
      default: 'all',
    },
    q: {
      key: 'q',
      parse: (raw) => raw.slice(0, 100),
      serialize: String,
      default: '',
    },
    page: { key: 'page', parse: (r) => Number(r) || 1, serialize: String, default: 1 },
  });

  const status = state.payment_status as PaymentStatus | 'all';
  const committedQ = state.q as string;
  /** The live input value; the URL `q` is the committed (debounced) term. */
  const [q, setQ] = useState(committedQ);
  const page = Math.max(1, Number(state.page) || 1);
  const setPage = (value: number | ((p: number) => number)) => {
    set({ page: typeof value === 'function' ? value(page) : value });
  };

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [approveNote, setApproveNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [approveError, setApproveError] = useState<AmountUnmatchedError>(null);

  useEffect(() => {
    setQ(committedQ);
  }, [committedQ]);

  // Commit the live search after a pause, and reset to page 1 on a real change.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (q !== committedQ) set({ q, page: 1 });
    }, 350);
    return () => clearTimeout(timer);
  }, [q, committedQ, set]);

  const query = useApiQuery<AdminPaymentsResponse>(
    (signal) =>
      api.admin.payments(
        { q: committedQ, payment_status: status, page, per_page: 20 },
        signal,
      ),
    [committedQ, status, page],
    {
      queryKey: keys.payments.list({
        q: committedQ,
        payment_status: status,
        page,
        per_page: 20,
      }),
    },
  );

  // The modal's detail query stays mounted but disabled while no row is open.
  const detail = useApiQuery<AdminPaymentDetail>(
    (signal) => api.admin.payment(selectedId ?? 0, signal),
    [selectedId],
    {
      enabled: selectedId !== null,
      queryKey: keys.payments.detail(selectedId ?? 0),
    },
  );

  const rows = useMemo(() => query.data?.payments ?? [], [query.data]);
  const pagination = query.data?.pagination;
  const info = useMemo(
    () => (pagination ? pageInfo(pagination, STR) : null),
    [pagination, STR],
  );

  useEffect(() => {
    if (!pagination || pagination.current_page <= pagination.last_page) return;
    set({ page: Math.max(1, pagination.last_page) });
  }, [pagination, set]);

  const detailData = detail.data;
  const hasOpenProblem = detailData?.problems.some((problem) => problem.status === 'open') ?? false;

  const approveMutation = useApiMutation(
    async (payload: { orderId: number; note: string }) =>
      api.admin.approvePayment(payload.orderId, payload.note),
  );
  const rejectMutation = useApiMutation(
    async (payload: { orderId: number; reason: string }) =>
      api.admin.rejectPayment(payload.orderId, payload.reason),
  );

  const filters: Array<{ value: PaymentStatus | 'all'; label: string }> = [
    { value: 'all', label: S.filter_all },
    { value: 'pending', label: S.filter_pending },
    { value: 'under_review', label: S.filter_under_review },
    { value: 'problem_reported', label: S.filter_problem_reported },
    { value: 'paid', label: S.filter_paid },
    { value: 'rejected', label: S.filter_rejected },
  ];

  const isFiltered = q.trim() !== '' || status !== 'all';

  function changeStatus(value: PaymentStatus | 'all') {
    set({ payment_status: value, page: 1 });
  }

  function clearFilters() {
    setQ('');
    set({ q: '', payment_status: 'all', page: 1 });
  }

  function openReview(orderId: number) {
    queryClient.removeQueries({ queryKey: keys.payments.detail(orderId) });
    setApproveNote('');
    setRejectReason('');
    setApproveError(null);
    setSelectedId(orderId);
  }

  function closeReview() {
    setSelectedId(null);
    setApproveNote('');
    setRejectReason('');
  }

  async function handleApprove() {
    if (selectedId === null || approveMutation.isPending || rejectMutation.isPending) return;

    try {
      await approveMutation.run({ orderId: selectedId, note: approveNote.trim() });
      toast.success(S.approved_msg);
      await refreshAfterReview();
      closeReview();
    } catch (err) {
      const unmatched = parseAmountUnmatched(err);
      if (unmatched) {
        setApproveError(unmatched);
      } else {
        toast.error(errorMessage(err, S.action_failed));
      }
    }
  }

  async function handleReject() {
    if (selectedId === null || approveMutation.isPending || rejectMutation.isPending) return;

    const reason = rejectReason.trim();
    if (!reason) return;

    try {
      await rejectMutation.run({ orderId: selectedId, reason });
      toast.success(S.rejected_msg);
      await refreshAfterReview();
      closeReview();
    } catch (err) {
      setApproveError(null);
      toast.error(errorMessage(err, S.action_failed));
    }
  }

  async function refreshAfterReview() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: keys.payments.all,
        refetchType: 'all',
      }),
      queryClient.invalidateQueries({
        queryKey: keys.paymentProblems.all,
        refetchType: 'all',
      }),
    ]);
  }

  async function handleDownload(submission: AdminPaymentSubmission) {
    if (selectedId === null) return;

    setDownloadingId(submission.id);
    try {
      const blob = await api.admin.downloadPaymentReceipt(selectedId, submission.id);
      saveBlob(blob, submission.receipt_original_name);
    } catch (err) {
      toast.error(errorMessage(err, S.download_failed));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <>
      <PageHeader title={S.title} subtitle={S.subtitle} icon="fas fa-money-check-dollar" />

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
                  placeholder={S.search_hint}
                  value={q}
                  maxLength={100}
                  onChange={(e) => setQ(e.target.value)}
                  aria-label={S.search_hint}
                />
                <div className="ph-pills">
                  {filters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={`ph-pill${status === filter.value ? ' active' : ''}`}
                      aria-pressed={status === filter.value}
                      onClick={() => changeStatus(filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            }
          >
            {rows.length === 0 ? (
              <EmptyState
                icon="fas fa-money-check-dollar"
                title={S.empty}
                description={isFiltered ? STR.admin.common.empty_filtered_hint : S.empty_hint}
                action={
                  isFiltered ? (
                    <Btn size="sm" variant="outline" onClick={clearFilters}>
                      <i className="fas fa-rotate-left" aria-hidden="true" />{' '}
                      {STR.admin.common.clear_filters}
                    </Btn>
                  ) : undefined
                }
              />
            ) : (
              <DataTable
                sticky
                caption={S.title}
                columns={[
                  S.col_order,
                  S.col_patient,
                  S.col_total,
                  S.col_payment_status,
                  S.col_latest_submission,
                  S.col_problem,
                  S.col_date,
                  { label: S.col_actions, className: 'ac-actions' },
                ]}
              >
                {rows.map((row) => (
                  <tr key={row.order_id}>
                    <td>#{row.order_id}</td>
                    <td>
                      {row.patient?.name ?? '—'}
                      {row.patient?.phone && (
                        <small className="admin-sub">{row.patient.phone}</small>
                      )}
                    </td>
                    <td>{money(row.grand_total)}</td>
                    <td>
                      <Badge variant={paymentStatusVariant(row.payment_status)}>
                        {paymentStatusLabel(S, row.payment_status)}
                      </Badge>
                    </td>
                    <td>{submissionStatusLabel(S, row.latest_submission_status)}</td>
                    <td>
                      {row.open_problem_id !== null ? (
                        <Badge variant="low">{S.problem_open}</Badge>
                      ) : (
                        <span className="admin-muted">{S.no_problem}</span>
                      )}
                    </td>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td className="ac-actions">
                      <Btn
                        size="xs"
                        variant="primary"
                        onClick={() => openReview(row.order_id)}
                      >
                        {S.review}
                      </Btn>
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
        open={selectedId !== null}
        title={S.detail_title}
        onClose={closeReview}
        footer={
          <Btn variant="outline" onClick={closeReview}>
            {STR.admin.common.close}
          </Btn>
        }
      >
        <AsyncBoundary
          isLoading={detail.isLoading}
          isError={detail.isError}
          error={detail.error}
          onRetry={detail.refetch}
          loadingRows={3}
        >
          {detailData && (
            <>
              <h4 className="ph-card-title" style={{ marginBlock: '0 10px' }}>
                {S.order_summary}
              </h4>
              <ul className="admin-detail-list admin-detail-list--static">
                <li>
                  <span className="admin-muted">{S.col_order}</span>
                  <strong>#{detailData.order.order_id}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.order_status}</span>
                  <strong>{detailData.order.status}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.patient}</span>
                  <strong>
                    {detailData.order.patient?.name ?? '—'}
                    {detailData.order.patient?.phone && (
                      <>
                        {' '}
                        <span className="admin-muted" dir="ltr">
                          {detailData.order.patient.phone}
                        </span>
                      </>
                    )}
                  </strong>
                </li>
                <li>
                  <span className="admin-muted">{S.subtotal}</span>
                  <strong>{money(detailData.order.subtotal)}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.discount}</span>
                  <strong>{money(detailData.order.discount)}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.total}</span>
                  <strong>{money(detailData.order.total)}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.delivery_fee}</span>
                  <strong>{money(detailData.order.delivery_fee)}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.grand_total}</span>
                  <strong>{money(detailData.order.grand_total)}</strong>
                </li>
                <li>
                  <span className="admin-muted">{S.payment_method}</span>
                  <strong>
                    {detailData.order.payment_method
                      ? (STR.accounting.payment_methods[
                          detailData.order
                            .payment_method as keyof typeof STR.accounting.payment_methods
                        ] ?? detailData.order.payment_method)
                      : '—'}
                  </strong>
                </li>
                <li>
                  <span className="admin-muted">{S.col_payment_status}</span>
                  <Badge variant={paymentStatusVariant(detailData.order.payment_status)}>
                    {paymentStatusLabel(S, detailData.order.payment_status)}
                  </Badge>
                </li>
                <li>
                  <span className="admin-muted">{S.created_at}</span>
                  <strong>{formatDateTime(detailData.order.created_at)}</strong>
                </li>
              </ul>

              <h4 className="ph-card-title" style={{ marginBlock: '20px 10px' }}>
                {S.submissions_title}
              </h4>
              {detailData.submissions.length === 0 ? (
                <p className="admin-hint">{S.no_submissions}</p>
              ) : (
                <ul className="admin-detail-list admin-detail-list--static">
                  {detailData.submissions.map((submission) => (
                     <li key={submission.id}>
                       <div>
                         <strong>
                           #{submission.id} · {money(submission.amount)}
                         </strong>
                         <span className="admin-muted">
                           {S.bank}: {submission.bank_name} — {submission.account_holder}
                         </span>
                         <span className="admin-muted" dir="ltr">
                           {submission.account_number}
                           {submission.iban ? ` · ${submission.iban}` : ''}
                         </span>
                         <span className="admin-muted">
                           {S.sender}: {submission.sender_name ?? '—'}
                         </span>
                         <span className="admin-muted">
                           {S.reference}: {submission.transfer_reference ?? '—'}
                         </span>
                         <span className="admin-muted">
                           {S.transferred_at}: {formatDateTime(submission.transferred_at)}
                         </span>
                         <span className="admin-muted">
                           {S.snapshot_total}:{' '}
                           <strong dir="ltr">
                             {money(submission.order_grand_total ?? detailData.order.grand_total)}
                           </strong>
                         </span>
                         <span className="admin-muted">
                           <Badge variant={amountStatusVariant(submission.amount_status)}>
                             {amountStatusLabel(S, submission.amount_status)}
                           </Badge>
                         </span>
                         {submission.amount_status === 'under' && (
                           <Notice tone="error">
                             <span className="admin-muted">{S.deficit_label}:</span>{' '}
                             <strong dir="ltr">
                               {money(
                                 (detailData.order.grand_total ?? 0) - (submission.amount ?? 0),
                               )}
                             </strong>
                           </Notice>
                         )}
                         {submission.amount_status === 'over' && (
                           <Notice tone="warning">
                             <span className="admin-muted">{S.overage_label}:</span>{' '}
                             <strong dir="ltr">
                               {money(submission.overage_amount)}
                             </strong>{' '}
                             <span className="admin-muted">{S.not_auto_refunded}</span>
                           </Notice>
                         )}
                         {submission.rejection_reason && (
                           <span className="admin-muted">
                             {S.rejection_reason}: {submission.rejection_reason}
                           </span>
                         )}
                         {submission.review_note && (
                           <span className="admin-muted">
                             {S.review_note}: {submission.review_note}
                           </span>
                         )}
                         <span className="admin-muted">
                           {S.created_at}: {formatDateTime(submission.created_at)}
                         </span>
                       </div>
                       <div className="admin-detail-list__actions">
                         <Badge variant={submissionVariant(submission.status)}>
                           {submissionStatusLabel(S, submission.status)}
                         </Badge>
                         <Btn
                           size="xs"
                           variant="outline"
                           icon="fas fa-download"
                           disabled={downloadingId === submission.id}
                           onClick={() => handleDownload(submission)}
                         >
                           {S.download_receipt}
                         </Btn>
                       </div>
                     </li>
                   ))}
                </ul>
              )}

              <h4 className="ph-card-title" style={{ marginBlock: '20px 10px' }}>
                {S.problems_title}
              </h4>
              {detailData.problems.length === 0 ? (
                <p className="admin-hint">{S.no_problems}</p>
              ) : (
                <ul className="admin-detail-list admin-detail-list--static">
                  {detailData.problems.map((problem) => (
                    <li key={problem.id}>
                      <div>
                        <strong>{problemCategoryLabel(P, problem.category)}</strong>
                        <span>{problem.message}</span>
                        {problem.admin_note && (
                          <span className="admin-muted">
                            {P.admin_note}: {problem.admin_note}
                          </span>
                        )}
                        <span className="admin-muted">
                          {S.created_at}: {formatDateTime(problem.created_at)}
                        </span>
                      </div>
                      <Badge variant={problem.status === 'open' ? 'low' : 'ok'}>
                        {problemStatusLabel(P, problem.status)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}

              {hasOpenProblem && (
                <div style={{ marginBlockStart: 16 }}>
                  <Notice tone="warning">{S.blocked_problem}</Notice>
                </div>
              )}

              {!hasOpenProblem && detailData.payment.can_approve && (
                <div style={{ marginBlockStart: 20 }}>
                  <h4 className="ph-card-title" style={{ marginBlock: '0 10px' }}>
                    {S.approve_title}
                  </h4>
                  {approveError && (
                    <div style={{ marginBlock: '12px 10px' }}>
                      <Notice tone="error">
                        {S.amount_unmatched_msg}
                        {approveError.grand_total !== undefined && (
                          <div className="admin-muted">
                            {S.grand_total}: <strong dir="ltr">{money(approveError.grand_total)}</strong>
                          </div>
                        )}
                        {approveError.deficit !== undefined && (
                          <div className="admin-muted">
                            {S.deficit_label}: <strong dir="ltr">{money(approveError.deficit)}</strong>
                          </div>
                        )}
                        {approveError.overage !== undefined && (
                          <div className="admin-muted">
                            {S.overage_label}: <strong dir="ltr">{money(approveError.overage)}</strong>{' '}
                            <span>{S.not_auto_refunded}</span>
                          </div>
                        )}
                        <div className="admin-muted">{S.needs_new_receipt}</div>
                      </Notice>
                    </div>
                  )}
                  <label className="admin-field">
                    <span>{S.approve_note}</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={approveNote}
                      onChange={(e) => setApproveNote(e.target.value)}
                    />
                  </label>
                  <p className="admin-hint">{S.approve_note_hint}</p>
                  <Btn
                    variant="primary"
                    icon="fas fa-circle-check"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending || rejectMutation.isPending}
                  >
                    {S.approve}
                  </Btn>
                </div>
              )}

              {!hasOpenProblem && detailData.payment.can_reject && (
                <div style={{ marginBlockStart: 20 }}>
                  <h4 className="ph-card-title" style={{ marginBlock: '0 10px' }}>
                    {S.reject_title}
                  </h4>
                  <label className="admin-field">
                    <span>{S.reject_reason}</span>
                    <textarea
                      rows={3}
                      maxLength={1000}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      required
                    />
                  </label>
                  {!rejectReason.trim() && (
                    <p className="admin-hint">{S.reject_reason_required}</p>
                  )}
                  <Btn
                    variant="danger"
                    icon="fas fa-circle-xmark"
                    onClick={handleReject}
                    disabled={
                      rejectMutation.isPending ||
                      approveMutation.isPending ||
                      !rejectReason.trim()
                    }
                  >
                    {S.reject}
                  </Btn>
                </div>
              )}

              {!hasOpenProblem &&
                !detailData.payment.can_approve &&
                !detailData.payment.can_reject && (
                  <div style={{ marginBlockStart: 16 }}>
                    <Notice tone="info">{S.no_reviewable}</Notice>
                  </div>
                )}
            </>
          )}
        </AsyncBoundary>
      </Modal>
    </>
  );
}

