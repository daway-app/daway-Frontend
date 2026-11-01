import { Link, useParams } from 'react-router-dom';
import { AsyncBoundary, Btn, Card, DataTable, EmptyState, PageHeader } from '@/components/ui';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import type { ApiPlatformSettlement } from '@/api/pharmacyTypes';
import { money } from '@/lib/format';
import { useLang } from '@/lib/lang/useLang';
import type { Strings } from '@/lib/lang/types';
import { ROUTES } from '@/routes/paths';

function period(row: ApiPlatformSettlement) { return `${row.period_start} — ${row.period_end}`; }

export default function AccountingPlatformSettlementsPage() {
  const { id } = useParams();
  const settlementId = Number(id);
  if (id !== undefined) return <SettlementDetailPage id={settlementId} />;
  return <SettlementListPage />;
}

function SettlementListPage() {
  const { STR } = useLang();
  const S = STR.accounting.platform_settlements;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const query = useApiQuery((signal) => api.platformSettlements(1, signal), [], {
    queryKey: keys.platformSettlements.list(1),
  });

  return (
    <div className="ph-page">
      <PageHeader title={S.title} subtitle={S.subtitle} icon="fas fa-money-bill-transfer" />
      <AsyncBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={query.refetch}
        isEmpty={query.data?.data.length === 0} emptyTitle={S.empty} emptyDescription={S.empty_hint}>
        {query.data && <Card>
            <DataTable caption={S.title} columns={[S.period, S.orders_total, S.adjustments, S.net_total, S.status, S.reference]}>
              {query.data.data.map((row) => (
                <tr key={row.id}>
                  <td><Link to={`${ROUTES.accountingPlatformSettlements}/${row.id}`}>{period(row)}</Link></td>
                  <td dir="ltr">{money(row.orders_total)}</td>
                  <td dir="ltr">{money(row.adjustments_total)}</td>
                  <td dir="ltr"><strong>{money(row.net_total)}</strong></td>
                  <td><span className={`ph-badge ${row.status === 'paid' ? 'ok' : 'low'}`}>{row.status === 'paid' ? S.paid : S.draft}</span></td>
                  <td dir="ltr">{row.transfer_reference ?? '—'}</td>
                </tr>
              ))}
            </DataTable>
          </Card>}
      </AsyncBoundary>
    </div>
  );
}

function SettlementDetailPage({ id }: { id: number }) {
  const { STR } = useLang();
  const S = STR.accounting.platform_settlements;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const valid = Number.isSafeInteger(id) && id > 0;
  const query = useApiQuery((signal) => api.platformSettlement(id, signal), [id], {
    enabled: valid, queryKey: keys.platformSettlements.detail(id),
  });

  return (
    <div className="ph-page">
      <PageHeader title={S.details} subtitle={query.data ? period(query.data) : S.title} icon="fas fa-money-bill-transfer" />
      <Btn to={ROUTES.accountingPlatformSettlements} variant="outline" size="sm">{S.back}</Btn>
      <AsyncBoundary isLoading={valid && query.isLoading} isError={!valid || query.isError} error={query.error} onRetry={query.refetch}>
        {query.data && <SettlementDetail row={query.data} labels={S} />}
      </AsyncBoundary>
    </div>
  );
}

function SettlementDetail({ row, labels: S }: { row: ApiPlatformSettlement; labels: Strings['accounting']['platform_settlements'] }) {
  return (
    <div className="platform-settlement-detail">
      <section className="order-status-strip order-status-strip--paid">
        <div><span className="order-invoice__eyebrow">{S.status}</span><strong>{row.status === 'paid' ? S.paid : S.draft}</strong></div>
        <div><span className="order-invoice__eyebrow">{S.reference}</span><strong dir="ltr">{row.transfer_reference ?? '—'}</strong></div>
        <div><span className="order-invoice__eyebrow">{S.paid_at}</span><strong>{row.paid_at ?? '—'}</strong></div>
      </section>
      <Card title={S.details}>
        <DataTable caption={S.details} columns={[S.order, S.pharmacy_order, S.amount]}>
          {row.items.map((item) => <tr key={item.sub_order_id}><td>#{item.order_id}</td><td>#{item.sub_order_id}</td><td dir="ltr">{money(item.amount)}</td></tr>)}
        </DataTable>
      </Card>
      <Card title={S.adjustments}>
        {row.adjustments.length === 0 ? <EmptyState title={S.no_adjustments} icon="fas fa-scale-balanced" /> :
          <DataTable caption={S.adjustments} columns={[S.period, S.reason, S.amount]}>
            {row.adjustments.map((adjustment) => <tr key={adjustment.id}><td>{adjustment.effective_period_start}</td><td>{adjustment.reason}</td><td dir="ltr">{money(adjustment.amount)}</td></tr>)}
          </DataTable>}
      </Card>
      <Card>
        <div className="order-money-card__row"><span>{S.orders_total}</span><strong dir="ltr">{money(row.orders_total)}</strong></div>
        <div className="order-money-card__row"><span>{S.adjustments}</span><strong dir="ltr">{money(row.adjustments_total)}</strong></div>
        <div className="order-money-card__net"><span>{S.net_total}</span><strong dir="ltr">{money(row.net_total)}</strong></div>
      </Card>
    </div>
  );
}
