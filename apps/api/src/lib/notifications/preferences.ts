import { NotificationCategory, NotificationChannel } from '@prisma/client';

import { prisma } from '../prisma.js';
import type { NotificationEventType } from './events.js';

export const PREFERENCE_CATEGORIES: NotificationCategory[] = ['TRANSACTIONAL', 'SECURITY', 'MARKETING'];
export const PREFERENCE_CHANNELS: NotificationChannel[] = ['IN_APP', 'EMAIL', 'SMS'];

const EVENT_CATEGORIES: Record<NotificationEventType, NotificationCategory> = {
  ORDER_PLACED: 'TRANSACTIONAL',
  PAYMENT_CONFIRMED: 'TRANSACTIONAL',
  PAYMENT_FAILED: 'TRANSACTIONAL',
  ORDER_PROCESSING: 'TRANSACTIONAL',
  ORDER_PACKED: 'TRANSACTIONAL',
  ORDER_SHIPPED: 'TRANSACTIONAL',
  ORDER_OUT_FOR_DELIVERY: 'TRANSACTIONAL',
  ORDER_DELIVERED: 'TRANSACTIONAL',
  DELIVERY_FAILED: 'TRANSACTIONAL',
  RETURN_REQUESTED: 'TRANSACTIONAL',
  RETURN_APPROVED: 'TRANSACTIONAL',
  RETURN_REJECTED: 'TRANSACTIONAL',
  RETURN_RECEIVED: 'TRANSACTIONAL',
  RETURN_RESOLVED: 'TRANSACTIONAL',
  EXCHANGE_REQUESTED: 'TRANSACTIONAL',
  EXCHANGE_APPROVED: 'TRANSACTIONAL',
  REFUND_REQUESTED: 'TRANSACTIONAL',
  REFUND_SUCCEEDED: 'TRANSACTIONAL',
  REFUND_FAILED: 'TRANSACTIONAL',
  PASSWORD_CHANGED: 'SECURITY',
  ACCOUNT_DEACTIVATED: 'SECURITY',
  ORDER_READY_FOR_PICKUP: 'TRANSACTIONAL',
  LOW_STOCK_DETECTED: 'TRANSACTIONAL',
};

export function categoryForEvent(eventType: NotificationEventType): NotificationCategory {
  return EVENT_CATEGORIES[eventType];
}

export type PreferenceRow = { category: NotificationCategory; channel: NotificationChannel; enabled: boolean };

export type LegacyEmailFlags = {
  emailOrderUpdates: boolean;
  emailDelivery: boolean;
  emailReturns: boolean;
  emailMarketing: boolean;
};

function legacyEmailDefault(category: NotificationCategory, eventType: NotificationEventType, flags: LegacyEmailFlags | null): boolean {
  if (category === 'SECURITY') return true;
  if (category === 'MARKETING') return flags?.emailMarketing ?? false;
  if (eventType.startsWith('ORDER_') || eventType === 'ORDER_PLACED' || eventType.startsWith('PAYMENT_')) return flags?.emailOrderUpdates ?? true;
  if (eventType === 'ORDER_OUT_FOR_DELIVERY' || eventType === 'ORDER_SHIPPED' || eventType === 'ORDER_DELIVERED' || eventType === 'DELIVERY_FAILED') {
    return flags?.emailDelivery ?? true;
  }
  if (eventType.startsWith('RETURN_') || eventType.startsWith('EXCHANGE_') || eventType.startsWith('REFUND_')) return flags?.emailReturns ?? true;
  return true;
}

/**
 * Pure preference evaluation. Precedence: explicit per-category/channel row >
 * legacy Phase-10 email flags (EMAIL channel only) > safe defaults.
 * IN_APP for TRANSACTIONAL/SECURITY is mandatory and cannot be disabled.
 */
export function isChannelEnabled(
  eventType: NotificationEventType,
  channel: NotificationChannel,
  rows: PreferenceRow[],
  legacyEmail: LegacyEmailFlags | null,
): boolean {
  const category = categoryForEvent(eventType);
  if (channel === 'IN_APP' && category !== 'MARKETING') return true;
  const explicit = rows.find((row) => row.category === category && row.channel === channel);
  if (explicit) return explicit.enabled;
  if (channel === 'EMAIL') return legacyEmailDefault(category, eventType, legacyEmail);
  if (channel === 'SMS') return category !== 'MARKETING';
  return category !== 'MARKETING';
}

export function defaultChannelsFor(eventType: NotificationEventType): NotificationChannel[] {
  void eventType;
  return ['IN_APP', 'EMAIL', 'SMS'];
}

export async function resolveChannels(userId: string, eventType: NotificationEventType): Promise<NotificationChannel[]> {
  const [rows, legacy] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  return defaultChannelsFor(eventType).filter((channel) => isChannelEnabled(eventType, channel, rows, legacy));
}

export async function getPreferenceMatrix(userId: string) {
  const [rows, legacy] = await Promise.all([
    prisma.notificationPreference.findMany({ where: { userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  return PREFERENCE_CATEGORIES.map((category) => ({
    category,
    channels: PREFERENCE_CHANNELS.map((channel) => {
      const explicit = rows.find((row) => row.category === category && row.channel === channel) ?? null;
      const locked = channel === 'IN_APP' && category !== 'MARKETING';
      return {
        channel,
        enabled: locked ? true : (explicit?.enabled ?? (channel === 'EMAIL' ? legacyEmailDefault(category, 'ORDER_PLACED', legacy) : category !== 'MARKETING')),
        locked,
        explicit: explicit !== null,
      };
    }),
  }));
}

export async function setPreference(userId: string, category: NotificationCategory, channel: NotificationChannel, enabled: boolean) {
  if (channel === 'IN_APP' && category !== 'MARKETING' && !enabled) {
    const { HttpError } = await import('../errors.js');
    throw new HttpError(400, 'PREFERENCE_LOCKED', 'Critical in-app notifications cannot be disabled.');
  }
  return prisma.notificationPreference.upsert({
    where: { userId_category_channel: { userId, category, channel } },
    update: { enabled },
    create: { userId, category, channel, enabled },
  });
}
