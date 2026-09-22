import { Prisma } from '@prisma/client';

import { logger } from './logger.js';
import { prisma } from './prisma.js';

/**
 * Stale reservation release (checkout hardening).
 *
 * Orders hold ACTIVE reservations from placement until an M-Pesa callback
 * converts them. Unpaid orders must not pin stock forever: reservations
 * whose order is still PENDING + UNPAID after STALE_RESERVATION_MINUTES are
 * released (reserved stock decremented, movement recorded).
 *
 * Deliberately conservative: orders with any non-UNPAID payment status
 * (PENDING attempts in flight, PAID, FAILED-retryable) are never touched,
 * and only the listed variants (checkout touch-scope) or an explicit admin
 * sweep trigger a release. There is no background worker by design.
 */

export const STALE_RESERVATION_MINUTES = 60;

type DbClient = typeof prisma | Prisma.TransactionClient;

function staleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_RESERVATION_MINUTES * 60 * 1000);
}

/**
 * Release stale ACTIVE reservations, optionally scoped to variants.
 * Returns the number of reservations released. Safe to re-run
 * (idempotent: only ACTIVE rows qualify, each released exactly once).
 */
export async function releaseStaleReservations(
  client: DbClient = prisma,
  options?: { variantIds?: string[]; now?: Date },
): Promise<number> {
  const stale = await client.inventoryReservation.findMany({
    where: {
      status: 'ACTIVE',
      createdAt: { lt: staleBefore(options?.now) },
      ...(options?.variantIds ? { variantId: { in: options.variantIds } } : {}),
      order: { status: 'PENDING', paymentStatus: 'UNPAID' },
    },
    select: { id: true, variantId: true, quantity: true, orderId: true },
  });

  let released = 0;
  for (const reservation of stale) {
    try {
      await client.$transaction(async (transaction) => {
        const updated = await transaction.inventory.updateMany({
          where: { variantId: reservation.variantId, quantityReserved: { gte: reservation.quantity } },
          data: { quantityReserved: { decrement: reservation.quantity } },
        });
        if (updated.count !== 1) return;
        await transaction.inventoryReservation.update({
          where: { id: reservation.id, status: 'ACTIVE' },
          data: { status: 'RELEASED', releasedAt: new Date() },
        });
        await transaction.inventoryMovement.create({
          data: {
            variantId: reservation.variantId,
            movementType: 'RELEASED',
            quantity: reservation.quantity,
            reason: 'STALE_RESERVATION_RELEASED',
            referenceType: 'ORDER',
            referenceId: reservation.orderId,
          },
        });
        released += 1;
      });
    } catch (error) {
      // One contested row must not abort the sweep; it stays ACTIVE and is
      // retried on the next pass. Never silent: logged with its identity.
      logger.warn({ err: error, reservationId: reservation.id, orderId: reservation.orderId }, 'reservations.release_skipped');
    }
  }

  if (released > 0) {
    logger.info({ released }, 'reservations.stale_released');
  }
  return released;
}
