import { useParams } from 'react-router-dom';
import { AsyncBoundary, EmptyState, PageHeader } from '@/components/ui';
import { usePharmacyApi, usePharmacyKeys } from '@/auth/authHooks';
import { useApiQuery } from '@/api/useApiQuery';
import { useLang } from '@/lib/lang/useLang';
import { OrderDetails } from './OrderDetails';

export default function OrderDetailsPage() {
  const { STR } = useLang();
  const S = STR.orders;
  const api = usePharmacyApi();
  const keys = usePharmacyKeys();
  const { id } = useParams();
  const parsed = Number(id);
  const valid = Number.isSafeInteger(parsed) && parsed > 0;
  const query = useApiQuery((signal) => api.incomingOrder(parsed, signal), [parsed], {
    enabled: valid, queryKey: keys.incomingOrders.detail(parsed),
  });

  return (
    <div className="ph-page">
      <PageHeader title={S.details} subtitle={valid ? `#${parsed}` : S.unavailable} icon="fas fa-cart-shopping" />
      {!valid ? <EmptyState icon="fas fa-circle-exclamation" title={S.unavailable} /> :
        <AsyncBoundary isLoading={query.isLoading} isError={query.isError} error={query.error} onRetry={query.refetch}>
          {query.data && <OrderDetails order={query.data} strings={S} />}
        </AsyncBoundary>}
    </div>
  );
}
