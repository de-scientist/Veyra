import { Prisma } from '@prisma/client';

import { hashToken } from '../auth.js';
import { HttpError } from '../errors.js';
import { afterCommitNotify, deterministicEventId, enqueueEvent } from '../notifications/events.js';
import { prisma } from '../prisma.js';
import { MpesaPaymentProvider, buildPaymentCorrelationKey } from './mpesa.js';
import { PaymentProviderError } from './provider.js';

const provider = new MpesaPaymentProvider();

type PaymentWithOrder = Prisma.PaymentGetPayload<{ include: { order: true } }>;

type CallbackData = {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDescription: string;
  amount?: number;
  receipt?: string;
  phone?: string;
  raw: unknown;
};

function paymentStatusLabel(status: string) {
  return status === 'PAID' ? 'PAID' : status === 'FAILED' ? 'FAILED' : 'PENDING';
}

function serializePayment(payment: PaymentWithOrder | (PaymentWithOrder & { transactions?: Array<{ id: string; status: string; providerReference: string | null }> })) {
  return {
    id: payment.id,
    orderNumber: payment.order.orderNumber,
    provider: payment.provider,
    status: paymentStatusLabel(payment.status),
    amount: Number(payment.amount),
    currency: payment.currency,
    providerReference: payment.providerReference,
    paidAt: payment.paidAt,
  };
}

function extractCallback(body: unknown): CallbackData {
  const root = body as { Body?: { stkCallback?: { MerchantRequestID?: unknown; CheckoutRequestID?: unknown; ResultCode?: unknown; ResultDesc?: unknown; CallbackMetadata?: { Item?: Array<{ Name?: unknown; Value?: unknown }> } } } };
  const callback = root.Body?.stkCallback;
  if (!callback || typeof callback.MerchantRequestID !== 'string' || typeof callback.CheckoutRequestID !== 'string' || typeof callback.ResultCode !== 'number' || typeof callback.ResultDesc !== 'string') {
    throw new HttpError(400, 'MPESA_INVALID_CALLBACK', 'The payment callback payload is invalid.');
  }
  const values = new Map((callback.CallbackMetadata?.Item ?? []).filter((item) => typeof item.Name === 'string').map((item) => [item.Name as string, item.Value]));
  const amount = typeof values.get('Amount') === 'number' ? values.get('Amount') as number : undefined;
  const receipt = typeof values.get('MpesaReceiptNumber') === 'string' ? values.get('MpesaReceiptNumber') as string : undefined;
  const phone = typeof values.get('PhoneNumber') === 'number' ? String(values.get('PhoneNumber')) : undefined;
  return { merchantRequestId: callback.MerchantRequestID, checkoutRequestId: callback.CheckoutRequestID, resultCode: callback.ResultCode, resultDescription: callback.ResultDesc, amount, receipt, phone, raw: body };
}

async function authorizedOrder(orderNumber: string, userId?: string, confirmationToken?: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const authorized = userId ? order.userId === userId : confirmationToken ? order.confirmationTokenHash === hashToken(confirmationToken) : false;
  if (!authorized) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return order;
}

export async function initiateMpesaPayment(orderNumber: string, idempotencyKey: string, userId?: string, confirmationToken?: string) {
  const order = await authorizedOrder(orderNumber, userId, confirmationToken);
  if (order.status === 'CANCELLED') throw new HttpError(409, 'PAYMENT_ORDER_CANCELLED', 'Cancelled orders cannot be paid.');
  if (order.paymentStatus === 'PAID') throw new HttpError(409, 'ALREADY_PAID', 'This order has already been paid.');
  if (!order.customerPhone || !order.grandTotal.gt(0)) throw new HttpError(409, 'PAYMENT_NOT_PAYABLE', 'This order is not ready for payment.');
  if (order.currency !== 'KES') throw new HttpError(409, 'MPESA_INVALID_CURRENCY', 'M-Pesa payments require a KES order.');

  const correlationKey = buildPaymentCorrelationKey(order.id, idempotencyKey);
  const existing = await prisma.paymentTransaction.findFirst({ where: { provider: 'MPESA', idempotencyKey: correlationKey }, include: { payment: { include: { order: true } } } });
  if (existing) return { payment: serializePayment(existing.payment), transactionId: existing.id, providerRequestId: existing.providerRequestId, customerMessage: existing.status === 'FAILED' ? 'The previous payment attempt failed. You can try again.' : 'Payment request is already being processed.', replayed: true };

  let payment = await prisma.payment.findUnique({ where: { orderId_provider: { orderId: order.id, provider: 'MPESA' } }, include: { order: true } });
  if (!payment) {
    payment = await prisma.payment.create({ data: { orderId: order.id, provider: 'MPESA', status: 'PENDING', amount: order.grandTotal, currency: order.currency }, include: { order: true } });
  } else if (payment.status === 'PENDING') {
    const activeAttempt = await prisma.paymentTransaction.findFirst({ where: { paymentId: payment.id, status: 'PENDING', createdAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } }, orderBy: { createdAt: 'desc' } });
    if (activeAttempt) return { payment: serializePayment(payment), transactionId: activeAttempt.id, providerRequestId: activeAttempt.providerRequestId, customerMessage: 'A payment request is already active. Check your phone.', replayed: true };
  }

  const transaction = await prisma.paymentTransaction.create({ data: { paymentId: payment.id, provider: 'MPESA', amount: payment.amount, currency: payment.currency, status: 'PENDING', idempotencyKey: correlationKey } });
  try {
    const amount = Number(payment.amount);
    const initiation = await provider.initialize({ amount, currency: payment.currency, phone: order.customerPhone, accountReference: order.orderNumber, transactionDescription: 'Veyra order', idempotencyKey: correlationKey });
    const updated = await prisma.$transaction(async (client) => {
      await client.paymentTransaction.update({ where: { id: transaction.id }, data: { providerRequestId: initiation.providerRequestId, providerMerchantRequestId: initiation.providerMerchantRequestId, rawResponse: initiation.rawResponse as Prisma.InputJsonValue, status: initiation.accepted ? 'PENDING' : 'FAILED', failureReason: initiation.accepted ? null : initiation.customerMessage } });
      const next = await client.payment.update({ where: { id: payment.id }, data: { status: initiation.accepted ? 'PENDING' : 'FAILED', failureReason: initiation.accepted ? null : initiation.customerMessage }, include: { order: true } });
      await client.auditLog.create({
        data: {
          actorId: userId ?? null,
          action: 'PAYMENT_UPDATED',
          entity: 'Payment',
          entityId: payment.id,
          before: { status: payment.status } as Prisma.InputJsonValue,
          after: { status: next.status, providerRequestId: initiation.providerRequestId } as Prisma.InputJsonValue,
        },
      });
      return next;
    });
    return { payment: serializePayment(updated), transactionId: transaction.id, providerRequestId: initiation.providerRequestId, customerMessage: initiation.customerMessage, replayed: false };
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      if (!error.retryable) await prisma.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', failureReason: error.code, rawResponse: error.rawResponse as Prisma.InputJsonValue } });
      throw new HttpError(error.retryable ? 503 : 400, error.code, error.retryable ? 'We could not reach M-Pesa. Please try again safely.' : error.message);
    }
    throw error;
  }
}

/** Sentinel: another worker won the atomic claim for this transaction row. */
class DuplicateCallback extends Error {
  constructor() {
    super('duplicate-callback');
    this.name = 'DuplicateCallback';
  }
}

type ProviderResult = {
  checkoutRequestId: string;
  merchantRequestId?: string;
  resultCode: number;
  resultDescription: string;
  /** Present on callbacks; absent on query probes — only enforced when present. */
  amount?: number;
  receipt?: string;
  raw: unknown;
};

function auditPayment(client: Prisma.TransactionClient, paymentId: string, before: string, after: string, detail?: Record<string, unknown>) {
  return client.auditLog.create({
    data: {
      actorId: null,
      action: 'PAYMENT_UPDATED',
      entity: 'Payment',
      entityId: paymentId,
      before: { status: before } as Prisma.InputJsonValue,
      after: { status: after, ...detail } as Prisma.InputJsonValue,
    },
  });
}

/**
 * Single choke point for every provider outcome (callbacks and query
 * probes). Guarantees: terminal transaction rows are never reprocessed;
 * PAID payments are never downgraded; concurrent duplicates collapse to
 * exactly one effective transition via atomic row claims.
 */
async function applyProviderResult(result: ProviderResult) {
  const transaction = await prisma.paymentTransaction.findFirst({
    where: { provider: 'MPESA', providerRequestId: result.checkoutRequestId },
    include: { payment: { include: { order: true } } },
  });
  if (!transaction) return { acknowledged: true, processed: false };
  if (transaction.status === 'PAID' || transaction.status === 'FAILED') {
    return { acknowledged: true, processed: true, duplicate: true };
  }

  const expectedAmount = Number(transaction.payment.amount);
  const successful = result.resultCode === 0;
  const previousPaymentStatus = transaction.payment.status;

  if (successful && result.amount !== undefined && result.amount !== expectedAmount) {
    await prisma.$transaction(async (client) => {
      const claimed = await client.paymentTransaction.updateMany({
        where: { id: transaction.id, status: 'PENDING' },
        data: {
          status: 'FAILED',
          providerMerchantRequestId: result.merchantRequestId,
          providerReference: result.receipt,
          rawResponse: result.raw as Prisma.InputJsonValue,
          failureReason: 'RECONCILIATION_REQUIRED: payment amount mismatch',
        },
      });
      if (claimed.count !== 1) throw new DuplicateCallback();
      // Never downgrade an already-PAID payment, even on mismatch.
      await client.payment.updateMany({
        where: { id: transaction.paymentId, status: { not: 'PAID' } },
        data: { status: 'FAILED', providerReference: result.receipt, failureReason: 'RECONCILIATION_REQUIRED: payment amount mismatch' },
      });
      await auditPayment(client, transaction.paymentId, previousPaymentStatus, 'FAILED', { reason: 'amount-mismatch', expectedAmount });
    }).catch((error) => {
      if (error instanceof DuplicateCallback) return;
      throw error;
    });
    return { acknowledged: true, processed: false, reconciliationRequired: true };
  }

  try {
    await prisma.$transaction(async (client) => {
      if (!successful) {
        const claimed = await client.paymentTransaction.updateMany({
          where: { id: transaction.id, status: 'PENDING' },
          data: {
            status: 'FAILED',
            providerMerchantRequestId: result.merchantRequestId,
            providerReference: result.receipt,
            rawResponse: result.raw as Prisma.InputJsonValue,
            failureReason: result.resultDescription,
          },
        });
        if (claimed.count !== 1) throw new DuplicateCallback();
        const current = await client.payment.findUniqueOrThrow({ where: { id: transaction.paymentId } });
        // A late failure for a superseded attempt must not touch a PAID payment —
        // and must not emit a failure notification after success.
        if (current.status === 'PAID') return;
        await client.payment.update({
          where: { id: transaction.paymentId },
          data: { status: 'FAILED', providerReference: result.receipt, failureReason: result.resultDescription },
        });
        await auditPayment(client, transaction.paymentId, current.status, 'FAILED', { resultCode: result.resultCode });
        await enqueueEvent(client, {
          eventId: deterministicEventId('payment', transaction.id, result.checkoutRequestId, result.resultCode),
          eventType: 'PAYMENT_FAILED',
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
          },
        });
        return;
      }

      // Success path: claim the payment row first so concurrent successes for
      // different attempts of the same order collapse to one winner.
      const paymentClaimed = await client.payment.updateMany({
        where: { id: transaction.paymentId, status: { not: 'PAID' } },
        data: {
          status: 'PAID',
          providerReference: result.receipt,
          providerPaymentId: result.checkoutRequestId,
          paidAt: new Date(),
          failureReason: null,
        },
      });
      if (paymentClaimed.count !== 1) throw new DuplicateCallback();
      const claimed = await client.paymentTransaction.updateMany({
        where: { id: transaction.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          providerMerchantRequestId: result.merchantRequestId,
          providerTransactionId: result.receipt,
          providerReference: result.receipt,
          rawResponse: result.raw as Prisma.InputJsonValue,
        },
      });
      if (claimed.count !== 1) throw new DuplicateCallback();

      const order = await client.order.findUniqueOrThrow({ where: { id: transaction.payment.orderId } });
      const confirmOrder = order.status === 'PENDING';
      await client.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'PAID', status: confirmOrder ? 'CONFIRMED' : undefined },
      });
      if (confirmOrder) {
        await client.orderStatusHistory.create({ data: { orderId: order.id, status: 'CONFIRMED', changedBy: null, note: 'Payment confirmed by M-Pesa callback.' } });
      }
      await auditPayment(client, transaction.paymentId, previousPaymentStatus, 'PAID', { receipt: result.receipt ?? null });

      const reservations = await client.inventoryReservation.findMany({ where: { orderId: order.id, status: 'ACTIVE' }, orderBy: { variantId: 'asc' } });
      for (const reservation of reservations) {
        const updated = await client.inventory.updateMany({ where: { variantId: reservation.variantId, quantityReserved: { gte: reservation.quantity }, quantityOnHand: { gte: reservation.quantity } }, data: { quantityReserved: { decrement: reservation.quantity }, quantityOnHand: { decrement: reservation.quantity } } });
        if (updated.count !== 1) throw new HttpError(409, 'PAYMENT_INVENTORY_SYNC_FAILED', 'Payment was confirmed but inventory conversion requires reconciliation.');
        await client.inventoryReservation.update({ where: { id: reservation.id }, data: { status: 'CONVERTED', convertedAt: new Date() } });
        await client.inventoryMovement.create({ data: { variantId: reservation.variantId, movementType: 'OUT', quantity: reservation.quantity, reason: 'PAYMENT_CONFIRMED', referenceType: 'ORDER', referenceId: order.id } });
      }
      await enqueueEvent(client, {
        eventId: deterministicEventId('payment', transaction.id, result.checkoutRequestId, result.resultCode),
        eventType: 'PAYMENT_CONFIRMED',
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
          providerReference: result.receipt ?? null,
        },
      });
    });
  } catch (error) {
    if (error instanceof DuplicateCallback) return { acknowledged: true, processed: true, duplicate: true };
    throw error;
  }

  afterCommitNotify();

  return { acknowledged: true, processed: true, successful };
}

export async function handleMpesaCallback(body: unknown) {
  return applyProviderResult(extractCallback(body));
}

export async function getPaymentStatus(paymentId: string, userId?: string, confirmationToken?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  const authorized = userId ? payment.order.userId === userId : confirmationToken ? payment.order.confirmationTokenHash === hashToken(confirmationToken) : false;
  if (!authorized) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  return serializePayment(payment);
}

/**
 * Recovery probe for delayed/missing callbacks: queries Daraja for the
 * latest PENDING attempt and folds any concluded outcome through the same
 * guarded `applyProviderResult` machinery as callbacks. UNKNOWN provider
 * states (no ResultCode yet) leave everything untouched — never FAILED.
 */
export async function queryPaymentTransaction(paymentId: string, userId?: string, confirmationToken?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  const authorized = userId ? payment.order.userId === userId : confirmationToken ? payment.order.confirmationTokenHash === hashToken(confirmationToken) : false;
  if (!authorized) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  if (payment.status === 'PAID') return { payment: serializePayment(payment), transactionId: null, refreshed: false, pending: false };

  const pending = await prisma.paymentTransaction.findFirst({
    where: { paymentId: payment.id, provider: 'MPESA', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending?.providerRequestId) {
    return { payment: serializePayment(payment), transactionId: pending?.id ?? null, refreshed: false, pending: payment.status !== 'FAILED' };
  }

  let probe;
  try {
    probe = await provider.queryTransaction({
      providerRequestId: pending.providerRequestId,
      providerMerchantRequestId: pending.providerMerchantRequestId,
    });
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      throw new HttpError(error.retryable ? 503 : 400, error.code, error.retryable ? 'We could not reach M-Pesa. Please try again safely.' : error.message);
    }
    throw error;
  }

  if (probe.resultCode === undefined) {
    const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { order: true } });
    return { payment: serializePayment(fresh), transactionId: pending.id, refreshed: false, pending: true };
  }

  const outcome = await applyProviderResult({
    checkoutRequestId: pending.providerRequestId,
    merchantRequestId: pending.providerMerchantRequestId ?? undefined,
    resultCode: probe.resultCode,
    resultDescription: probe.resultDesc ?? 'Status returned by provider query.',
    raw: probe.rawResponse,
  });
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id }, include: { order: true } });
  return {
    payment: serializePayment(fresh),
    transactionId: pending.id,
    refreshed: outcome.processed === true && !('duplicate' in outcome && outcome.duplicate),
    pending: fresh.status !== 'PAID' && fresh.status !== 'FAILED',
    reconciliationRequired: 'reconciliationRequired' in outcome ? outcome.reconciliationRequired : undefined,
  };
}
