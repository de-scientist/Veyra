'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrderDetail, reorder, type AccountOrder, type AccountOrderItem } from '../../../../lib/shopping-api';
import { PriceDisplay } from '../../../../components/PriceDisplay';
import { StatusBadge } from '../../../../components/jb-ui';

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

export default function OrderDetailPage({ params }: OrderDetailPageProps) {
  const [order, setOrder] = useState<AccountOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    params.then(({ orderNumber }) => {
      getOrderDetail(orderNumber)
        .then((o: AccountOrder) => { if (mounted) setOrder(o); })
        .catch((e: unknown) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load order'); })
        .finally(() => { if (mounted) setLoading(false); });
    });
    return () => { mounted = false; };
  }, [params]);

  function formatDate(dateString: string | Date | null) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function formatDateTime(dateString: string | Date | null) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) return <div className="empty-state"><p>Loading order…</p></div>;
  if (error) return <div className="empty-state"><h1>Order not found</h1><p>{error}</p><Link href="/account/orders" className="button">Back to Orders</Link></div>;
  if (!order) return <div className="empty-state"><h1>Order not found</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/account/orders" className="text-button">← Back to Orders</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Order {order.orderNumber}</h1>
          <p className="muted-copy">Placed on {formatDate(order.createdAt)}</p>
        </div>
        <div className="account-page__actions">
          <Link href={`/account/orders/${order.orderNumber}/tracking`} className="button">Track Order</Link>
          <button type="button" className="button button--secondary" onClick={() => window.print()}>Print</button>
        </div>
      </header>

      <section className="account-section account-order-header">
        <div className="account-order-statuses">
          <div><strong>Order Status:</strong> <StatusBadge status={order.status} /></div>
          <div><strong>Payment:</strong> <StatusBadge status={order.paymentStatus} /></div>
          <div><strong>Fulfillment:</strong> <StatusBadge status={order.fulfillmentStatus} /></div>
        </div>
      </section>

      <section className="account-section">
        <h2>Order Summary</h2>
        <div className="account-order-summary-grid">
          <div className="account-summary-card">
            <p className="eyebrow">Subtotal</p>
            <PriceDisplay price={order.subtotal} />
          </div>
          <div className="account-summary-card">
            <p className="eyebrow">Shipping</p>
            <PriceDisplay price={order.shippingTotal} />
          </div>
          <div className="account-summary-card">
            <p className="eyebrow">Discount</p>
            <PriceDisplay price={order.discountTotal} />
          </div>
          <div className="account-summary-card">
            <p className="eyebrow">Tax</p>
            <PriceDisplay price={order.taxTotal} />
          </div>
          <div className="account-summary-card account-summary-card--total">
            <p className="eyebrow">Grand Total</p>
            <PriceDisplay price={order.grandTotal} />
            <span className="muted-copy">{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </section>

      <section className="account-section">
        <h2>Items ({order.itemCount})</h2>
        <div className="account-order-items">
          {order.items.map((item: AccountOrderItem) => (
            <article key={item.id} className="account-order-item">
              <div className="account-order-item__image">
                {item.productImage ? (
                  <img src={item.productImage} alt={item.productName} />
                ) : (
                  <div className="cart-item__placeholder">No image</div>
                )}
              </div>
              <div className="account-order-item__details">
                <h3>{item.productName}</h3>
                <p className="muted-copy">
                  SKU: {item.sku}
                  {item.variantDescription && ` • ${item.variantDescription}`}
                </p>
                <div className="account-order-item__pricing">
                  <span>Qty: {item.quantity}</span>
                  <span>Unit: <PriceDisplay price={item.unitPrice} /></span>
                  {item.discountAmount > 0 && <span className="muted-copy">Discount: <PriceDisplay price={item.discountAmount} /></span>}
                  <strong>Line Total: <PriceDisplay price={item.total} /></strong>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {order.delivery && (
        <section className="account-section">
          <h2>Delivery</h2>
          <div className="account-delivery">
            <div className="account-delivery__status">
              <StatusBadge status={order.delivery.status} />
              {order.delivery.method && (
                <span className="account-delivery__method">{order.delivery.method.name} ({order.delivery.method.type})</span>
              )}
            </div>
            {order.delivery.trackingNumber && (
              <div className="account-delivery__tracking">
                <strong>Tracking:</strong> {order.delivery.trackingNumber}
              </div>
            )}
            <div className="account-delivery__timestamps">
              <div><strong>Estimated:</strong> {formatDate(order.delivery.estimatedDeliveryAt)}</div>
              <div><strong>Shipped:</strong> {formatDateTime(order.delivery.shippedAt)}</div>
              <div><strong>Delivered:</strong> {formatDateTime(order.delivery.deliveredAt)}</div>
              {order.delivery.pickedUpAt && <div><strong>Picked Up:</strong> {formatDateTime(order.delivery.pickedUpAt)}</div>}
            </div>
          </div>
        </section>
      )}

      {order.payment && (
        <section className="account-section">
          <h2>Payment</h2>
          <div className="account-payment">
            <div className="account-payment__status">
              <StatusBadge status={order.payment.status} />
              <strong>{order.payment.provider}</strong>
            </div>
            <div className="account-payment__details">
              <div><strong>Amount:</strong> <PriceDisplay price={order.payment.amount} /></div>
              {order.payment.providerReference && <div><strong>Reference:</strong> {order.payment.providerReference}</div>}
              {order.payment.paidAt && <div><strong>Paid:</strong> {formatDateTime(order.payment.paidAt)}</div>}
            </div>
          </div>
        </section>
      )}

      <section className="account-section">
        <h2>Timeline</h2>
        <div className="account-timeline">
          {order.delivery?.history?.map((event: { fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }, idx: number) => (
            <div key={idx} className="account-timeline__event">
              <div className="account-timeline__marker" />
              <div className="account-timeline__content">
                <div className="account-timeline__label">{event.toStatus.replace(/_/g, ' ')}</div>
                <div className="account-timeline__time">{formatDateTime(event.createdAt)}</div>
                {event.note && <div className="account-timeline__note">{event.note}</div>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="account-section">
        <h2>Actions</h2>
        <div className="account-actions">
          <Link href={`/account/orders/${order.orderNumber}/tracking`} className="button">Track Order</Link>
          <button
            type="button"
            className="button button--secondary"
            onClick={async () => {
              try {
                const result = await reorder(order.orderNumber);
                const added = result.results.filter((r: { added: boolean }) => r.added).length;
                alert(added > 0 ? `${added} item(s) added to your cart. Review your cart to check out.` : 'No items could be added to your cart (unavailable or out of stock).');
                if (added > 0) window.location.href = '/cart';
              } catch (e) {
                alert(e instanceof Error ? e.message : 'Reorder failed. Please try again.');
              }
            }}
          >
            Reorder These Items
          </button>
          <Link href="/returns" className="button button--secondary">Request Return</Link>
          <button type="button" className="button button--secondary" onClick={() => window.print()}>Print Order</button>
        </div>
      </section>
    </div>
  );
}