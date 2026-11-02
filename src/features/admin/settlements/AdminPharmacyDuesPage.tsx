import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AsyncBoundary, Badge, Btn, Card, FormField, Notice, PageHeader } from '@/components/ui';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { money } from '@/lib/format';
import type { AdminPlatformSettlement, AdminPlatformSettlementDue } from '@/api/adminTypes';

type Tab = 'unpaid' | 'paid';

export function AdminPlatformSettlementsPage() {
  const { STR, isRtl } = useLang();
  const S = STR.admin.platform_settlements;
  const api = useAdminApi();
  const keys = useAdminKeys();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('unpaid');
  const [files, setFiles] = useState<Record<number, File | undefined>>({});
  const [references, setReferences] = useState<Record<number, string>>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const dueKey = [...keys.all, 'platform-settlements', 'due'];
  const historyKey = [...keys.all, 'platform-settlements', 'history'];
  const due = useApiQuery<AdminPlatformSettlementDue[]>((signal) => api.admin.platformSettlementsDue(signal), [], { queryKey: dueKey });
  const history = useApiQuery<{ data: AdminPlatformSettlement[] }>((signal) => api.admin.platformSettlements(signal), [], { queryKey: historyKey });
  const payment = useApiMutation(async (payload: { pharmacyId: number; receipt: File; reference: string }) =>
    api.admin.payPlatformPharmacy(payload.pharmacyId, payload.receipt, payload.reference),
  );
  const paidRows = history.data?.data.filter((row) => row.status === 'paid') ?? [];

  async function submitPayment(row: AdminPlatformSettlementDue) {
    const receipt = files[row.pharmacy_id];
    if (!receipt) return;
    await payment.run({ pharmacyId: row.pharmacy_id, receipt, reference: references[row.pharmacy_id] ?? '' });
    setFiles((current) => ({ ...current, [row.pharmacy_id]: undefined }));
    setReferences((current) => ({ ...current, [row.pharmacy_id]: '' }));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: dueKey }),
      queryClient.invalidateQueries({ queryKey: historyKey }),
    ]);
  }

  async function downloadReceipt(id: number) {
    // فشل التنزيل كان يذهب إلى unhandled rejection: الزر لا يقول شيئًا للمستخدم.
    try {
      setDownloadError(null);
      const blob = await api.admin.downloadPlatformSettlementReceipt(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `transfer-receipt-${id}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(S.download_failed);
    }
  }

  return (
    <main className="admin-page admin-platform-dues" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader title={S.title} subtitle={S.subtitle} />
      <div className="admin-settlement-tabs" role="tablist" aria-label={S.title}>
        <Btn variant={tab === 'unpaid' ? 'primary' : 'outline'} role="tab" aria-selected={tab === 'unpaid'} onClick={() => setTab('unpaid')}>{S.unpaid}</Btn>
        <Btn variant={tab === 'paid' ? 'primary' : 'outline'} role="tab" aria-selected={tab === 'paid'} onClick={() => setTab('paid')}>{S.paid}</Btn>
      </div>

      {tab === 'unpaid' ? (
        <AsyncBoundary isLoading={due.isLoading} isError={due.isError} error={due.error} onRetry={due.refetch}
          isEmpty={!due.data?.length} emptyTitle={S.no_due}>
          <div className="admin-settlement-list">{(due.data ?? []).map((row) => (
            <Card key={row.pharmacy_id}>
              <article className="admin-dues-row">
                <header><h2>{row.pharmacy_name}</h2><Badge variant="unpaid">{S.unpaid}</Badge></header>
                <strong className="admin-dues-amount">{S.due_amount}: {money(row.total_due)}</strong>
                <p>{S.orders_count}: {row.orders_count} · {S.draft_count}: {row.draft_count}</p>
                <div className="admin-dues-parts"><span>{S.orders_total}: {money(row.orders_total)}</span><span>{S.adjustments}: {money(row.adjustments_total)}</span></div>
                <div className="admin-dues-payment-form">
                  <FormField label={S.receipt} required hint={S.receipt_required}><input key={files[row.pharmacy_id]?.name ?? 'empty'} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles((current) => ({ ...current, [row.pharmacy_id]: event.target.files?.[0] }))} /></FormField>
                  <FormField label={S.transfer_reference}><input value={references[row.pharmacy_id] ?? ''} onChange={(event) => setReferences((current) => ({ ...current, [row.pharmacy_id]: event.target.value }))} /></FormField>
                  <Btn variant="primary" disabled={!files[row.pharmacy_id] || payment.isPending} onClick={() => void submitPayment(row)}>{payment.isPending ? S.saving : S.mark_paid}</Btn>
                </div>
                {payment.error && <p className="admin-dues-error" role="alert">{payment.error.message}</p>}
              </article>
            </Card>
          ))}</div>
        </AsyncBoundary>
      ) : (
        <AsyncBoundary isLoading={history.isLoading} isError={history.isError} error={history.error} onRetry={history.refetch}
          isEmpty={!paidRows.length} emptyTitle={S.no_paid}>
          {downloadError && <Notice tone="error">{downloadError}</Notice>}
          <div className="admin-settlement-list">{paidRows.map((row) => (
            <Card key={row.id}><article className="admin-dues-row">
              <header><h2>{row.pharmacy_name}</h2><Badge variant="paid">{S.paid}</Badge></header>
              <strong className="admin-dues-amount">{S.amount}: {money(row.net_total)}</strong>
              <p>{S.period}: {row.period_start} — {row.period_end} · {row.paid_at ?? ''}</p>
              <p>{S.reference}: {row.transfer_reference || '—'}</p>
              {row.receipt_available && <Btn variant="outline" onClick={() => void downloadReceipt(row.id)}>{S.download_receipt}</Btn>}
            </article></Card>
          ))}</div>
        </AsyncBoundary>
      )}
    </main>
  );
}
