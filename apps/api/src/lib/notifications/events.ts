import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { triggerNotificationProcessing } from './worker.js';

export const NOTIFICATION_EVENT_VERSION = 1;

export const NOTIFICATION_EVENT_TYPES = [
  'ORDER_PLACED',
  'PAYMENT_CONFIRMED',
  'PAYMENT_FAILED',
  'ORDER_PROCESSING',
  'ORDER_PACKED',
  'ORDER_SHIPPED',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'DELIVERY_FAILED',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_RECEIVED',
  'RETURN_RESOLVED',
  'EXCHANGE_REQUESTED',
  'EXCHANGE_APPROVED',
  'REFUND_REQUESTED',
  'REFUND_SUCCEEDED',
  'REFUND_FAILED',
  'PASSWORD_CHANGED',
  'ACCOUNT_DEACTIVATED',
  'LOW_STOCK_DETECTED',
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type DomainEvent = {
  eventId: string;
  eventType: NotificationEventType;
  eventVersion: number;
  aggregateType: string;
  aggregateId: string;
  userId?: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
};

type DbClient = typeof prisma | Prisma.TransactionClient;

export function buildEventId(): string {
  return `EVT-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

export function buildEvent(
  eventType: NotificationEventType,
  aggregateType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  userId?: string | null,
): DomainEvent {
  return {
    eventId: buildEventId(),
    eventType,
    eventVersion: NOTIFICATION_EVENT_VERSION,
    aggregateType,
    aggregateId,
    userId: userId ?? null,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

/**
 * Persist a domain event to the transactional outbox. Safe to call inside an
 * existing business transaction: the event is only visible to the worker after
 * commit. Duplicate eventIds are idempotent (first write wins).
 */
export async function enqueueEvent(client: DbClient, event: DomainEvent) {
  try {
    return await client.notificationOutbox.create({
      data: {
        eventId: event.eventId,
        eventType: event.eventType,
        eventVersion: event.eventVersion,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        userId: event.userId ?? null,
        payload: event.payload as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return client.notificationOutbox.findUniqueOrThrow({ where: { eventId: event.eventId } });
    }
    throw error;
  }
}

/**
 * Publish an event outside a business transaction. The outbox write and the
 * worker trigger are both failure-isolated: publishing never throws for
 * notification infrastructure reasons.
 */
export async function publishEvent(event: DomainEvent): Promise<void> {
  try {
    await enqueueEvent(prisma, event);
  } catch {
    return;
  }
  triggerNotificationProcessing();
}

/**
 * Fire-and-forget worker trigger for use after a business transaction commits.
 * Never throws; a failed trigger only delays processing until the next trigger
 * or the admin recovery endpoint.
 */
export function afterCommitNotify(): void {
  triggerNotificationProcessing();
}
