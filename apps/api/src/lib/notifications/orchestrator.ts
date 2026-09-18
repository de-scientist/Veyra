import { NotificationChannel, NotificationPriority, NotificationType, Prisma } from '@prisma/client';

import { env } from '../env.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { emailProvider, isSmsChannelAvailable, smsProvider } from './channels.js';
import type { DomainEvent, NotificationEventType } from './events.js';
import { categoryForEvent, defaultChannelsFor, isChannelEnabled, type LegacyEmailFlags } from './preferences.js';
import { classifyFailure, computeBackoffMs, maxAttempts, shouldRetry } from './retry.js';
import { missingVariables, renderHtml, renderText, resolveTemplate, type TemplateVariables } from './templates.js';

const EVENT_PRIORITY: Partial<Record<NotificationEventType, NotificationPriority>> = {
  PASSWORD_CHANGED: 'HIGH',
  ACCOUNT_DEACTIVATED: 'HIGH',
  PAYMENT_CONFIRMED: 'HIGH',
  PAYMENT_FAILED: 'HIGH',
  REFUND_SUCCEEDED: 'HIGH',
  REFUND_FAILED: 'HIGH',
  DELIVERY_FAILED: 'HIGH',
  ORDER_DELIVERED: 'NORMAL',
};

const EVENT_NOTIFICATION_TYPE: Record<NotificationEventType, NotificationType> = {
  ORDER_PLACED: 'ORDER',
  PAYMENT_CONFIRMED: 'PAYMENT',
  PAYMENT_FAILED: 'PAYMENT',
  ORDER_PROCESSING: 'ORDER',
  ORDER_PACKED: 'ORDER',
  ORDER_SHIPPED: 'SHIPPING',
  ORDER_OUT_FOR_DELIVERY: 'SHIPPING',
  ORDER_DELIVERED: 'SHIPPING',
  DELIVERY_FAILED: 'SHIPPING',
  RETURN_REQUESTED: 'ORDER',
  RETURN_APPROVED: 'ORDER',
  RETURN_REJECTED: 'ORDER',
  RETURN_RECEIVED: 'ORDER',
  RETURN_RESOLVED: 'ORDER',
  EXCHANGE_REQUESTED: 'ORDER',
  EXCHANGE_APPROVED: 'ORDER',
  REFUND_REQUESTED: 'PAYMENT',
  REFUND_SUCCEEDED: 'PAYMENT',
  REFUND_FAILED: 'PAYMENT',
  PASSWORD_CHANGED: 'ACCOUNT',
  ACCOUNT_DEACTIVATED: 'ACCOUNT',
  LOW_STOCK_DETECTED: 'SYSTEM',
};

export type Recipient = {
  userId: string;
  firstName: string;
  email: string | null;
  phone: string | null;
};

export async function loadRecipient(userId: string): Promise<Recipient | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, firstName: true, email: true, phone: true, status: true } });
  if (!user || user.status === 'DELETED') return null;
  return { userId: user.id, firstName: user.firstName, email: user.email, phone: user.phone };
}

function deepLinks(event: DomainEvent): Record<string, string> {
  const base = env.APP_URL.replace(/\/$/, '');
  const payload = event.payload as Record<string, string | undefined>;
  const links: Record<string, string> = { accountUrl: `${base}/account` };
  if (payload.orderNumber) {
    links.orderUrl = `${base}/account/orders/${payload.orderNumber}`;
    links.trackingUrl = `${base}/account/orders/${payload.orderNumber}/tracking`;
  }
  if (payload.returnNumber) links.returnUrl = `${base}/account/returns/${payload.returnId ?? ''}`;
  if (payload.orderNumber) links.refundUrl = `${base}/account/refunds`;
  return links;
}

function orderLineText(payload: Record<string, unknown>): string {
  const orderNumber = typeof payload.orderNumber === 'string' ? payload.orderNumber : '';
  const total = payload.orderTotal !== undefined && payload.orderTotal !== null ? String(payload.orderTotal) : '';
  const currency = typeof payload.currency === 'string' ? payload.currency : 'KES';
  if (!orderNumber) return '';
  return `Order ${orderNumber} (${currency} ${total}).`;
}

async function buildVariables(event: DomainEvent, recipient: Recipient): Promise<TemplateVariables> {
  const payload = event.payload as Record<string, string | number | null | undefined>;
  return {
    brand: 'Veyra',
    customerName: recipient.firstName,
    orderLine: orderLineText(event.payload),
    ...deepLinks(event),
    ...payload,
  };
}

async function preferenceInputs(userId: string): Promise<{ rows: Array<{ category: ReturnType<typeof categoryForEvent>; channel: NotificationChannel; enabled: boolean }>; legacy: LegacyEmailFlags | null }> {
  const [rows, legacy] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  return { rows, legacy };
}

function selectChannels(eventType: NotificationEventType, recipient: Recipient | null, prefs: { rows: Array<{ category: ReturnType<typeof categoryForEvent>; channel: NotificationChannel; enabled: boolean }>; legacy: LegacyEmailFlags | null }): NotificationChannel[] {
  if (!recipient) return [];
  const selected: NotificationChannel[] = [];
  for (const channel of defaultChannelsFor(eventType)) {
    if (!isChannelEnabled(eventType, channel, prefs.rows, prefs.legacy)) continue;
    if (channel === 'EMAIL' && !recipient.email) continue;
    if (channel === 'SMS' && (!recipient.phone || !isSmsChannelAvailable())) continue;
    selected.push(channel);
  }
  return selected;
}

function entityRef(event: DomainEvent): { entityType: string; entityId: string } {
  return { entityType: event.aggregateType, entityId: event.aggregateId };
}

function safeFailureMessage(message: string | undefined): string {
  if (!message) return 'Delivery failed.';
  return message.slice(0, 300);
}

/**
 * Turn one outbox event into a Notification + per-channel deliveries and
 * dispatch them. Idempotent on `eventId`: a replayed event returns the
 * existing notification without new side effects.
 */
export async function processEvent(event: DomainEvent) {
  const existing = await prisma.notification.findUnique({ where: { eventId: event.eventId } });
  if (existing) return { notificationId: existing.id, duplicate: true as const };

  const eventType = event.eventType;
  const recipient = event.userId ? await loadRecipient(event.userId) : null;
  if (!recipient) {
    logger.info({ eventId: event.eventId, eventType }, 'Notification skipped: no eligible recipient');
    return { notificationId: null, skipped: true as const };
  }

  const prefs = await preferenceInputs(recipient.userId);
  const channels = selectChannels(eventType, recipient, prefs);
  if (channels.length === 0) {
    logger.info({ eventId: event.eventId, eventType, userId: recipient.userId }, 'Notification suppressed by preferences');
    return { notificationId: null, suppressed: true as const };
  }

  const variables = await buildVariables(event, recipient);
  const primary = await resolveTemplate(eventType, 'IN_APP');
  const missing = missingVariables({ body: primary.body, htmlBody: primary.htmlBody, subject: primary.subject }, variables);
  if (missing.length > 0) {
    logger.warn({ eventId: event.eventId, eventType, missing }, 'Notification template variables missing');
  }

  const title = renderText(primary.subject ?? eventTitle(eventType), variables);
  const body = renderText(primary.body, variables);
  const { entityType, entityId } = entityRef(event);

  const notification = await prisma.notification.create({
    data: {
      userId: recipient.userId,
      type: EVENT_NOTIFICATION_TYPE[eventType],
      title,
      body,
      eventId: event.eventId,
      category: categoryForEvent(eventType),
      channel: channels[0],
      status: 'QUEUED',
      priority: EVENT_PRIORITY[eventType] ?? 'NORMAL',
      entityType,
      entityId,
      templateKey: primary.key,
      templateVersion: primary.version,
      metadata: { eventType, channels } as Prisma.InputJsonValue,
    },
  });

  for (const channel of channels) {
    const template = channel === 'IN_APP' ? primary : await resolveTemplate(eventType, channel);
    const rendered = {
      subject: template.subject ? renderText(template.subject, variables) : null,
      text: renderText(template.body, variables),
      html: template.htmlBody ? renderHtml(template.htmlBody, variables) : null,
    };
    await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel,
        provider: channel === 'IN_APP' ? 'internal' : channel === 'EMAIL' ? emailProvider().name : smsProvider().name,
        status: 'QUEUED',
      },
    });
    await dispatchDelivery(notification.id, channel, recipient, rendered, template.key);
  }

  return { notificationId: notification.id, duplicate: false as const };
}

function eventTitle(eventType: NotificationEventType): string {
  return eventType.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function dispatchDelivery(
  notificationId: string,
  channel: NotificationChannel,
  recipient: Recipient,
  rendered: { subject: string | null; text: string; html: string | null },
  templateKey: string,
) {
  const delivery = await prisma.notificationDelivery.findFirst({ where: { notificationId, channel }, orderBy: { createdAt: 'desc' } });
  if (!delivery) return;

  if (channel === 'IN_APP') {
    const now = new Date();
    await prisma.$transaction([
      prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', providerMessageId: `inapp-${delivery.id}`, attemptCount: 1, lastAttemptAt: now, deliveredAt: now } }),
      prisma.notification.update({ where: { id: notificationId }, data: { status: 'DELIVERED', sentAt: now, deliveredAt: now } }),
    ]);
    return;
  }

  await prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'PROCESSING', lastAttemptAt: new Date() } });
  try {
    const result = channel === 'EMAIL'
      ? await emailProvider().send({ to: recipient.email ?? '', subject: rendered.subject ?? 'Update from Veyra', text: rendered.text, html: rendered.html ?? undefined, templateKey, notificationId })
      : await smsProvider().send({ to: recipient.phone ?? '', body: rendered.text.slice(0, 1000), senderId: env.SMS_SENDER_ID, templateKey, notificationId });
    await recordAttempt(delivery.id, notificationId, result.accepted, result.retryable, result.failureCode, result.failureMessage, result.providerMessageId);
  } catch {
    await recordAttempt(delivery.id, notificationId, false, true, 'PROVIDER_EXCEPTION', 'Provider request failed. It will be retried automatically.', null);
  }
}

async function recordAttempt(deliveryId: string, notificationId: string, accepted: boolean, retryable: boolean, failureCode: string | undefined, failureMessage: string | undefined, providerMessageId: string | null) {
  const now = new Date();
  if (accepted) {
    await prisma.$transaction([
      prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { status: 'SENT', providerMessageId, attemptCount: { increment: 1 }, lastAttemptAt: now } }),
      prisma.notification.update({ where: { id: notificationId }, data: { status: 'SENT', sentAt: now } }),
    ]);
    return;
  }
  const delivery = await prisma.notificationDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  const classification = classifyFailure(failureCode);
  const attemptCount = delivery.attemptCount + 1;
  const retry = retryable && classification === 'transient' && shouldRetry(attemptCount, classification);
  if (retry) {
    await prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: { status: 'QUEUED', attemptCount, lastAttemptAt: now, nextAttemptAt: new Date(Date.now() + computeBackoffMs(attemptCount)), failureCode, failureMessage: failureMessage ? safeFailureMessage(failureMessage) : null },
    });
    return;
  }
  await prisma.$transaction([
    prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { status: 'FAILED', attemptCount, lastAttemptAt: now, failedAt: now, nextAttemptAt: null, failureCode: failureCode ?? 'DELIVERY_FAILED', failureMessage: failureMessage ? safeFailureMessage(failureMessage) : 'Delivery failed.' } }),
    prisma.notification.update({ where: { id: notificationId }, data: { status: 'FAILED', failedAt: now } }),
  ]);
}

/** Retry one delivery on demand (admin resend). Creates a new attempt; history preserved. */
export async function retryDelivery(deliveryId: string, actorId: string) {
  const delivery = await prisma.notificationDelivery.findUnique({ where: { id: deliveryId }, include: { notification: true } });
  if (!delivery) {
    const { HttpError } = await import('../errors.js');
    throw new HttpError(404, 'DELIVERY_NOT_FOUND', 'Delivery record not found.');
  }
  if (delivery.status !== 'FAILED') {
    const { HttpError } = await import('../errors.js');
    throw new HttpError(409, 'DELIVERY_NOT_RETRYABLE', 'Only failed deliveries can be resent.');
  }
  if (delivery.attemptCount >= maxAttempts() + 2) {
    const { HttpError } = await import('../errors.js');
    throw new HttpError(429, 'RESEND_RATE_LIMITED', 'This delivery has reached the resend limit.');
  }
  const recipient = await loadRecipient(delivery.notification.userId);
  if (!recipient) {
    const { HttpError } = await import('../errors.js');
    throw new HttpError(404, 'RECIPIENT_NOT_FOUND', 'The recipient is no longer available.');
  }
  await prisma.notificationDelivery.update({ where: { id: deliveryId }, data: { status: 'QUEUED', nextAttemptAt: new Date(), failureCode: null, failureMessage: null } });
  await prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: 'QUEUED', failedAt: null } });
  const template = await resolveTemplate(delivery.notification.templateKey as NotificationEventType, delivery.channel).catch(() => null);
  const rendered = template
    ? { subject: template.subject, text: template.body, html: template.htmlBody }
    : { subject: null, text: delivery.notification.body, html: null };
  await dispatchDelivery(delivery.notificationId, delivery.channel, recipient, rendered, delivery.notification.templateKey ?? 'resend');
  await prisma.auditLog.create({ data: { actorId, action: 'NOTIFICATION_SENT', entity: 'NotificationDelivery', entityId: deliveryId } });
  return { resent: true };
}

/** Apply a verified provider delivery callback to a delivery record (idempotent). */
export async function applyProviderCallback(provider: string, providerMessageId: string, outcome: 'delivered' | 'failed', failureCode?: string, failureMessage?: string) {
  const delivery = await prisma.notificationDelivery.findFirst({ where: { provider, providerMessageId } });
  if (!delivery) return { matched: false as const };
  if (delivery.status === 'DELIVERED' || delivery.status === 'FAILED') return { matched: true as const, duplicate: true as const };
  const now = new Date();
  if (outcome === 'delivered') {
    await prisma.$transaction([
      prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', deliveredAt: now, lastAttemptAt: now } }),
      prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: 'DELIVERED', deliveredAt: now } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.notificationDelivery.update({ where: { id: delivery.id }, data: { status: 'FAILED', failedAt: now, lastAttemptAt: now, nextAttemptAt: null, failureCode: failureCode ?? 'PROVIDER_REPORTED_FAILURE', failureMessage: failureMessage ? safeFailureMessage(failureMessage) : 'Provider reported failure.' } }),
      prisma.notification.update({ where: { id: delivery.notificationId }, data: { status: 'FAILED', failedAt: now } }),
    ]);
  }
  return { matched: true as const, duplicate: false as const };
}
