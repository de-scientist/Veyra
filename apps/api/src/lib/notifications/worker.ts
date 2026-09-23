import { AuditAction, Prisma } from '@prisma/client';

import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { processEvent } from './orchestrator.js';
import { computeBackoffMs, maxAttempts } from './retry.js';
import type { DomainEvent } from './events.js';

let drainScheduled = false;
let draining = false;

/**
 * Best-effort trigger: schedules an outbox drain without blocking the caller.
 * Safe to call from request paths; never throws.
 */
export function triggerNotificationProcessing(): void {
  if (draining) return;
  if (drainScheduled) return;
  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;
    void drainOutbox().catch((error) => logger.error({ err: error }, 'Notification outbox drain failed'));
  });
}

function toDomainEvent(row: { eventId: string; eventType: string; eventVersion: number; aggregateType: string; aggregateId: string; userId: string | null; payload: unknown }): DomainEvent {
  return {
    eventId: row.eventId,
    eventType: row.eventType as DomainEvent['eventType'],
    eventVersion: row.eventVersion,
    aggregateType: row.aggregateType,
    aggregateId: row.aggregateId,
    userId: row.userId,
    occurredAt: new Date().toISOString(),
    payload: (row.payload ?? {}) as Record<string, unknown>,
  };
}

/** Claim up to `batchSize` due events and process them. At-least-once + idempotent side effects. */
export async function drainOutbox(batchSize?: number) {
  if (draining) return { processed: 0, failed: 0 };
  draining = true;
  try {
    const limit = batchSize ?? (Number(process.env.NOTIFICATION_BATCH_SIZE) || 25);
    const now = new Date();
    const due = await prisma.notificationOutbox.findMany({
      where: { status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: now } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    let processed = 0;
    let failed = 0;
    for (const row of due) {
      const claimed = await prisma.notificationOutbox.updateMany({ where: { id: row.id, status: row.status }, data: { status: 'PROCESSING', attemptCount: { increment: 1 } } });
      if (claimed.count !== 1) continue;
      try {
        await processEvent(toDomainEvent(row));
        await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: 'PROCESSED', processedAt: new Date(), lastError: null } });
        processed += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown worker error';
        const attempts = row.attemptCount + 1;
        if (attempts >= maxAttempts()) {
          await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: 'DEAD_LETTER', lastError: message } });
          await prisma.auditLog.create({ data: { actorId: null, action: AuditAction.NOTIFICATION_FAILED, entity: 'NotificationOutbox', entityId: row.eventId, after: { eventType: row.eventType } as Prisma.InputJsonValue } });
          logger.error({ eventId: row.eventId, eventType: row.eventType, err: error }, 'Notification event dead-lettered');
        } else {
          await prisma.notificationOutbox.update({ where: { id: row.id }, data: { status: 'FAILED', availableAt: new Date(Date.now() + computeBackoffMs(attempts)), lastError: message } });
        }
      }
    }
    return { processed, failed };
  } finally {
    draining = false;
  }
}
