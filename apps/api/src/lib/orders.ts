import { Prisma } from '@prisma/client';

import { validateAuditReason } from './admin.js';
import { HttpError } from './errors.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

/**
 * Order cancellation with idempotent inventory release (Phase 4).
 *
 * Lifecycle position: cancellation only unwinds the *reservation* stage.
 * Checkout holds ACTIVE reservations (onHand untouched); cancelling an
 * unpaid order releases them (reserved decremented, RELEASED movement with
 * ORDER reference). Paid orders already converted reservations into
 * deductions — cancelling those requires the returns/refund flow, which
 * couples financial reversal with conditional restock, so this service
 * refuses PAID orders with an actionable code instead of inventing money.
 *
 * Idempotency: re-cancelling a CANCELLED order is a no-op success (no
 * second release, no duplicate movement). Concurrent cancels collapse via
 * an updateMany claim on non-CANCELLED status.
 */

export type CancelOrderResult = {
  orderNumber: string;
  status: string;
  releasedReservations: number;
  alreadyCancelled: boolean;
};

const FULFILLED_STATUSES = new Set(['SHIPPED', 'DELIVERED', 'RETURNED']);

export async function cancelOrder(orderNumber: string, actorId: string, reason: string): Promise<CancelOrderResult> {
  const trimmedReason = validateAuditReason(reason, 'cancellation reason');
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { reservations: { select: { id: true, status: true } } },
  });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (order.status === 'CANCELLED') {
    return { orderNumber: order.orderNumber, status: order.status, releasedReservations: 0, alreadyCancelled: true };
  }
  if (order.paymentStatus === 'PAID') {
    throw new HttpError(
      409,
      'ORDER_PAID_USE_RETURNS',
      'This order is paid and cannot be cancelled directly. Use the returns and refund flow so stock restoration stays coupled to financial reversal.',
    );
  }
  if (FULFILLED_STATUSES.has(order.fulfillmentStatus)) {
    throw new HttpError(
      409,
      'ORDER_FULFILLED',
      `This order is already ${order.fulfillmentStatus.toLowerCase()} and cannot be cancelled. Use the returns flow for post-fulfillment reversals.`,
    );
  }

  const released = await prisma.$transaction(async (client) => {
    // Claim: exactly one concurrent canceller wins; losers re-read below.
    const claimed = await client.order.updateMany({
      where: { id: order.id, status: { not: 'CANCELLED' } },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });
    if (claimed.count !== 1) {
      const current = await client.order.findUniqueOrThrow({ where: { id: order.id } });
      if (current.status === 'CANCELLED') return 0;
      throw new HttpError(409, 'ORDER_CANCEL_CONFLICT', 'The order changed while cancelling. Please review and try again.');
    }
    await client.orderStatusHistory.create({
      data: { orderId: order.id, status: 'CANCELLED', changedBy: actorId, note: trimmedReason.slice(0, 300) },
    });

    // Release every ACTIVE reservation exactly once. Non-ACTIVE rows
    // (already released/expired) are skipped — never double-released.
    const active = await client.inventoryReservation.findMany({
      where: { orderId: order.id, status: 'ACTIVE' },
      orderBy: { variantId: 'asc' },
    });
    let releasedCount = 0;
    for (const reservation of active) {
      const updated = await client.inventory.updateMany({
        where: { variantId: reservation.variantId, quantityReserved: { gte: reservation.quantity } },
        data: { quantityReserved: { decrement: reservation.quantity } },
      });
      if (updated.count !== 1) {
        // Roll back the whole cancellation rather than leave the order
        // cancelled with pinned reservations — staff reconcile manually.
        logger.error({ orderId: order.id, reservationId: reservation.id }, 'orders.cancel_inventory_mismatch');
        throw new HttpError(
          409,
          'ORDER_INVENTORY_SYNC_FAILED',
          'Order cancellation requires inventory reconciliation: a reservation could not be released. No changes were applied.',
        );
      }
      await client.inventoryReservation.update({
        where: { id: reservation.id },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
      await client.inventoryMovement.create({
        data: {
          variantId: reservation.variantId,
          movementType: 'RELEASED',
          quantity: reservation.quantity,
          reason: 'ORDER_CANCELLED',
          referenceType: 'ORDER',
          referenceId: order.id,
          actorId,
        },
      });
      releasedCount += 1;
    }

    await client.auditLog.create({
      data: {
        actorId,
        action: 'ORDER_CANCELLED',
        entity: 'Order',
        entityId: order.id,
        before: { status: order.status } as Prisma.InputJsonValue,
        after: { status: 'CANCELLED', releasedReservations: releasedCount, reason: trimmedReason } as Prisma.InputJsonValue,
      },
    });
    return releasedCount;
  });

  return { orderNumber: order.orderNumber, status: 'CANCELLED', releasedReservations: released, alreadyCancelled: false };
}
