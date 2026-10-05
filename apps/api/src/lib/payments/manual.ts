import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';

import { hashToken } from '../auth.js';
import { HttpError } from '../errors.js';
import { prisma } from '../prisma.js';
import { afterCommitNotify, deterministicEventId, enqueueEvent } from '../notifications/events.js';

export const MANUAL_CHANNELS = ['PAYBILL', 'POCHI'] as const;
export type ManualChannel = (typeof MANUAL_CHANNELS)[number];

const REFERENCE_PATTERN = /^[A-Z0-9]{6,12}$/;

export function normalizeManualReference(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

export function validateManualReference(input: string): string {
  const normalized = normalizeManualReference(input);
  if (!normalized) {
    throw new HttpError(400, 'MANUAL_REFERENCE_REQUIRED', 'Enter the M-Pesa transaction code from your confirmation message.');
  }
  if (!REFERENCE_PATTERN.test(normalized)) {
    throw new HttpError(
      400,
      'MANUAL_REFERENCE_INVALID',
      'The transaction code looks invalid. It should be 6–12 letters and numbers from your M-Pesa message.',
    );
  }
  return normalized;
}

async function authorizedOrder(orderNumber: string, userId?: string, confirmationToken?: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const authorized = userId
    ? order.userId === userId
    : confirmationToken
      ? order.confirmationTokenHash === hashToken(confirmationToken)
      : false;
  if (!authorized) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return order;
}

function serializeManualPayment(
  payment: Prisma.PaymentGetPayload<{ include: { order: true } }>,
  channel: string | null,
) {
  return {
    id: payment.id,
    orderNumber: payment.order.orderNumber,
    provider: 'OTHER' as const,
    channel,
    status: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    providerReference: payment.providerReference,
    paidAt: payment.paidAt,
  };
}

function channelOf(raw: unknown): string | null {
  if (raw && typeof raw === 'object' && 'channel' in raw && typeof (raw as { channel: unknown }).channel === 'string') {
    const channel = (raw as { channel: string }).channel;
    return (MANUAL_CHANNELS as readonly string[]).includes(channel) ? channel : null;
  }
  return null;
}

/**
 * Customer submission of an externally-completed manual M-Pesa payment.
 * Records the claim as PENDING — NEVER paid. Staff verification (financial
 * role) is the only path to PAID. Duplicate references across orders are
 * rejected so one M-Pesa receipt can never pay twice.
 */
export async function submitManualPayment(
  orderNumber: string,
  transactionCode: string,
  channel: ManualChannel,
  userId?: string,
  confirmationToken?: string,
) {
  const code = validateManualReference(transactionCode);
  const order = await authorizedOrder(orderNumber, userId, confirmationToken);
  if (order.status === 'CANCELLED') throw new HttpError(409, 'PAYMENT_ORDER_CANCELLED', 'Cancelled orders cannot be paid.');
  if (order.paymentStatus === 'PAID') throw new HttpError(409, 'ALREADY_PAID', 'This order has already been paid.');
  if (order.currency !== 'KES') throw new HttpError(409, 'MPESA_INVALID_CURRENCY', 'M-Pesa payments require a KES order.');
  if (!order.grandTotal.gt(0)) throw new HttpError(409, 'PAYMENT_NOT_PAYABLE', 'This order is not ready for payment.');

  // One M-Pesa receipt must never satisfy two orders.
  const conflicting = await prisma.paymentTransaction.findFirst({
    where: { providerReference: code, payment: { orderId: { not: order.id } } },
    select: { id: true },
  });
  if (conflicting) {
    throw new HttpError(409, 'MANUAL_REFERENCE_DUPLICATE', 'This transaction code was already used for another order. Check the code and try again.');
  }
  const conflictingPayment = await prisma.payment.findFirst({
    where: { providerReference: code, orderId: { not: order.id } },
    select: { id: true },
  });
  if (conflictingPayment) {
    throw new HttpError(409, 'MANUAL_REFERENCE_DUPLICATE', 'This transaction code was already used for another order. Check the code and try again.');
  }

  const correlationKey = crypto.createHash('sha256').update(`${order.id}:${code}`).digest('hex');
  const replayedTx = await prisma.paymentTransaction.findFirst({
    where: { provider: 'OTHER', idempotencyKey: correlationKey },
    include: { payment: { include: { order: true } } },
  });
  if (replayedTx) {
    return {
      payment: serializeManualPayment(replayedTx.payment, channelOf(replayedTx.rawResponse)),
      transactionId: replayedTx.id,
      submitted: true,
      replayed: true,
    };
  }

  const payment = await prisma.payment.findUnique({
    where: { orderId_provider: { orderId: order.id, provider: 'OTHER' } },
    include: { order: true },
  });
  if (payment?.status === 'PAID') throw new HttpError(409, 'ALREADY_PAID', 'This order has already been paid.');
  if (payment && payment.providerReference && payment.providerReference !== code) {
    throw new HttpError(
      409,
      'MANUAL_REFERENCE_CONFLICT',
      'A different transaction code was already submitted for this order and is awaiting verification.',
    );
  }

  const result = await prisma.$transaction(async (client) => {
    const base = payment
      ? await client.payment.update({
          where: { id: payment.id },
          data: { status: 'PENDING', amount: order.grandTotal, currency: order.currency, providerReference: code, failureReason: null },
          include: { order: true },
        })
      : await client.payment.create({
          data: { orderId: order.id, provider: 'OTHER', status: 'PENDING', amount: order.grandTotal, currency: order.currency, providerReference: code },
          include: { order: true },
        });
    const transaction = await client.paymentTransaction.create({
      data: {
        paymentId: base.id,
        provider: 'OTHER',
        amount: base.amount,
        currency: base.currency,
        status: 'PENDING',
        providerReference: code,
        idempotencyKey: correlationKey,
        rawResponse: { channel, submittedAt: new Date().toISOString() } as Prisma.InputJsonValue,
      },
    });
    await client.auditLog.create({
      data: {
        actorId: userId ?? null,
        action: 'PAYMENT_UPDATED',
        entity: 'Payment',
        entityId: base.id,
        before: { status: payment?.status ?? 'NONE' } as Prisma.InputJsonValue,
        after: { status: 'PENDING', channel, method: 'MANUAL_MPESA' } as Prisma.InputJsonValue,
      },
    });
    return { base, transaction };
  });

  return {
    payment: serializeManualPayment(result.base, channel),
    transactionId: result.transaction.id,
    submitted: true,
    replayed: false,
  };
}

export async function listManualPending() {
  const payments = await prisma.payment.findMany({
    where: { provider: 'OTHER', status: 'PENDING' },
    include: {
      order: { select: { orderNumber: true, customerName: true, customerPhone: true, grandTotal: true, currency: true, createdAt: true } },
      transactions: { orderBy: { createdAt: 'desc' }, take: 3 },
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  return payments.map((payment) => ({
    id: payment.id,
    orderNumber: payment.order.orderNumber,
    customerName: payment.order.customerName,
    customerPhone: payment.order.customerPhone,
    amount: Number(payment.amount),
    currency: payment.currency,
    providerReference: payment.providerReference,
    channel: channelOf(payment.transactions[0]?.rawResponse),
    submittedAt: payment.createdAt,
    transactionId: payment.transactions[0]?.id ?? null,
  }));
}

/**
 * Staff verification — financial roles only (route-guarded). Transitions the
 * manual claim to PAID after the operator has confirmed the M-Pesa receipt
 * off-system, converts inventory reservations, and emits the standard
 * PAYMENT_CONFIRMED event. Amount is re-checked against the order total.
 */
export async function verifyManualPayment(paymentId: string, actorId: string, note?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment || payment.provider !== 'OTHER') throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Manual payment not found.');
  if (payment.status === 'PAID') throw new HttpError(409, 'ALREADY_PAID', 'This payment has already been verified.');
  if (payment.order.paymentStatus === 'PAID') throw new HttpError(409, 'ALREADY_PAID', 'This order has already been paid.');
  if (payment.order.status === 'CANCELLED') throw new HttpError(409, 'PAYMENT_ORDER_CANCELLED', 'Cancelled orders cannot be paid.');
  if (Number(payment.amount) !== Number(payment.order.grandTotal)) {
    throw new HttpError(409, 'MANUAL_AMOUNT_MISMATCH', 'The submitted amount does not match the order total. Resolve before verifying.');
  }

  await prisma.$transaction(async (client) => {
    const claimed = await client.payment.updateMany({
      where: { id: payment.id, status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: new Date(), failureReason: null },
    });
    if (claimed.count !== 1) throw new HttpError(409, 'ALREADY_PAID', 'This payment has already been verified.');
    await client.paymentTransaction.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'PAID' },
    });
    const confirmOrder = payment.order.status === 'PENDING';
    await client.order.update({
      where: { id: payment.orderId },
      data: { paymentStatus: 'PAID', status: confirmOrder ? 'CONFIRMED' : undefined },
    });
    if (confirmOrder) {
      await client.orderStatusHistory.create({
        data: { orderId: payment.orderId, status: 'CONFIRMED', changedBy: actorId, note: 'Manual M-Pesa payment verified by staff.' },
      });
    }
    const reservations = await client.inventoryReservation.findMany({
      where: { orderId: payment.orderId, status: 'ACTIVE' },
      orderBy: { variantId: 'asc' },
    });
    for (const reservation of reservations) {
      const updated = await client.inventory.updateMany({
        where: {
          variantId: reservation.variantId,
          quantityReserved: { gte: reservation.quantity },
          quantityOnHand: { gte: reservation.quantity },
        },
        data: { quantityReserved: { decrement: reservation.quantity }, quantityOnHand: { decrement: reservation.quantity } },
      });
      if (updated.count !== 1) continue;
      await client.inventoryReservation.update({ where: { id: reservation.id }, data: { status: 'CONVERTED', convertedAt: new Date() } });
      await client.inventoryMovement.create({
        data: { variantId: reservation.variantId, movementType: 'OUT', quantity: reservation.quantity, reason: 'PAYMENT_CONFIRMED', referenceType: 'ORDER', referenceId: payment.orderId },
      });
    }
    await client.auditLog.create({
      data: {
        actorId,
        action: 'PAYMENT_UPDATED',
        entity: 'Payment',
        entityId: payment.id,
        before: { status: payment.status } as Prisma.InputJsonValue,
        after: { status: 'PAID', method: 'MANUAL_MPESA', note: note?.slice(0, 500) ?? null } as Prisma.InputJsonValue,
      },
    });
    await enqueueEvent(client, {
      eventId: deterministicEventId('payment-manual', payment.id, payment.providerReference ?? payment.id),
      eventType: 'PAYMENT_CONFIRMED',
      eventVersion: 1,
      aggregateType: 'Payment',
      aggregateId: payment.id,
      userId: payment.order.userId,
      occurredAt: new Date().toISOString(),
      payload: {
        orderId: payment.orderId,
        orderNumber: payment.order.orderNumber,
        orderTotal: Number(payment.amount),
        currency: payment.currency,
        providerReference: payment.providerReference,
        method: 'MANUAL_MPESA',
      },
    });
  });

  afterCommitNotify();
  return { verified: true };
}

export async function rejectManualPayment(paymentId: string, actorId: string, reason: string) {
  const trimmed = reason.trim();
  if (trimmed.length < 3 || trimmed.length > 500) {
    throw new HttpError(400, 'MANUAL_REJECTION_REASON_REQUIRED', 'Provide a short reason (3–500 characters) so the customer knows what to fix.');
  }
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== 'OTHER') throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Manual payment not found.');
  if (payment.status !== 'PENDING') throw new HttpError(409, 'MANUAL_NOT_PENDING', 'Only pending manual payments can be rejected.');

  await prisma.$transaction(async (client) => {
    await client.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: trimmed } });
    await client.paymentTransaction.updateMany({
      where: { paymentId: payment.id, status: 'PENDING' },
      data: { status: 'FAILED', failureReason: trimmed },
    });
    await client.auditLog.create({
      data: {
        actorId,
        action: 'PAYMENT_UPDATED',
        entity: 'Payment',
        entityId: payment.id,
        before: { status: payment.status } as Prisma.InputJsonValue,
        after: { status: 'FAILED', method: 'MANUAL_MPESA', reason: trimmed } as Prisma.InputJsonValue,
      },
    });
  });
  return { rejected: true };
}
