import { useSearchParams } from 'react-router-dom';
import { AsyncBoundary, Btn, Card, PageHeader } from '@/components/ui';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { IncomingOrdersTable } from './IncomingOrdersTable';

export default function OrdersPage() {
  const { STR } = useLang();
  const S = STR.orders;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const [params, setParams] = useSearchParams();
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const query = useApiQuery((signal) => api.incomingOrders(page, signal), [page], {
    queryKey: keys.incomingOrders.list(page), isEmpty: (result) => result.data.length === 0,
  });
  const changePage = (next: number) => setParams({ page: String(next) });

  return (
    <div className="ph-page">
      <PageHeader title={S.title} subtitle={S.subtitle} icon="fas fa-cart-shopping" />
      <AsyncBoundary isLoading={query.isLoading} isError={query.isError} error={query.error}
        onRetry={query.refetch} isEmpty={query.isEmpty} emptyTitle={S.empty} emptyDescription={S.empty_hint}>
        {query.data && <Card headExtra={<Btn size="sm" variant="outline" onClick={query.refetch}>{S.refresh}</Btn>}>
          <IncomingOrdersTable orders={query.data.data} strings={S} />
          {query.data.pagination.last_page > 1 && <div className="admin-pagination">
            <Btn size="sm" variant="outline" disabled={page <= 1} onClick={() => changePage(page - 1)}>{S.previous}</Btn>
            <span>{page} / {query.data.pagination.last_page}</span>
            <Btn size="sm" variant="outline" disabled={page >= query.data.pagination.last_page} onClick={() => changePage(page + 1)}>{S.next}</Btn>
          </div>}
        </Card>}
      </AsyncBoundary>
    </div>
  );
}
