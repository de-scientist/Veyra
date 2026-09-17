import crypto from 'node:crypto';

import { Prisma, ReturnCondition, ReturnDisposition, ReturnStatus, ReturnType, RefundStatus, ExchangeStatus } from '@prisma/client';

import { calculateAvailableQuantity } from './catalog.js';
import { env } from './env.js';
import { HttpError } from './errors.js';
import { prisma } from './prisma.js';

const activeReturnStatuses: ReturnStatus[] = [ReturnStatus.REQUESTED, ReturnStatus.UNDER_REVIEW, ReturnStatus.APPROVED, ReturnStatus.RETURN_INITIATED, ReturnStatus.RECEIVED, ReturnStatus.INSPECTING, ReturnStatus.APPROVED_FOR_RESOLUTION];
const returnInclude = {
  order: { include: { items: true, deliveries: true, payments: true } },
  items: { include: { orderItem: true, variant: true } },
  history: { orderBy: { createdAt: 'asc' as const } },
  refund: true,
  exchange: { include: { replacementVariant: true } },
};

type ReturnWithDetails = Prisma.ReturnRequestGetPayload<{ include: typeof returnInclude }>;

type ReturnItemInput = { orderItemId: string; quantity: number; reason: string; replacementVariantId?: string };

function returnNumber() {
  return `RET-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function refundNumber() {
  return `RFD-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function isEligibleDelivery(order: ReturnWithDetails['order']) {
  return order.fulfillmentStatus === 'DELIVERED' || order.deliveries.some((delivery) => delivery.status === 'DELIVERED' || delivery.status === 'PICKED_UP');
}

function assertReturnTransition(from: ReturnStatus, to: ReturnStatus) {
  const legal: Record<string, ReturnStatus[]> = {
    REQUESTED: [ReturnStatus.UNDER_REVIEW, ReturnStatus.CANCELLED],
    UNDER_REVIEW: [ReturnStatus.APPROVED, ReturnStatus.REJECTED],
    APPROVED: [ReturnStatus.RETURN_INITIATED, ReturnStatus.RECEIVED],
    RETURN_INITIATED: [ReturnStatus.RECEIVED],
    RECEIVED: [ReturnStatus.INSPECTING],
    INSPECTING: [ReturnStatus.APPROVED_FOR_RESOLUTION],
    APPROVED_FOR_RESOLUTION: [ReturnStatus.RESOLVED],
  };
  if (!legal[from]?.includes(to)) throw new HttpError(409, 'INVALID_RETURN_TRANSITION', `Return cannot move from ${from} to ${to}.`);
}

function serializeReturn(returnRequest: ReturnWithDetails) {
  return {
    id: returnRequest.id,
    returnNumber: returnRequest.returnNumber,
    orderNumber: returnRequest.order.orderNumber,
    type: returnRequest.type,
    status: returnRequest.status,
    reason: returnRequest.reason,
    customerNote: returnRequest.customerNote,
    requestedAt: returnRequest.requestedAt,
    approvedAt: returnRequest.approvedAt,
    receivedAt: returnRequest.receivedAt,
    completedAt: returnRequest.completedAt,
    rejectionReason: returnRequest.rejectionReason,
    items: returnRequest.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      productName: item.orderItem.productName,
      sku: item.orderItem.sku,
      variantDescription: item.orderItem.variantDescription,
      quantity: item.quantity,
      reason: item.reason,
      condition: item.condition,
      disposition: item.disposition,
      refundAmount: Number(item.refundAmount),
    })),
    refund: returnRequest.refund ? { refundNumber: returnRequest.refund.refundNumber, amount: Number(returnRequest.refund.amount), currency: returnRequest.refund.currency, status: returnRequest.refund.status, providerReference: returnRequest.refund.providerReference } : null,
    exchange: returnRequest.exchange ? { status: returnRequest.exchange.status, replacementVariantId: returnRequest.exchange.replacementVariantId, quantity: returnRequest.exchange.quantity } : null,
    history: returnRequest.history.map((entry) => ({ fromStatus: entry.fromStatus, toStatus: entry.toStatus, note: entry.note, createdAt: entry.createdAt })),
  };
}

async function getOwnedReturn(returnId: string, userId?: string) {
  const returnRequest = await prisma.returnRequest.findUnique({ where: { id: returnId }, include: returnInclude });
  if (!returnRequest || (userId && returnRequest.userId !== userId)) throw new HttpError(404, 'RETURN_NOT_FOUND', 'Return request not found.');
  return returnRequest;
}

export async function createReturn(userId: string, input: { orderNumber: string; type: ReturnType; reason: string; customerNote?: string; items: ReturnItemInput[] }) {
  const order = await prisma.order.findUnique({ where: { orderNumber: input.orderNumber }, include: { items: true, deliveries: true, payments: true, returnRequests: { where: { status: { in: activeReturnStatuses } }, include: { items: true } } } });
  if (!order || order.userId !== userId) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (order.paymentStatus !== 'PAID' || !isEligibleDelivery(order as ReturnWithDetails['order'])) throw new HttpError(409, 'RETURN_NOT_ELIGIBLE', 'Only paid and delivered orders are eligible for returns.');
  if (env.RETURN_WINDOW_DAYS) {
    const deliveredAt = order.deliveries.find((delivery) => delivery.deliveredAt || delivery.pickedUpAt)?.deliveredAt ?? order.deliveries.find((delivery) => delivery.deliveredAt || delivery.pickedUpAt)?.pickedUpAt;
    if (deliveredAt && Date.now() > deliveredAt.getTime() + env.RETURN_WINDOW_DAYS * 86400000) throw new HttpError(409, 'RETURN_WINDOW_EXPIRED', 'The return window has expired.');
  }
  if (!input.items.length) throw new HttpError(400, 'RETURN_ITEMS_REQUIRED', 'Select at least one item to return.');

  const orderItems = new Map(order.items.map((item) => [item.id, item]));
  const activeQuantities = new Map<string, number>();
  for (const existing of order.returnRequests) for (const item of existing.items) activeQuantities.set(item.orderItemId, (activeQuantities.get(item.orderItemId) ?? 0) + item.quantity);
  const seen = new Set<string>();
  const prepared: Array<{ data: ReturnItemInput; orderItem: typeof order.items[number]; refundAmount: Prisma.Decimal }> = [];

  for (const item of input.items) {
    if (seen.has(item.orderItemId)) throw new HttpError(400, 'RETURN_DUPLICATE_ITEM', 'An order item may only appear once in a return request.');
    seen.add(item.orderItemId);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) throw new HttpError(400, 'RETURN_INVALID_QUANTITY', 'Return quantities must be positive whole numbers.');
    const orderItem = orderItems.get(item.orderItemId);
    if (!orderItem) throw new HttpError(404, 'RETURN_ITEM_NOT_FOUND', 'The selected order item was not found.');
    const remaining = orderItem.quantity - (activeQuantities.get(item.orderItemId) ?? 0);
    if (item.quantity > remaining) throw new HttpError(409, 'RETURN_QUANTITY_EXCEEDED', 'The requested quantity exceeds the returnable quantity.');
    if (input.type === ReturnType.EXCHANGE && !item.replacementVariantId) throw new HttpError(400, 'EXCHANGE_VARIANT_REQUIRED', 'Select a replacement variant for exchanges.');
    const refundAmount = new Prisma.Decimal(orderItem.total).div(orderItem.quantity).mul(item.quantity);
    prepared.push({ data: item, orderItem, refundAmount });
  }

  const created = await prisma.$transaction(async (client) => {
    const request = await client.returnRequest.create({
      data: {
        returnNumber: returnNumber(), orderId: order.id, userId, type: input.type, reason: input.reason.trim().slice(0, 160), customerNote: input.customerNote?.trim().slice(0, 500) || null,
        history: { create: { toStatus: ReturnStatus.REQUESTED, actorId: userId, note: 'Return request submitted.' } },
        items: { create: prepared.map(({ data, orderItem, refundAmount }) => ({ orderItemId: orderItem.id, variantId: orderItem.variantId, quantity: data.quantity, reason: data.reason.trim().slice(0, 160), refundAmount })) },
      },
      include: returnInclude,
    });
    if (input.type === ReturnType.EXCHANGE) {
      const replacement = prepared[0].data.replacementVariantId;
      if (!replacement) throw new HttpError(400, 'EXCHANGE_VARIANT_REQUIRED', 'Select a replacement variant.');
      const variant = await client.productVariant.findUnique({ where: { id: replacement }, include: { inventory: true } });
      if (!variant || variant.status !== 'ACTIVE' || !variant.inventory || calculateAvailableQuantity(variant.inventory.quantityOnHand, variant.inventory.quantityReserved) < prepared[0].data.quantity) throw new HttpError(409, 'EXCHANGE_VARIANT_UNAVAILABLE', 'The replacement variant is unavailable.');
      await client.exchange.create({ data: { returnRequestId: request.id, originalOrderItemId: prepared[0].orderItem.id, originalVariantId: prepared[0].orderItem.variantId, replacementVariantId: replacement, quantity: prepared[0].data.quantity, status: ExchangeStatus.REQUESTED, priceDifference: 0 } });
    }
    return client.returnRequest.findUniqueOrThrow({ where: { id: request.id }, include: returnInclude });
  });
  return serializeReturn(created);
}

export async function customerReturns(userId: string, orderNumber?: string) {
  const returns = await prisma.returnRequest.findMany({ where: { userId, ...(orderNumber ? { order: { orderNumber } } : {}) }, orderBy: { createdAt: 'desc' }, include: returnInclude });
  return returns.map(serializeReturn);
}

export async function returnDetail(returnId: string) {
  const request = await getOwnedReturn(returnId);
  return serializeReturn(request);
}

export async function ownedReturnDetail(returnId: string, userId: string) {
  return serializeReturn(await getOwnedReturn(returnId, userId));
}

async function transitionReturn(returnId: string, toStatus: ReturnStatus, actorId: string, note?: string, rejectionReason?: string) {
  return prisma.$transaction(async (client) => {
    const request = await client.returnRequest.findUnique({ where: { id: returnId }, include: returnInclude });
    if (!request) throw new HttpError(404, 'RETURN_NOT_FOUND', 'Return request not found.');
    assertReturnTransition(request.status, toStatus);
    const updated = await client.returnRequest.update({ where: { id: returnId }, data: { status: toStatus, actorId, approvedAt: toStatus === ReturnStatus.APPROVED ? new Date() : undefined, rejectedAt: toStatus === ReturnStatus.REJECTED ? new Date() : undefined, rejectionReason: rejectionReason?.trim() || undefined, receivedAt: toStatus === ReturnStatus.RECEIVED ? new Date() : undefined, history: { create: { fromStatus: request.status, toStatus, actorId, note: note?.trim() || rejectionReason?.trim() || null } } }, include: returnInclude });
    return updated;
  });
}

export async function reviewReturn(returnId: string, actorId: string) { return serializeReturn(await transitionReturn(returnId, ReturnStatus.UNDER_REVIEW, actorId)); }
export async function approveReturn(returnId: string, actorId: string, note?: string) { return serializeReturn(await transitionReturn(returnId, ReturnStatus.APPROVED, actorId, note)); }
export async function rejectReturn(returnId: string, actorId: string, reason: string) { if (!reason.trim()) throw new HttpError(400, 'REJECTION_REASON_REQUIRED', 'A rejection reason is required.'); return serializeReturn(await transitionReturn(returnId, ReturnStatus.REJECTED, actorId, undefined, reason)); }
export async function receiveReturn(returnId: string, actorId: string, note?: string) { return serializeReturn(await transitionReturn(returnId, ReturnStatus.RECEIVED, actorId, note)); }

export async function inspectReturn(returnId: string, actorId: string, items: Array<{ returnItemId: string; condition: ReturnCondition; disposition: ReturnDisposition; note?: string }>) {
  const updated = await prisma.$transaction(async (client) => {
    const request = await client.returnRequest.findUnique({ where: { id: returnId }, include: returnInclude });
    if (!request) throw new HttpError(404, 'RETURN_NOT_FOUND', 'Return request not found.');
    assertReturnTransition(request.status, ReturnStatus.INSPECTING);
    const inputById = new Map(items.map((item) => [item.returnItemId, item]));
    if (request.items.some((item) => !inputById.has(item.id))) throw new HttpError(400, 'INSPECTION_REQUIRED', 'Inspect every returned item before resolution.');
    for (const item of request.items) {
      const decision = inputById.get(item.id)!;
      await client.returnItem.update({ where: { id: item.id }, data: { condition: decision.condition, disposition: decision.disposition, inspectionNote: decision.note?.trim().slice(0, 500) || null } });
      if (decision.disposition === ReturnDisposition.RESTOCK && !item.restockApplied) {
        if (!item.variantId) throw new HttpError(409, 'ITEM_NOT_RESTOCKABLE', 'This item has no inventory variant.');
        await client.inventory.update({ where: { variantId: item.variantId }, data: { quantityOnHand: { increment: item.quantity } } });
        await client.inventoryMovement.create({ data: { variantId: item.variantId, movementType: 'RETURN', quantity: item.quantity, reason: 'RETURN_RESTOCKED', referenceType: 'RETURN', referenceId: request.id, actorId } });
        await client.returnItem.update({ where: { id: item.id }, data: { restockApplied: true } });
      }
    }
    await client.returnRequest.update({ where: { id: returnId }, data: { status: ReturnStatus.APPROVED_FOR_RESOLUTION, actorId, history: { createMany: { data: [{ fromStatus: request.status, toStatus: ReturnStatus.INSPECTING, actorId, note: 'Return inspection started.' }, { fromStatus: ReturnStatus.INSPECTING, toStatus: ReturnStatus.APPROVED_FOR_RESOLUTION, actorId, note: 'Return inspection completed.' }] } } } });
    return client.returnRequest.findUniqueOrThrow({ where: { id: returnId }, include: returnInclude });
  });
  return serializeReturn(updated);
}

export async function requestRefund(returnId: string, actorId: string, idempotencyKey: string) {
  const result = await prisma.$transaction(async (client) => {
    const request = await client.returnRequest.findUnique({ where: { id: returnId }, include: { order: { include: { payments: true } }, items: true, refund: true } });
    if (!request) throw new HttpError(404, 'RETURN_NOT_FOUND', 'Return request not found.');
    if (request.status !== ReturnStatus.APPROVED_FOR_RESOLUTION || request.type !== ReturnType.REFUND) throw new HttpError(409, 'REFUND_NOT_ELIGIBLE', 'This return is not ready for a refund.');
    if (request.refund) return request.refund;
    const payment = request.order.payments.find((entry) => entry.status === 'PAID');
    if (!payment) throw new HttpError(409, 'REFUND_NOT_ELIGIBLE', 'No successful payment is available for refund.');
    const amount = request.items.reduce((sum, item) => sum.add(item.refundAmount), new Prisma.Decimal(0));
    const successfulRefunds = await client.refund.aggregate({ where: { paymentId: payment.id, status: RefundStatus.SUCCEEDED }, _sum: { amount: true } });
    const alreadyRefunded = successfulRefunds._sum.amount ?? new Prisma.Decimal(0);
    if (alreadyRefunded.add(amount).gt(payment.amount)) throw new HttpError(409, 'REFUND_AMOUNT_EXCEEDED', 'The requested refund exceeds the refundable balance.');
    return client.refund.create({ data: { refundNumber: refundNumber(), orderId: request.orderId, paymentId: payment.id, returnRequestId: request.id, amount, currency: payment.currency, reason: request.reason, idempotencyKey, createdBy: actorId, status: RefundStatus.PENDING } });
  });
  return { refundNumber: result.refundNumber, amount: Number(result.amount), currency: result.currency, status: result.status };
}

export async function completeManualRefund(refundId: string, actorId: string, providerReference: string) {
  const result = await prisma.$transaction(async (client) => {
    const refund = await client.refund.findUnique({ where: { id: refundId }, include: { payment: true, returnRequest: true } });
    if (!refund) throw new HttpError(404, 'REFUND_NOT_FOUND', 'Refund not found.');
    if (refund.status === RefundStatus.SUCCEEDED) return refund;
    if (![RefundStatus.REQUESTED, RefundStatus.PENDING, RefundStatus.PROCESSING].includes(refund.status)) throw new HttpError(409, 'REFUND_NOT_PROCESSABLE', 'This refund cannot be processed.');
    const successfulTotal = await client.refund.aggregate({ where: { paymentId: refund.paymentId, status: RefundStatus.SUCCEEDED }, _sum: { amount: true } });
    const total = (successfulTotal._sum.amount ?? new Prisma.Decimal(0)).add(refund.amount);
    if (total.gt(refund.payment.amount)) throw new HttpError(409, 'REFUND_AMOUNT_EXCEEDED', 'Refund exceeds the paid amount.');
    const paymentStatus = total.eq(refund.payment.amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await client.refundTransaction.create({ data: { refundId: refund.id, provider: refund.provider, providerReference: providerReference.trim(), amount: refund.amount, currency: refund.currency, status: RefundStatus.SUCCEEDED } });
    await client.payment.update({ where: { id: refund.paymentId }, data: { status: paymentStatus } });
    if (refund.returnRequestId) await client.returnRequest.update({ where: { id: refund.returnRequestId }, data: { status: ReturnStatus.RESOLVED, completedAt: new Date(), actorId } });
    return client.refund.update({ where: { id: refund.id }, data: { status: RefundStatus.SUCCEEDED, providerReference: providerReference.trim(), processedAt: new Date(), createdBy: actorId } });
  });
  return { refundNumber: result.refundNumber, amount: Number(result.amount), currency: result.currency, status: result.status, providerReference: result.providerReference };
}

export async function returnQueue(status?: ReturnStatus) {
  const requests = await prisma.returnRequest.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: 'asc' }, include: returnInclude });
  return requests.map(serializeReturn);
}
