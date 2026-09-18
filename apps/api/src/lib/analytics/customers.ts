import { prisma } from '../prisma.js';
import { averageOrNull, type Period } from './periods.js';

/**
 * Segmentation thresholds are technical defaults, NOT business policy:
 * HIGH_VALUE_THRESHOLD_KES and INACTIVE_DAYS are
 * UNKNOWN — REQUIRES BUSINESS DECISION.
 */
export const HIGH_VALUE_THRESHOLD_KES = 20000;
export const INACTIVE_DAYS = 90;

export type CustomerMetrics = {
  totalCustomers: number;
  purchasingCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  repeatPurchaseRate: number | null;
  averageOrdersPerCustomer: number | null;
  averageCustomerValue: number | null;
  observedLifetimeValue: number | null;
  guestOrders: number;
};

export async function customerMetrics(period: Period): Promise<CustomerMetrics> {
  const [totalCustomers, registeredOrders, guestOrders] = await Promise.all([
    prisma.user.count({ where: { status: { not: 'DELETED' }, roles: { some: { role: { slug: 'customer' } } } } }),
    prisma.order.findMany({
      where: { status: { not: 'CANCELLED' }, userId: { not: null }, createdAt: { gte: period.start, lt: period.end } },
      select: { userId: true, grandTotal: true, createdAt: true },
    }),
    prisma.order.count({ where: { status: { not: 'CANCELLED' }, userId: null, createdAt: { gte: period.start, lt: period.end } } }),
  ]);

  const byUser = new Map<string, { orders: number; total: number; firstOrder: Date }>();
  for (const order of registeredOrders) {
    const entry = byUser.get(order.userId as string) ?? { orders: 0, total: 0, firstOrder: order.createdAt };
    entry.orders += 1;
    entry.total += Number(order.grandTotal);
    if (order.createdAt < entry.firstOrder) entry.firstOrder = order.createdAt;
    byUser.set(order.userId as string, entry);
  }

  // New vs returning is determined by first-ever qualifying order, not the window.
  const userIds = [...byUser.keys()];
  const firstOrders = userIds.length
    ? await prisma.order.groupBy({
        by: ['userId'],
        where: { status: { not: 'CANCELLED' }, userId: { in: userIds } },
        _min: { createdAt: true },
      })
    : [];
  const firstEver = new Map(firstOrders.map((row) => [row.userId as string, row._min.createdAt as Date]));
  let newCustomers = 0;
  let repeatCustomers = 0;
  let lifetimeTotal = 0;
  for (const [userId, entry] of byUser) {
    const first = firstEver.get(userId);
    if (first && first >= period.start && first < period.end) newCustomers += 1;
    if (entry.orders > 1) repeatCustomers += 1;
    lifetimeTotal += entry.total;
  }
  const purchasingCustomers = byUser.size;
  const returningCustomers = purchasingCustomers - newCustomers;
  return {
    totalCustomers,
    purchasingCustomers,
    newCustomers,
    returningCustomers,
    repeatPurchaseRate: purchasingCustomers === 0 ? null : Math.round((repeatCustomers / purchasingCustomers) * 1000) / 10,
    averageOrdersPerCustomer: averageOrNull(registeredOrders.length, purchasingCustomers),
    averageCustomerValue: averageOrNull(lifetimeTotal, purchasingCustomers),
    observedLifetimeValue: averageOrNull(lifetimeTotal, purchasingCustomers),
    guestOrders,
  };
}

export type CustomerSegment = {
  segment: string;
  customers: number;
  orders: number;
  revenue: number;
};

export async function customerSegments(period: Period, now: Date = new Date()): Promise<CustomerSegment[]> {
  const orders = await prisma.order.findMany({
    where: { status: { not: 'CANCELLED' }, userId: { not: null } },
    select: { userId: true, grandTotal: true, createdAt: true },
  });
  const byUser = new Map<string, { orders: number; total: number; lastOrder: Date; firstOrder: Date }>();
  for (const order of orders) {
    const entry = byUser.get(order.userId as string) ?? { orders: 0, total: 0, lastOrder: order.createdAt, firstOrder: order.createdAt };
    entry.orders += 1;
    entry.total += Number(order.grandTotal);
    if (order.createdAt > entry.lastOrder) entry.lastOrder = order.createdAt;
    if (order.createdAt < entry.firstOrder) entry.firstOrder = order.createdAt;
    byUser.set(order.userId as string, entry);
  }
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_DAYS * 24 * 60 * 60 * 1000);
  const buckets = new Map<string, { customers: number; orders: number; revenue: number }>();
  const add = (segment: string, total: number) => {
    const entry = buckets.get(segment) ?? { customers: 0, orders: 0, revenue: 0 };
    entry.customers += 1;
    entry.orders += 1;
    entry.revenue = Math.round((entry.revenue + total) * 100) / 100;
    buckets.set(segment, entry);
  };
  for (const entry of byUser.values()) {
    const inPeriod = entry.lastOrder >= period.start && entry.lastOrder < period.end;
    if (!inPeriod && entry.lastOrder < inactiveCutoff) {
      add('Inactive', entry.total);
      continue;
    }
    if (entry.orders === 1) add('One-Time', entry.total);
    else add('Repeat', entry.total);
    if (entry.total >= HIGH_VALUE_THRESHOLD_KES) add('High-Value', entry.total);
    if (entry.firstOrder >= period.start && entry.firstOrder < period.end) add('New', entry.total);
  }
  return [...buckets.entries()].map(([segment, stats]) => ({ segment, ...stats }));
}

export async function topCustomers(period: Period, limit = 20) {
  const orders = await prisma.order.findMany({
    where: { status: { not: 'CANCELLED' }, userId: { not: null }, createdAt: { gte: period.start, lt: period.end } },
    select: { userId: true, grandTotal: true, user: { select: { email: true, firstName: true, lastName: true } } },
  });
  const byUser = new Map<string, { email: string; name: string; orders: number; total: number }>();
  for (const order of orders) {
    const entry = byUser.get(order.userId as string) ?? { email: order.user?.email ?? '', name: `${order.user?.firstName ?? ''} ${order.user?.lastName ?? ''}`.trim(), orders: 0, total: 0 };
    entry.orders += 1;
    entry.total = Math.round((entry.total + Number(order.grandTotal)) * 100) / 100;
    byUser.set(order.userId as string, entry);
  }
  return [...byUser.values()].sort((a, b) => b.total - a.total).slice(0, Math.min(Math.max(limit, 1), 50));
}
