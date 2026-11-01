import { Badge, Btn, DataTable } from '@/components/ui';
import { formatDateTime, money } from '@/lib/format';
import { ROUTES } from '@/routes/paths';
import type { ApiIncomingOrder } from '@/api/pharmacyTypes';
import { orderStatusLabel, paymentStatusLabel, type OrderStrings } from './orderLabels';

export function IncomingOrdersTable({ orders, strings: S }: { orders: ApiIncomingOrder[]; strings: OrderStrings }) {
  return (
    <DataTable caption={S.title} columns={[S.parent, S.sub_order, S.patient, S.date, S.items_count, S.subtotal, S.status, S.payment, S.method, S.details]}>
      {orders.map((order) => (
        <tr key={order.id}>
          <td>#{order.order_id}</td><td>#{order.id}</td>
          <td>{order.patient?.name ?? '—'}</td><td>{formatDateTime(order.created_at)}</td><td>{order.items.length}</td>
          <td>{money(order.subtotal)}</td>
          <td><Badge variant={order.status === 'cancelled' ? 'out' : 'new'}>{orderStatusLabel(order.status, S)}</Badge></td>
          <td><Badge variant={order.payment_status === 'paid' ? 'ok' : 'low'}>{paymentStatusLabel(order.payment_status, S)}</Badge></td>
          <td>{S.delivery}</td>
          <td><Btn size="xs" variant="outline" to={`${ROUTES.orders}/${order.id}`}>{S.details}</Btn></td>
        </tr>
      ))}
    </DataTable>
  );
}
