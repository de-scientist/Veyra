'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getOrder, getPaymentStatus, initiateMpesaPayment, type Order, type Payment } from '../lib/shopping-api';
import { PriceDisplay } from './PriceDisplay';

type Props = { orderNumber: string; confirmationToken?: string };

export function OrderConfirmationClient({ orderNumber, confirmationToken }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');
  const [payment, setPayment] = useState<Payment | null>(null);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentAttemptKey, setPaymentAttemptKey] = useState(() => `payment-${orderNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    getOrder(orderNumber, confirmationToken).then(setOrder).catch((reason) => setError(reason instanceof Error ? reason.message : 'We could not load this order.'));
  }, [confirmationToken, orderNumber]);

  useEffect(() => {
    if (!payment || payment.status === 'PAID' || payment.status === 'FAILED') return undefined;
    const timer = setInterval(() => {
      getPaymentStatus(payment.id, confirmationToken).then(setPayment).catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [confirmationToken, payment]);

  async function startPayment() {
    setPaymentBusy(true);
    setPaymentMessage('');
    try {
      const result = await initiateMpesaPayment(orderNumber, paymentAttemptKey, confirmationToken);
      setPayment(result.payment);
      setPaymentMessage(result.customerMessage);
      if (result.payment.status === 'FAILED') setPaymentAttemptKey(`payment-${orderNumber}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    } catch (reason) {
      setPaymentMessage(reason instanceof Error ? reason.message : 'We could not start the M-Pesa payment.');
    } finally {
      setPaymentBusy(false);
    }
  }

  if (error) return <div className="empty-state"><h1>Order unavailable</h1><p>{error}</p><Link className="button" href="/shop">Continue shopping</Link></div>;
  if (!order) return <div className="empty-state"><p>Loading your confirmation...</p></div>;

  return <div className="confirmation-layout"><section className="confirmation-card"><p className="eyebrow">Order created</p><h1>Thank you, {order.customerName?.split(' ')[0] ?? 'there'}.</h1><p>Your order number is <strong>{order.orderNumber}</strong>.</p><div className="status-row"><span>Payment <strong>{payment?.status ?? order.paymentStatus}</strong></span><span>Fulfillment <strong>{order.fulfillmentStatus}</strong></span></div>{payment?.status === 'PENDING' ? <p className="inline-message" role="status">{paymentMessage || 'M-Pesa request sent. Check your phone and enter your PIN.'}</p> : null}{payment?.status === 'PAID' ? <p className="success-message" role="status">Payment confirmed{payment.providerReference ? `: ${payment.providerReference}` : '.'}</p> : null}{payment?.status === 'FAILED' ? <p className="inline-message" role="alert">Payment was not completed. You can try again.</p> : null}{order.paymentStatus !== 'PAID' && payment?.status !== 'PENDING' && payment?.status !== 'PAID' ? <button type="button" className="button" disabled={paymentBusy} onClick={startPayment}>{paymentBusy ? 'Starting M-Pesa...' : 'Pay with M-Pesa'}</button> : null}<Link className="button button--secondary" href="/shop">Continue shopping</Link></section><section className="confirmation-card"><h2>Order summary</h2>{order.items.map((item) => <div className="summary-line" key={`${item.sku}-${item.quantity}`}><span>{item.productName}<small>{item.variantDescription} × {item.quantity}</small></span><PriceDisplay price={item.total} /></div>)}<div className="summary-total"><span>Subtotal</span><PriceDisplay price={order.subtotal} /></div><div className="summary-line"><span>Delivery</span><PriceDisplay price={order.shippingTotal} /></div><div className="summary-total"><span>Total</span><PriceDisplay price={order.grandTotal} /></div></section></div>;
}
