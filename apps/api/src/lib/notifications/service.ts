import { NotificationCategory, Prisma } from '@prisma/client';

import { HttpError } from '../errors.js';
import { prisma } from '../prisma.js';
import { getPreferenceMatrix, setPreference } from './preferences.js';

export type CustomerNotificationDTO = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  entityType: string | null;
  entityId: string | null;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
};

function deepLinkFor(notification: { type: string; entityType: string | null; entityId: string | null; metadata: unknown }): string | null {
  const metadata = (notification.metadata ?? {}) as { orderNumber?: string; returnId?: string; channels?: string[] };
  if (metadata.orderNumber && (notification.type === 'ORDER' || notification.type === 'PAYMENT' || notification.type === 'SHIPPING')) {
    return `/account/orders/${metadata.orderNumber}`;
  }
  if (metadata.returnId) return `/account/returns/${metadata.returnId}`;
  if (notification.type === 'PAYMENT' && metadata.orderNumber) return `/account/orders/${metadata.orderNumber}`;
  return null;
}

function toDTO(notification: {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  priority: string;
  status: string;
  entityType: string | null;
  entityId: string | null;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}): CustomerNotificationDTO {
  return {
    id: notification.id,
    type: notification.type,
    category: notification.category,
    title: notification.title,
    body: notification.body,
    priority: notification.priority,
    status: notification.status,
    entityType: notification.entityType,
    entityId: notification.entityId,
    deepLink: deepLinkFor(notification),
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

const CUSTOMER_CATEGORIES: NotificationCategory[] = ['TRANSACTIONAL', 'SECURITY', 'MARKETING'];

export async function listNotifications(userId: string, params: { page?: number; pageSize?: number; category?: string; unreadOnly?: boolean } = {}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? 20)));
  const where: Prisma.NotificationWhereInput = { userId };
  if (params.category) {
    if (!(CUSTOMER_CATEGORIES as string[]).includes(params.category)) throw new HttpError(400, 'INVALID_CATEGORY', 'Unknown notification category.');
    where.category = params.category as NotificationCategory;
  }
  if (params.unreadOnly) where.readAt = null;
  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { notifications: rows.map(toDTO), unreadCount, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export async function unreadCount(userId: string) {
  const count = await prisma.notification.count({ where: { userId, readAt: null } });
  return { unreadCount: count };
}

export async function markRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findFirst({ where: { id: notificationId, userId } });
  if (!notification) throw new HttpError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found.');
  if (!notification.readAt) await prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  return { read: true };
}

export async function markAllRead(userId: string) {
  const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return { marked: result.count };
}

export async function getPreferences(userId: string) {
  return getPreferenceMatrix(userId);
}

export async function updatePreference(userId: string, category: NotificationCategory, channel: 'IN_APP' | 'EMAIL' | 'SMS', enabled: boolean) {
  if (!CUSTOMER_CATEGORIES.includes(category)) throw new HttpError(400, 'INVALID_CATEGORY', 'Unknown notification category.');
  const updated = await setPreference(userId, category, channel, enabled);
  await prisma.auditLog.create({ data: { actorId: userId, action: 'PREFERENCES_UPDATED', entity: 'NotificationPreference', entityId: updated.id } });
  return getPreferenceMatrix(userId);
}

export async function adminQueue(params: { status?: string; channel?: string; page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? 20)));
  const where: Prisma.NotificationDeliveryWhereInput = {};
  if (params.status) where.status = params.status as Prisma.EnumNotificationStatusFilter['equals'];
  if (params.channel) where.channel = params.channel as Prisma.EnumNotificationChannelFilter['equals'];
  const [rows, total] = await Promise.all([
    prisma.notificationDelivery.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { notification: { select: { id: true, userId: true, type: true, title: true, createdAt: true } } },
    }),
    prisma.notificationDelivery.count({ where }),
  ]);
  return {
    deliveries: rows.map((d) => ({
      id: d.id,
      notificationId: d.notificationId,
      channel: d.channel,
      provider: d.provider,
      status: d.status,
      providerMessageId: d.providerMessageId,
      attemptCount: d.attemptCount,
      lastAttemptAt: d.lastAttemptAt,
      nextAttemptAt: d.nextAttemptAt,
      deliveredAt: d.deliveredAt,
      failedAt: d.failedAt,
      failureCode: d.failureCode,
      createdAt: d.createdAt,
      notification: d.notification,
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}
