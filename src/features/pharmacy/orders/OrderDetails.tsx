import { Badge, Btn, Card, DataTable, Notice } from '@/components/ui';
import { formatDateTime, money } from '@/lib/format';
import type { ApiIncomingOrder } from '@/api/pharmacyTypes';
import { ROUTES } from '@/routes/paths';
import { orderStatusLabel, paymentStatusLabel, type OrderStrings } from './orderLabels';

export function OrderDetails({ order, strings: S }: { order: ApiIncomingOrder; strings: OrderStrings }) {
  const problemReported = order.payment_status === 'problem_reported';
  const paymentTone = problemReported ? 'problem' : order.payment_status === 'paid' ? 'paid' : 'pending';
  const itemsCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <main className="order-invoice" aria-label={S.details}>
      <div className="order-invoice__topline">
        <div className="order-invoice__numbers">
          <span>{S.parent} <strong dir="ltr">#{order.order_id}</strong></span>
          <span>{S.sub_order} <strong dir="ltr">#{order.id}</strong></span>
        </div>
        <Btn to={ROUTES.orders} variant="outline" size="sm"><i className="fas fa-arrow-right" aria-hidden="true" /> {S.back}</Btn>
      </div>

      <section className={`order-status-strip order-status-strip--${paymentTone}`} aria-label={`${S.status} / ${S.payment}`}>
        <div className="order-status-strip__item order-status-strip__item--order">
          <span className="order-invoice__eyebrow">{S.status}</span>
          <strong>{orderStatusLabel(order.status, S)}</strong>
        </div>
        <div className="order-status-strip__divider" aria-hidden="true" />
        <div className="order-status-strip__item">
          <span className="order-invoice__eyebrow">{S.payment}</span>
          <Badge variant={paymentTone === 'paid' ? 'ok' : paymentTone === 'problem' ? 'out' : 'low'}>{paymentStatusLabel(order.payment_status, S)}</Badge>
        </div>
      </section>

      {problemReported && <Notice tone="warning">{S.problem_hint}</Notice>}

      <section className="order-facts" aria-label={S.details}>
        <article className="order-fact">
          <span className="order-fact__icon"><i className="fas fa-user" aria-hidden="true" /></span>
          <div><span>{S.patient}</span><strong>{order.patient?.name ?? '—'}</strong></div>
        </article>
        <article className="order-fact">
          <span className="order-fact__icon"><i className="fas fa-calendar-day" aria-hidden="true" /></span>
          <div><span>{S.date}</span><strong>{formatDateTime(order.created_at)}</strong></div>
        </article>
        <article className="order-fact">
          <span className="order-fact__icon"><i className="fas fa-truck" aria-hidden="true" /></span>
          <div><span>{S.method}</span><strong>{S.delivery}</strong></div>
        </article>
      </section>

      <div className="order-invoice__grid">
        <Card title={S.medicine} icon="fas fa-prescription-bottle-medical" description={`${order.items.length} ${S.medicine_types} · ${itemsCount} ${S.units}`}>
          <div className="order-items-desktop">
            <DataTable caption={S.medicine} columns={[S.medicine, S.quantity, S.unit_price, S.line_total]}>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="order-medicine-name">{item.medicine_trade_name}</td>
                  <td>{item.quantity}</td>
                  <td dir="ltr">{money(item.unit_price)}</td>
                  <td className="order-line-total" dir="ltr">{money(item.total_price)}</td>
                </tr>
              ))}
            </DataTable>
          </div>
          <div className="order-items-mobile">
            {order.items.map((item) => (
              <article className="order-item-card" key={item.id}>
                <div className="order-item-card__title"><strong>{item.medicine_trade_name}</strong><span>× {item.quantity}</span></div>
                <div className="order-item-card__prices"><span>{S.unit_price}: <b dir="ltr">{money(item.unit_price)}</b></span><strong dir="ltr">{money(item.total_price)}</strong></div>
              </article>
            ))}
          </div>
        </Card>

        <aside className="order-money-card" aria-label={S.pharmacy_amount}>
          <span className="order-invoice__eyebrow">{S.pharmacy_amount}</span>
          <strong className="order-money-card__total" dir="ltr">{money(order.total)}</strong>
          <div className="order-money-card__row"><span>{S.subtotal}</span><b dir="ltr">{money(order.subtotal)}</b></div>
          <div className="order-money-card__row"><span>{S.discount}</span><b dir="ltr">−{money(order.discount)}</b></div>
          <div className="order-money-card__net"><span>{S.net_amount}</span><strong dir="ltr">{money(order.total)}</strong></div>
          <p>{S.totals_hint}</p>
        </aside>
      </div>

      {order.delivered_at && <p className="order-delivered-at"><i className="fas fa-circle-check" aria-hidden="true" /> {S.delivered_at}: {formatDateTime(order.delivered_at)}</p>}
    </main>
  );
}
