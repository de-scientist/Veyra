import { Prisma } from '@prisma/client';

import { hashToken } from '../auth.js';
import { HttpError } from '../errors.js';
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
      return client.payment.update({ where: { id: payment.id }, data: { status: initiation.accepted ? 'PENDING' : 'FAILED', failureReason: initiation.accepted ? null : initiation.customerMessage }, include: { order: true } });
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

export async function handleMpesaCallback(body: unknown) {
  const callback = extractCallback(body);
  const transaction = await prisma.paymentTransaction.findFirst({ where: { provider: 'MPESA', providerRequestId: callback.checkoutRequestId }, include: { payment: { include: { order: true } } } });
  if (!transaction) return { acknowledged: true, processed: false };
  if (transaction.status === 'PAID') return { acknowledged: true, processed: true, duplicate: true };

  const expectedAmount = Number(transaction.payment.amount);
  const successful = callback.resultCode === 0;
  if (successful && callback.amount !== expectedAmount) {
    await prisma.$transaction(async (client) => {
      await client.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', providerMerchantRequestId: callback.merchantRequestId, providerReference: callback.receipt, rawResponse: callback.raw as Prisma.InputJsonValue, failureReason: 'RECONCILIATION_REQUIRED: payment amount mismatch' } });
      await client.payment.update({ where: { id: transaction.paymentId }, data: { status: 'FAILED', providerReference: callback.receipt, failureReason: 'RECONCILIATION_REQUIRED: payment amount mismatch' } });
    });
    return { acknowledged: true, processed: false, reconciliationRequired: true };
  }

  await prisma.$transaction(async (client) => {
    if (!successful) {
      await client.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', providerMerchantRequestId: callback.merchantRequestId, providerReference: callback.receipt, rawResponse: callback.raw as Prisma.InputJsonValue, failureReason: callback.resultDescription } });
      await client.payment.update({ where: { id: transaction.paymentId }, data: { status: 'FAILED', providerReference: callback.receipt, failureReason: callback.resultDescription } });
      return;
    }

    const reservations = await client.inventoryReservation.findMany({ where: { orderId: transaction.payment.orderId, status: 'ACTIVE' }, orderBy: { variantId: 'asc' } });
    await client.paymentTransaction.update({ where: { id: transaction.id }, data: { status: 'PAID', providerMerchantRequestId: callback.merchantRequestId, providerTransactionId: callback.receipt, providerReference: callback.receipt, rawResponse: callback.raw as Prisma.InputJsonValue } });
    await client.payment.update({ where: { id: transaction.paymentId }, data: { status: 'PAID', providerReference: callback.receipt, providerPaymentId: callback.checkoutRequestId, paidAt: new Date(), failureReason: null } });
    await client.order.update({ where: { id: transaction.payment.orderId }, data: { paymentStatus: 'PAID', status: transaction.payment.order.status === 'PENDING' ? 'CONFIRMED' : undefined } });
    await client.orderStatusHistory.create({ data: { orderId: transaction.payment.orderId, status: transaction.payment.order.status === 'PENDING' ? 'CONFIRMED' : transaction.payment.order.status, changedBy: null, note: 'Payment confirmed by M-Pesa callback.' } });

    for (const reservation of reservations) {
      const updated = await client.inventory.updateMany({ where: { variantId: reservation.variantId, quantityReserved: { gte: reservation.quantity }, quantityOnHand: { gte: reservation.quantity } }, data: { quantityReserved: { decrement: reservation.quantity }, quantityOnHand: { decrement: reservation.quantity } } });
      if (updated.count !== 1) throw new HttpError(409, 'PAYMENT_INVENTORY_SYNC_FAILED', 'Payment was confirmed but inventory conversion requires reconciliation.');
      await client.inventoryReservation.update({ where: { id: reservation.id }, data: { status: 'CONVERTED', convertedAt: new Date() } });
      await client.inventoryMovement.create({ data: { variantId: reservation.variantId, movementType: 'OUT', quantity: reservation.quantity, reason: 'PAYMENT_CONFIRMED', referenceType: 'ORDER', referenceId: transaction.payment.orderId } });
    }
  });

  return { acknowledged: true, processed: true, successful };
}

export async function getPaymentStatus(paymentId: string, userId?: string, confirmationToken?: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  const authorized = userId ? payment.order.userId === userId : confirmationToken ? payment.order.confirmationTokenHash === hashToken(confirmationToken) : false;
  if (!authorized) throw new HttpError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
  return serializePayment(payment);
}
