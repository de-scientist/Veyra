'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminOrderDetail } from '../../../../lib/admin-api';
import { AdminStatusBadge, formatAdminDate, formatMoney } from '../../../../components/admin';

type Detail = {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  customer: { name: string | null; email: string | null; phone: string | null; guest: boolean; account: { id: string; email: string; name: string; status: string } | null };
  totals: { subtotal: number; discountTotal: number; shippingTotal: number; taxTotal: number; grandTotal: number; currency: string };
  items: Array<{ id: string; productName: string; sku: string; variantDescription: string | null; quantity: number; unitPrice: number; discountAmount: number; subtotal: number; total: number }>;
  payments: Array<{ id: string; provider: string; status: string; amount: number; currency: string; providerReference: string | null; failureReason: string | null; paidAt: string | null; createdAt: string; transactions: Array<{ id: string; status: string; providerReference: string | null; failureReason: string | null; createdAt: string }> }>;
  deliveries: Array<{ id: string; status: string; trackingNumber: string | null; courierProvider: string | null; method: { name: string; type: string } | null; zone: { code: string; name: string } | null; recipientName: string | null; recipientPhone: string | null; deliveryAddress: unknown; estimatedDeliveryAt: string | null; shippedAt: string | null; deliveredAt: string | null; history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }> }>;
  statusHistory: Array<{ status: string; changedBy: string | null; note: string | null; createdAt: string }>;
  returns: Array<{ id: string; returnNumber: string; type: string; status: string; reason: string; requestedAt: string; refund: { refundNumber: string; amount: number; status: string } | null }>;
  refunds: Array<{ id: string; refundNumber: string; amount: number; currency: string; status: string; providerReference: string | null; reason: string; requestedAt: string; processedAt: string | null }>;
  notes: string | null;
  createdAt: string;
};

interface PageProps {
<<<<<<< HEAD
  // Next.js 14 (installed: 14.2.15): route params are synchronous.
  params: { orderNumber: string };
}

export default function AdminOrderDetailPage({ params }: PageProps) {
  const routeOrderNumber = params.orderNumber;
=======
  params: Promise<{ orderNumber: string }>;
}

export default function AdminOrderDetailPage({ params }: PageProps) {
>>>>>>> ac387ed232ea2543b5a26574332714696e14b3d5
  const [order, setOrder] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
<<<<<<< HEAD
    getAdminOrderDetail(routeOrderNumber)
=======
    params
      .then(({ orderNumber }) => getAdminOrderDetail(orderNumber))
>>>>>>> ac387ed232ea2543b5a26574332714696e14b3d5
      .then((result) => {
        if (mounted) setOrder(result as unknown as Detail);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load order');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
<<<<<<< HEAD
  }, [routeOrderNumber]);
=======
  }, [params]);
>>>>>>> ac387ed232ea2543b5a26574332714696e14b3d5

  if (loading) return <div className="empty-state"><p>Loading order…</p></div>;
  if (error) return <div className="empty-state"><h1>Order not found</h1><p>{error}</p><Link href="/admin/orders" className="button">Back to Orders</Link></div>;
  if (!order) return <div className="empty-state"><h1>Order not found</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/admin/orders" className="text-button">← Back to Orders</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Order {order.orderNumber}</h1>
          <p className="muted-copy">Placed {formatAdminDate(order.createdAt)}{order.customer.guest ? ' • Guest checkout' : ''}</p>
        </div>
        <div className="account-page__actions">
          <Link href="/admin/fulfillment" className="button button--secondary">Fulfillment Queue</Link>
        </div>
      </header>

      <section className="account-section">
        <h2>Status</h2>
        <p><AdminStatusBadge status={order.status} /> <AdminStatusBadge status={order.paymentStatus} /> <AdminStatusBadge status={order.fulfillmentStatus} /></p>
      </section>

      <section className="account-section">
        <h2>Customer</h2>
        <p><strong>{order.customer.name ?? '—'}</strong> • {order.customer.email ?? '—'} • {order.customer.phone ?? '—'}</p>
        {order.customer.account && (
          <p><Link href={`/admin/customers/${order.customer.account.id}`} className="account-order-link">{order.customer.account.name} ({order.customer.account.email})</Link></p>
        )}
      </section>

      <section className="account-section">
        <h2>Items &amp; Totals ({order.totals.currency} {Number(order.totals.grandTotal).toLocaleString('en-KE')})</h2>
        <ul>
          {order.items.map((item) => (
            <li key={item.id}>{item.productName} ({item.sku}) × {item.quantity} — {formatMoney(item.total, order.totals.currency)}</li>
          ))}
        </ul>
        <p className="muted-copy">Subtotal {formatMoney(order.totals.subtotal, order.totals.currency)} • Shipping {formatMoney(order.totals.shippingTotal, order.totals.currency)} • Discount {formatMoney(order.totals.discountTotal, order.totals.currency)}</p>
      </section>

      <section className="account-section">
        <h2>Payments</h2>
        {order.payments.map((payment) => (
          <div key={payment.id} className="account-summary-card">
            <p><AdminStatusBadge status={payment.status} /> <strong>{payment.provider}</strong> — {formatMoney(payment.amount, payment.currency)}</p>
            {payment.providerReference && <p className="muted-copy">Reference: {payment.providerReference}</p>}
            {payment.failureReason && <p className="muted-copy">Failure: {payment.failureReason}</p>}
            <p className="muted-copy">{payment.transactions.length} attempt(s)</p>
          </div>
        ))}
      </section>

      <section className="account-section">
        <h2>Delivery</h2>
        {order.deliveries.map((delivery) => (
          <div key={delivery.id} className="account-summary-card">
            <p><AdminStatusBadge status={delivery.status} /> {delivery.method?.name ?? ''} {delivery.trackingNumber ? `• ${delivery.trackingNumber}` : ''}</p>
            <p className="muted-copy">Recipient: {delivery.recipientName ?? '—'} • {delivery.recipientPhone ?? '—'}</p>
            <ol className="account-timeline">
              {delivery.history.map((h, i) => (
                <li key={i}>{h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus} <span className="muted-copy">({formatAdminDate(h.createdAt)})</span></li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      <section className="account-section">
        <h2>Returns &amp; Refunds</h2>
        {order.returns.length === 0 && order.refunds.length === 0 && <p className="muted-copy">No returns or refunds.</p>}
        {order.returns.map((ret) => (
          <p key={ret.id}><Link href={`/admin/returns?search=${ret.returnNumber}`} className="account-order-link">{ret.returnNumber}</Link> — <AdminStatusBadge status={ret.status} /></p>
        ))}
        {order.refunds.map((refund) => (
          <p key={refund.id}>{refund.refundNumber} — {formatMoney(refund.amount, refund.currency)} — <AdminStatusBadge status={refund.status} /></p>
        ))}
      </section>

      <section className="account-section">
        <h2>Order Timeline</h2>
        <ol className="account-timeline">
          {order.statusHistory.map((h, i) => (
            <li key={i}>{h.status} <span className="muted-copy">({formatAdminDate(h.createdAt)}{h.note ? ` — ${h.note}` : ''})</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
