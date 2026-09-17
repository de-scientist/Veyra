'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getOrder, type Order } from '../lib/shopping-api';
import { PriceDisplay } from './PriceDisplay';

type Props = { orderNumber: string; confirmationToken?: string };

export function OrderConfirmationClient({ orderNumber, confirmationToken }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getOrder(orderNumber, confirmationToken).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : 'We could not load this order.'));
  }, [confirmationToken, orderNumber]);

  if (error) return <div className="empty-state"><h1>Order unavailable</h1><p>{error}</p><Link className="button" href="/shop">Continue shopping</Link></div>;
  if (!order) return <div className="empty-state"><p>Loading your confirmation...</p></div>;

  return <div className="confirmation-layout"><section className="confirmation-card"><p className="eyebrow">Order created</p><h1>Thank you, {order.customerName?.split(' ')[0] ?? 'there'}.</h1><p>Your order number is <strong>{order.orderNumber}</strong>.</p><div className="status-row"><span>Payment <strong>{order.paymentStatus}</strong></span><span>Fulfillment <strong>{order.fulfillmentStatus}</strong></span></div><Link className="button" href="/shop">Continue shopping</Link></section><section className="confirmation-card"><h2>Order summary</h2>{order.items.map((item) => <div className="summary-line" key={`${item.sku}-${item.quantity}`}><span>{item.productName}<small>{item.variantDescription} × {item.quantity}</small></span><PriceDisplay price={item.total} /></div>)}<div className="summary-total"><span>Subtotal</span><PriceDisplay price={order.subtotal} /></div><div className="summary-line"><span>Delivery</span><PriceDisplay price={order.shippingTotal} /></div><div className="summary-total"><span>Total</span><PriceDisplay price={order.grandTotal} /></div></section></div>;
}
