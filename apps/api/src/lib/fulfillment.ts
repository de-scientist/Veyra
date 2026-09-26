import crypto from 'node:crypto';

import { DeliveryStatus, FulfillmentStatus, OrderStatus, Prisma } from '@prisma/client';

import { hashToken } from './auth.js';
import { HttpError } from './errors.js';
import { afterCommitNotify, buildEvent, enqueueEvent } from './notifications/events.js';
import { prisma } from './prisma.js';

const deliveryInclude = {
  order: {
    include: {
      items: true,
      payments: { orderBy: { createdAt: 'desc' as const } },
    },
  },
  shippingMethod: true,
  shippingZone: true,
  assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
  history: { orderBy: { createdAt: 'asc' as const } },
};

type DeliveryWithContext = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

type Actor = { id: string };

const transitions: Record<string, DeliveryStatus[]> = {
  PENDING: [DeliveryStatus.PREPARING],
  PREPARING: [DeliveryStatus.PICKED],
  PICKED: [DeliveryStatus.PACKED],
  PACKED: [DeliveryStatus.READY_FOR_PICKUP, DeliveryStatus.ASSIGNED, DeliveryStatus.IN_TRANSIT],
  ASSIGNED: [DeliveryStatus.IN_TRANSIT],
  IN_TRANSIT: [DeliveryStatus.OUT_FOR_DELIVERY],
  OUT_FOR_DELIVERY: [DeliveryStatus.DELIVERY_ATTEMPTED, DeliveryStatus.DELIVERED],
  DELIVERY_ATTEMPTED: [DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.FAILED, DeliveryStatus.DELIVERED],
  READY_FOR_PICKUP: [DeliveryStatus.PICKED_UP],
};
const transitStatuses: DeliveryStatus[] = [DeliveryStatus.IN_TRANSIT, DeliveryStatus.OUT_FOR_DELIVERY];
const terminalStatuses: DeliveryStatus[] = [DeliveryStatus.DELIVERED, DeliveryStatus.PICKED_UP];
const deliveryStatuses: DeliveryStatus[] = [DeliveryStatus.ASSIGNED, ...transitStatuses];

function trackingNumber() {
  return `VYR-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function assertPaid(delivery: DeliveryWithContext) {
  if (delivery.order.paymentStatus !== 'PAID') throw new HttpError(409, 'ORDER_NOT_PAID', 'Only paid orders can enter fulfillment.');
  if (delivery.order.status === 'CANCELLED') throw new HttpError(409, 'ORDER_CANCELLED', 'Cancelled orders cannot be fulfilled.');
}

export type FulfillmentEligibility = {
  eligible: boolean;
  reasons: string[];
  orderNumber: string;
  deliveryStatus: DeliveryStatus;
};

/**
 * Authoritative fulfillment-eligibility check (Phase D §14). Single source of
 * truth: enforced when fulfillment begins (PENDING → PREPARING) and exposed
 * read-only for staff UIs so admin buttons never duplicate this logic.
 */
export function checkEligibility(delivery: DeliveryWithContext, reservations: Array<{ status: string }>): FulfillmentEligibility {
  const reasons: string[] = [];
  if (delivery.order.status === 'CANCELLED') reasons.push('Order is cancelled.');
  if (delivery.order.paymentStatus !== 'PAID') reasons.push('Payment is not confirmed (PAID required).');
  if (delivery.order.items.length === 0) reasons.push('Order has no items.');
  if (!delivery.shippingMethod) reasons.push('No delivery method is configured for this order.');
  if (delivery.shippingMethod && delivery.shippingMethod.type !== 'PICKUP') {
    if (!delivery.deliveryAddress) reasons.push('Delivery address is missing.');
    if (!delivery.recipientPhone) reasons.push('Recipient phone is missing.');
  }
  if (reservations.length === 0) {
    reasons.push('No inventory reservations exist for this order.');
  } else if (reservations.some((reservation) => reservation.status !== 'CONVERTED')) {
    reasons.push('Inventory reservations are not converted (payment conversion incomplete).');
  }
  return { eligible: reasons.length === 0, reasons, orderNumber: delivery.order.orderNumber, deliveryStatus: delivery.status };
}

async function assertEligibleToStart(
  delivery: DeliveryWithContext,
  client: typeof prisma | Prisma.TransactionClient,
) {
  const reservations = await client.inventoryReservation.findMany({ where: { orderId: delivery.orderId }, select: { status: true } });
  const eligibility = checkEligibility(delivery, reservations);
  if (!eligibility.eligible) {
    throw new HttpError(409, 'FULFILLMENT_INELIGIBLE', 'This order is not eligible for fulfillment.', { reasons: eligibility.reasons });
  }
}

function auditDelivery(
  client: Prisma.TransactionClient,
  actor: Actor,
  deliveryId: string,
  orderNumber: string,
  before: DeliveryStatus,
  after: DeliveryStatus,
  note?: string,
) {
  return client.auditLog.create({
    data: {
      actorId: actor.id,
      action: 'ORDER_UPDATED',
      entity: 'Delivery',
      entityId: deliveryId,
      before: { status: before } as Prisma.InputJsonValue,
      after: { status: after, orderNumber, note: note?.trim() || null } as Prisma.InputJsonValue,
    },
  });
}

function assertTransition(from: DeliveryStatus, to: DeliveryStatus) {
  if (!isLegalDeliveryTransition(from, to)) throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', `Delivery cannot move from ${from} to ${to}.`);
}

export function isLegalDeliveryTransition(from: DeliveryStatus, to: DeliveryStatus) {
  return transitions[from]?.includes(to) ?? false;
}

function serializeDelivery(delivery: DeliveryWithContext) {
  return {
    id: delivery.id,
    orderNumber: delivery.order.orderNumber,
    status: delivery.status,
    trackingNumber: delivery.trackingNumber,
    internalReference: delivery.internalReference,
    provider: delivery.courierProvider,
    providerShipmentId: delivery.providerShipmentId,
    method: delivery.shippingMethod ? { id: delivery.shippingMethod.id, name: delivery.shippingMethod.name, type: delivery.shippingMethod.type } : null,
    zone: delivery.shippingZone ? { code: delivery.shippingZone.code, name: delivery.shippingZone.name } : null,
    recipient: { name: delivery.recipientName, phone: delivery.recipientPhone },
    estimatedDeliveryAt: delivery.estimatedDeliveryAt,
    shippedAt: delivery.shippedAt,
    pickedUpAt: delivery.pickedUpAt,
    deliveredAt: delivery.deliveredAt,
    assignee: delivery.assignee,
    history: delivery.history.map((entry) => ({ fromStatus: entry.fromStatus, toStatus: entry.toStatus, note: entry.note, createdAt: entry.createdAt })),
  };
}

async function loadDelivery(deliveryId: string, client: typeof prisma | Prisma.TransactionClient = prisma) {
  return client.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
}

async function moveDelivery(deliveryId: string, toStatus: DeliveryStatus, actor: Actor, note?: string) {
  return prisma.$transaction(async (client) => {
    const delivery = await loadDelivery(deliveryId, client);
    if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
    assertPaid(delivery);
    assertTransition(delivery.status, toStatus);
    // Fulfillment beginning (leaving PENDING) additionally requires full
    // eligibility: items, delivery info, and converted inventory reservations.
    if (delivery.status === DeliveryStatus.PENDING) await assertEligibleToStart(delivery, client);

    const methodType = delivery.shippingMethod?.type;
    if (toStatus === DeliveryStatus.READY_FOR_PICKUP && methodType !== 'PICKUP') throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', 'Only pickup orders can be marked ready for pickup.');
    if (toStatus === DeliveryStatus.PICKED_UP && methodType !== 'PICKUP') throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', 'Only pickup orders can be picked up.');
    if (deliveryStatuses.includes(toStatus) && methodType === 'PICKUP') throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', 'Pickup orders do not enter delivery transit.');
    if (toStatus === DeliveryStatus.IN_TRANSIT && methodType === 'LOCAL_DELIVERY' && delivery.status !== DeliveryStatus.ASSIGNED) throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', 'Local deliveries must be assigned before shipping.');

    const now = new Date();
    const orderFulfillment = toStatus === DeliveryStatus.PICKED || toStatus === DeliveryStatus.PACKED
      ? toStatus === DeliveryStatus.PICKED ? FulfillmentStatus.PROCESSING : FulfillmentStatus.PACKED
      : transitStatuses.includes(toStatus) ? FulfillmentStatus.SHIPPED
        : terminalStatuses.includes(toStatus) ? FulfillmentStatus.DELIVERED : undefined;
    const orderStatus = terminalStatuses.includes(toStatus) ? OrderStatus.COMPLETED : toStatus === DeliveryStatus.PREPARING ? OrderStatus.PROCESSING : undefined;
    // Atomic claim on the expected from-status: a concurrent worker (double
    // click, two staff members) that already moved this delivery loses here
    // with a controlled 409 instead of writing a duplicate transition,
    // history entry, and notification.
    const claimed = await client.delivery.updateMany({
      where: { id: deliveryId, status: delivery.status },
      data: {
        status: toStatus,
        trackingNumber: transitStatuses.includes(toStatus) ? delivery.trackingNumber ?? trackingNumber() : undefined,
        shippedAt: transitStatuses.includes(toStatus) ? delivery.shippedAt ?? now : undefined,
        pickedUpAt: toStatus === DeliveryStatus.PICKED_UP ? now : undefined,
        deliveredAt: toStatus === DeliveryStatus.DELIVERED || toStatus === DeliveryStatus.PICKED_UP ? now : undefined,
      },
    });
    if (claimed.count !== 1) throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', `Delivery is no longer ${delivery.status} and cannot move to ${toStatus}.`);
    const updated = await client.delivery.update({
      where: { id: deliveryId },
      data: { history: { create: { fromStatus: delivery.status, toStatus, actorId: actor.id, note: note?.trim() || null } } },
      include: deliveryInclude,
    });
    await auditDelivery(client, actor, deliveryId, delivery.order.orderNumber, delivery.status, toStatus, note);

    if (orderFulfillment || orderStatus) {
      await client.order.update({ where: { id: delivery.orderId }, data: { fulfillmentStatus: orderFulfillment, status: orderStatus } });
      await client.orderStatusHistory.create({ data: { orderId: delivery.orderId, status: orderStatus ?? delivery.order.status, changedBy: actor.id, note: note?.trim() ?? `Delivery moved to ${toStatus}.` } });
    }
    const customerEvent = deliveryEventFor(toStatus);
    if (customerEvent) {
      await enqueueEvent(client, buildEvent(customerEvent, 'Delivery', deliveryId, {
        orderId: delivery.orderId,
        orderNumber: delivery.order.orderNumber,
        trackingNumber: updated.trackingNumber ?? '',
        deliveryStatus: toStatus,
      }, delivery.order.userId));
    }
    return updated;
  });
  afterCommitNotify();
}

const DELIVERY_STATUS_EVENTS = {
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
} as const;

function deliveryEventFor(toStatus: DeliveryStatus) {
  // PICKED is an internal step covered by the ORDER_PROCESSING notification.
  if (toStatus === DeliveryStatus.PICKED) return null;
  return (DELIVERY_STATUS_EVENTS as Record<string, 'ORDER_PROCESSING' | 'ORDER_PACKED' | 'ORDER_READY_FOR_PICKUP' | 'ORDER_SHIPPED' | 'ORDER_OUT_FOR_DELIVERY' | 'DELIVERY_FAILED' | 'ORDER_DELIVERED'>)[toStatus] ?? null;
}

export async function fulfillmentQueue(status?: DeliveryStatus) {
  const deliveries = await prisma.delivery.findMany({
    where: { status, order: { paymentStatus: 'PAID', status: { not: 'CANCELLED' } } },
    orderBy: { createdAt: 'asc' },
    include: deliveryInclude,
  });
  return deliveries.map(serializeDelivery);
}

export async function operationsUsers() {
  const users = await prisma.user.findMany({
    where: {
      status: 'ACTIVE',
      roles: { some: { role: { slug: { in: ['staff', 'admin', 'super_admin', 'super-admin'] } } } },
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return users;
}

export async function fulfillmentDetail(orderNumber: string) {
  const delivery = await prisma.delivery.findFirst({ where: { order: { orderNumber } }, include: deliveryInclude });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  return serializeDelivery(delivery);
}

export async function fulfillmentEligibility(orderNumber: string): Promise<FulfillmentEligibility> {
  const delivery = await prisma.delivery.findFirst({ where: { order: { orderNumber } }, include: deliveryInclude });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  const reservations = await prisma.inventoryReservation.findMany({ where: { orderId: delivery.orderId }, select: { status: true } });
  return checkEligibility(delivery, reservations);
}

export async function startFulfillment(orderNumber: string, actor: Actor, note?: string) {
  const delivery = await prisma.delivery.findFirst({ where: { order: { orderNumber } }, select: { id: true } });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  return serializeDelivery(await moveDelivery(delivery.id, DeliveryStatus.PREPARING, actor, note));
}

export async function pickFulfillment(orderNumber: string, actor: Actor, note?: string) {
  const delivery = await prisma.delivery.findFirst({ where: { order: { orderNumber } }, select: { id: true } });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  return serializeDelivery(await moveDelivery(delivery.id, DeliveryStatus.PICKED, actor, note));
}

export async function packFulfillment(orderNumber: string, actor: Actor, note?: string) {
  const delivery = await prisma.delivery.findFirst({ where: { order: { orderNumber } }, select: { id: true } });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  return serializeDelivery(await moveDelivery(delivery.id, DeliveryStatus.PACKED, actor, note));
}

export async function transitionDelivery(deliveryId: string, toStatus: DeliveryStatus, actor: Actor, note?: string) {
  return serializeDelivery(await moveDelivery(deliveryId, toStatus, actor, note));
}

export async function assignDelivery(deliveryId: string, assigneeId: string, actor: Actor) {
  const assignee = await prisma.user.findUnique({ where: { id: assigneeId }, include: { roles: { include: { role: true } } } });
  if (!assignee || !assignee.roles.some((entry) => ['staff', 'admin', 'super_admin', 'super-admin'].includes(entry.role.slug.toLowerCase()))) throw new HttpError(400, 'INVALID_ASSIGNEE', 'Delivery must be assigned to an operations user.');
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  assertPaid(delivery);
  if (delivery.status !== DeliveryStatus.PACKED) throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', 'Only packed deliveries can be assigned.');
  const updated = await prisma.$transaction(async (client) => {
    const claimed = await client.delivery.updateMany({ where: { id: deliveryId, status: DeliveryStatus.PACKED }, data: { assignedTo: assigneeId, status: DeliveryStatus.ASSIGNED } });
    if (claimed.count !== 1) throw new HttpError(409, 'INVALID_DELIVERY_TRANSITION', 'Delivery is no longer packed and cannot be assigned.');
    const result = await client.delivery.update({ where: { id: deliveryId }, data: { history: { create: { fromStatus: delivery.status, toStatus: DeliveryStatus.ASSIGNED, actorId: actor.id, note: 'Delivery assigned.' } } }, include: deliveryInclude });
    await auditDelivery(client, actor, deliveryId, delivery.order.orderNumber, delivery.status, DeliveryStatus.ASSIGNED, 'Delivery assigned.');
    await enqueueEvent(client, buildEvent('ORDER_SHIPPED', 'Delivery', deliveryId, {
      orderId: delivery.orderId,
      orderNumber: delivery.order.orderNumber,
      trackingNumber: result.trackingNumber ?? '',
      deliveryStatus: DeliveryStatus.ASSIGNED,
    }, delivery.order.userId));
    return result;
  });
  afterCommitNotify();
  return serializeDelivery(updated);
}

export async function customerDelivery(orderNumber: string, userId?: string, confirmationToken?: string) {
  const delivery = await prisma.delivery.findFirst({ where: { order: { orderNumber } }, include: deliveryInclude });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  const authorized = userId ? delivery.order.userId === userId : confirmationToken ? delivery.order.confirmationTokenHash === hashToken(confirmationToken) : false;
  if (!authorized) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  const safe = serializeDelivery(delivery);
  return {
    ...safe,
    // Internal operational identifiers never leave the admin boundary.
    internalReference: undefined,
    providerShipmentId: undefined,
    recipient: undefined,
    address: undefined,
    assignee: undefined,
    history: safe.history.map((event) => ({ ...event, note: null })),
  };
}

export type DeliveryDetailsInput = { courierProvider?: string; estimatedDeliveryAt?: string | null };

/**
 * Staff-managed delivery details (courier name, ETA). Never changes delivery
 * or order state and never touches financial fields — a history entry records
 * the change with its actor.
 */
export async function updateDeliveryDetails(deliveryId: string, input: DeliveryDetailsInput, actor: Actor) {
  const courierProvider = input.courierProvider?.trim() || null;
  if (courierProvider && courierProvider.length > 120) throw new HttpError(400, 'INVALID_DELIVERY_DETAILS', 'Courier name must be 120 characters or fewer.');
  let estimatedDeliveryAt: Date | null | undefined;
  if (input.estimatedDeliveryAt !== undefined) {
    if (input.estimatedDeliveryAt === null || input.estimatedDeliveryAt === '') {
      estimatedDeliveryAt = null;
    } else {
      const parsed = new Date(input.estimatedDeliveryAt);
      if (Number.isNaN(parsed.getTime())) throw new HttpError(400, 'INVALID_DELIVERY_DETAILS', 'Estimated delivery must be a valid datetime.');
      estimatedDeliveryAt = parsed;
    }
  }
  const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
  if (!delivery) throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery not found.');
  assertPaid(delivery);
  if (courierProvider === null && estimatedDeliveryAt === undefined) {
    throw new HttpError(400, 'INVALID_DELIVERY_DETAILS', 'Provide a courier name or an estimated delivery date.');
  }
  const updated = await prisma.$transaction(async (client) => {
    const detailNote = `Delivery details updated${courierProvider ? ` (courier: ${courierProvider})` : ''}${estimatedDeliveryAt !== undefined ? ` (ETA: ${estimatedDeliveryAt?.toISOString() ?? 'cleared'})` : ''}.`;
    const result = await client.delivery.update({
      where: { id: deliveryId },
      data: {
        ...(courierProvider !== null ? { courierProvider } : {}),
        ...(estimatedDeliveryAt !== undefined ? { estimatedDeliveryAt } : {}),
        history: {
          create: {
            fromStatus: delivery.status,
            toStatus: delivery.status,
            actorId: actor.id,
            note: detailNote,
          },
        },
      },
      include: deliveryInclude,
    });
    await client.auditLog.create({
      data: {
        actorId: actor.id,
        action: 'ORDER_UPDATED',
        entity: 'Delivery',
        entityId: deliveryId,
        before: { courierProvider: delivery.courierProvider, estimatedDeliveryAt: delivery.estimatedDeliveryAt } as Prisma.InputJsonValue,
        after: { courierProvider: result.courierProvider, estimatedDeliveryAt: result.estimatedDeliveryAt, orderNumber: delivery.order.orderNumber, note: detailNote } as Prisma.InputJsonValue,
      },
    });
    return result;
  });
  afterCommitNotify();
  return serializeDelivery(updated);
}
