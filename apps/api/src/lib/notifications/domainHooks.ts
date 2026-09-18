import { DeliveryStatus } from '@prisma/client';

import { prisma } from '../prisma.js';
import { buildEvent, deterministicEventId, publishEvent, type NotificationEventType } from './events.js';

/**
 * Post-commit domain-event emitters. Each helper loads authoritative state and
 * publishes to the outbox; all failure paths are isolated inside `publishEvent`,
 * so notification infrastructure can never roll back a business transaction.
 */

export async function emitOrderPlaced(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, userId: true, grandTotal: true, currency: true } });
  if (!order) return;
  await publishEvent(buildEvent('ORDER_PLACED', 'Order', order.id, {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderTotal: Number(order.grandTotal),
    currency: order.currency,
  }, order.userId));
}

export async function emitPaymentEvent(
  kind: 'PAYMENT_CONFIRMED' | 'PAYMENT_FAILED',
  transactionId: string,
  checkoutRequestId: string,
  resultCode: number,
): Promise<void> {
  const transaction = await prisma.paymentTransaction.findUnique({ where: { id: transactionId }, include: { payment: { include: { order: true } } } });
  if (!transaction) return;
  const event: NotificationEventType = kind;
  await publishEvent({
    eventId: deterministicEventId('payment', transaction.id, checkoutRequestId, resultCode),
    eventType: event,
    eventVersion: 1,
    aggregateType: 'Payment',
    aggregateId: transaction.paymentId,
    userId: transaction.payment.order.userId,
    occurredAt: new Date().toISOString(),
    payload: {
      orderId: transaction.payment.orderId,
      orderNumber: transaction.payment.order.orderNumber,
      orderTotal: Number(transaction.payment.amount),
      currency: transaction.payment.currency,
      providerReference: transaction.providerReference ?? transaction.providerTransactionId ?? null,
    },
  });
}

const DELIVERY_EVENT_MAP: Partial<Record<DeliveryStatus, NotificationEventType>> = {
  PREPARING: 'ORDER_PROCESSING',
  PACKED: 'ORDER_PACKED',
  READY_FOR_PICKUP: 'ORDER_READY_FOR_PICKUP',
  ASSIGNED: 'ORDER_SHIPPED',
  IN_TRANSIT: 'ORDER_SHIPPED',
  OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
  DELIVERY_ATTEMPTED: 'DELIVERY_FAILED',
  FAILED: 'DELIVERY_FAILED',
  DELIVERED: 'ORDER_DELIVERED',
  PICKED_UP: 'ORDER_DELIVERED',
};

export async function emitDeliveryTransition(deliveryId: string, toStatus: DeliveryStatus): Promise<void> {
  const eventType = DELIVERY_EVENT_MAP[toStatus];
  if (!eventType) return;
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: { select: { id: true, orderNumber: true, userId: true, grandTotal: true, currency: true } } } });
  if (!delivery) return;
  await publishEvent(buildEvent(eventType, 'Delivery', delivery.id, {
    orderId: delivery.order.id,
    orderNumber: delivery.order.orderNumber,
    orderTotal: Number(delivery.order.grandTotal),
    currency: delivery.order.currency,
    trackingNumber: delivery.trackingNumber ?? '',
    deliveryStatus: toStatus,
  }, delivery.order.userId));
}

export async function emitReturnEvent(returnId: string, eventType: Extract<NotificationEventType, `RETURN_${string}` | `EXCHANGE_${string}`>): Promise<void> {
  const request = await prisma.returnRequest.findUnique({
    where: { id: returnId },
    include: { order: { select: { id: true, orderNumber: true, grandTotal: true, currency: true } } },
  });
  if (!request) return;
  await publishEvent(buildEvent(eventType, 'ReturnRequest', request.id, {
    returnId: request.id,
    returnNumber: request.returnNumber,
    orderId: request.order.id,
    orderNumber: request.order.orderNumber,
    orderTotal: Number(request.order.grandTotal),
    currency: request.order.currency,
    rejectionReason: request.rejectionReason ?? '',
    returnType: request.type,
  }, request.userId));
}

export async function emitRefundEvent(refundId: string, eventType: Extract<NotificationEventType, `REFUND_${string}`>): Promise<void> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    include: { order: { select: { id: true, orderNumber: true, currency: true } } },
  });
  if (!refund) return;
  const orderUser = await prisma.order.findUnique({ where: { id: refund.orderId }, select: { userId: true } });
  await publishEvent(buildEvent(eventType, 'Refund', refund.id, {
    refundId: refund.id,
    refundNumber: refund.refundNumber,
    orderId: refund.orderId,
    orderNumber: refund.order.orderNumber,
    refundAmount: Number(refund.amount),
    currency: refund.currency,
  }, orderUser?.userId ?? null));
}

export async function emitSecurityEvent(userId: string, eventType: 'PASSWORD_CHANGED' | 'ACCOUNT_DEACTIVATED'): Promise<void> {
  await publishEvent(buildEvent(eventType, 'User', userId, {}, userId));
}
