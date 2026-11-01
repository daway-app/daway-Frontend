import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AsyncBoundary, Badge, Btn, Card, FormField, PageHeader } from '@/components/ui';
import { useAdminApi, useAdminKeys } from '@/auth/adminContext';
import { useApiMutation, useApiQuery } from '@/api/useApiQuery';
import type { AdminPharmaciesResponse, AdminPlatformSettlement, AdminEligibleSettlementOrder } from '@/api/adminTypes';

const money = (n: number) => new Intl.NumberFormat('ar-PS', { style: 'currency', currency: 'ILS' }).format(n);

export function AdminPlatformSettlementsPage() {
  const api = useAdminApi();
  const keys = useAdminKeys();
  const queryClient = useQueryClient();
  const [pharmacyId, setPharmacyId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [eligible, setEligible] = useState<AdminEligibleSettlementOrder[] | null>(null);
  const [adjustment, setAdjustment] = useState({ pharmacy_id: '', effective_period_start: '', amount: '', reason: '' });
  const [transfer, setTransfer] = useState<Record<number, string>>({});
  const listKey = [...keys.all, 'platform-settlements'];
  const settlements = useApiQuery<{ data: AdminPlatformSettlement[] }>((signal) => api.admin.platformSettlements(signal), [], { queryKey: listKey });
  const pharmacies = useApiQuery<AdminPharmaciesResponse>((signal) => api.admin.pharmacies({ per_page: 100, status: 'all' }, signal), [], { queryKey: [...keys.all, 'settlement-pharmacies'] });
  const createDraft = useApiMutation(async () => api.admin.createPlatformSettlementDraft({ pharmacy_id: Number(pharmacyId), period_start: from, period_end: to }));
  const markPaid = useApiMutation(async (payload: { id: number; reference: string }) => api.admin.markPlatformSettlementPaid(payload.id, { transfer_reference: payload.reference, paid_at: new Date().toISOString() }));
  const addAdjustment = useApiMutation(async () => api.admin.addPlatformSettlementAdjustment({ pharmacy_id: Number(adjustment.pharmacy_id), effective_period_start: adjustment.effective_period_start, amount: Number(adjustment.amount), reason: adjustment.reason }));
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: listKey }); setEligible(null); };
  const preview = async () => setEligible(await api.admin.platformSettlementEligible({ pharmacy_id: Number(pharmacyId), period_start: from, period_end: to }));
  const rows = settlements.data?.data ?? [];

  return <main className="admin-page" dir="rtl">
    <PageHeader title="تسويات المنصة" subtitle="إنشاء دفعات أسبوعية يدوية ومراجعة التحويلات للصيدليات." />
    <Card><h2>إنشاء مسودة دفعة</h2><div className="admin-settlement-form">
      <FormField label="الصيدلية"><select value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)}><option value="">اختر الصيدلية</option>{(pharmacies.data?.pharmacies ?? []).map(p => <option key={p.id} value={p.id}>{p.pharmacy_name} — #{p.id}</option>)}</select></FormField>
      <FormField label="من"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></FormField>
      <FormField label="إلى"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></FormField>
    </div><div className="admin-settlement-actions"><Btn disabled={!pharmacyId || !from || !to} onClick={() => void preview()}>معاينة الطلبات المؤهلة</Btn><Btn variant="primary" disabled={!eligible?.length || createDraft.isPending} onClick={async () => { await createDraft.run(); await refresh(); }}>إنشاء المسودة</Btn></div>
    {eligible && <section aria-live="polite"><h3>الطلبات المؤهلة ({eligible.length})</h3>{eligible.length === 0 ? <p>لا توجد طلبات مدفوعة ومسلّمة في الفترة.</p> : <ul>{eligible.map(o => <li key={o.sub_order_id}>طلب فرعي #{o.sub_order_id} من الطلب #{o.order_id} — {o.items_count} أصناف — {money(o.amount)}</li>)}</ul>}<strong>الإجمالي: {money(eligible.reduce((sum, o) => sum + o.amount, 0))}</strong></section>}</Card>

    <Card><h2>تسجيل تعديل للدفعة القادمة</h2><div className="admin-settlement-form">
      <FormField label="الصيدلية"><select value={adjustment.pharmacy_id} onChange={e => setAdjustment({ ...adjustment, pharmacy_id: e.target.value })}><option value="">اختر الصيدلية</option>{(pharmacies.data?.pharmacies ?? []).map(p => <option key={p.id} value={p.id}>{p.pharmacy_name}</option>)}</select></FormField>
      <FormField label="بداية الفترة المستحقة"><input type="date" value={adjustment.effective_period_start} onChange={e => setAdjustment({ ...adjustment, effective_period_start: e.target.value })} /></FormField>
      <FormField label="المبلغ (+ / − ₪)"><input type="number" step="0.01" value={adjustment.amount} onChange={e => setAdjustment({ ...adjustment, amount: e.target.value })} /></FormField>
      <FormField label="السبب"><input value={adjustment.reason} onChange={e => setAdjustment({ ...adjustment, reason: e.target.value })} /></FormField>
    </div><Btn variant="primary" disabled={!adjustment.pharmacy_id || !adjustment.effective_period_start || !adjustment.amount || !adjustment.reason.trim() || addAdjustment.isPending} onClick={async () => { await addAdjustment.run(); setAdjustment({ pharmacy_id: '', effective_period_start: '', amount: '', reason: '' }); await refresh(); }}>حفظ التعديل للدفعة القادمة</Btn></Card>

    <Card><h2>الدفعات المسجلة</h2><AsyncBoundary isLoading={settlements.isLoading} isError={settlements.isError} isEmpty={!rows.length} emptyTitle="لا توجد دفعات بعد" emptyDescription="ستظهر هنا مسودات الدفعات والتحويلات المسجلة.">
      <div className="admin-settlement-list">{rows.map((row: AdminPlatformSettlement) => <article className="admin-settlement-row" key={row.id}><header><strong>{row.pharmacy_name}</strong><Badge variant={row.status === 'paid' ? 'paid' : 'partial'}>{row.status === 'paid' ? 'محوّلة' : 'مسودة'}</Badge></header><p>الفترة: {row.period_start} — {row.period_end} · # دفعة {row.id}</p><p>الطلبات: {money(row.orders_total)} · التعديلات: {money(row.adjustments_total)} · الصافي: <strong>{money(row.net_total)}</strong></p><ul>{row.items.map(item => <li key={item.sub_order_id}>فرعي #{item.sub_order_id} / رئيسي #{item.order_id} — {money(item.amount)}</li>)}</ul>{row.adjustments.map(item => <p key={item.id}>تعديل {money(item.amount)} — {item.reason}</p>)}{row.status === 'paid' ? <p>مرجع التحويل: {row.transfer_reference || '—'} · {row.paid_at || ''}</p> : <div className="admin-settlement-actions"><input aria-label="مرجع التحويل" placeholder="مرجع التحويل" value={transfer[row.id] ?? ''} onChange={e => setTransfer({ ...transfer, [row.id]: e.target.value })} /><Btn variant="primary" disabled={!transfer[row.id]?.trim() || markPaid.isPending} onClick={async () => { await markPaid.run({ id: row.id, reference: transfer[row.id].trim() }); await refresh(); }}>تسجيل التحويل</Btn></div>}</article>)}</div>
    </AsyncBoundary></Card>
  </main>;
}
