import { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { averageOrNull, type Period } from './periods.js';

export async function fulfillmentStatus(period: Period) {
  const groups = await prisma.delivery.groupBy({
    by: ['status'],
    where: { createdAt: { gte: period.start, lt: period.end } },
    _count: { id: true },
  });
  return groups.map((group) => ({ status: group.status, deliveries: group._count.id }));
}

export async function deliveryMethodSplit(period: Period) {
  const rows = await prisma.$queryRaw<Array<{ method: string; deliveries: string; delivered: string }>>(
    Prisma.sql`
      SELECT COALESCE(m."type", 'UNKNOWN') AS method,
        COUNT(*) AS deliveries,
        COUNT(CASE WHEN d."status" IN ('DELIVERED', 'PICKED_UP') THEN 1 END) AS delivered
      FROM "Delivery" d
      LEFT JOIN "ShippingMethod" m ON m."id" = d."shippingMethodId"
      WHERE d."createdAt" >= ${period.start} AND d."createdAt" < ${period.end}
      GROUP BY COALESCE(m."type", 'UNKNOWN')
      ORDER BY deliveries DESC
    `,
  );
  return rows.map((row) => {
    const deliveries = Number(row.deliveries);
    const delivered = Number(row.delivered);
    return { method: row.method, deliveries, delivered, completionRate: deliveries === 0 ? null : Math.round((delivered / deliveries) * 1000) / 10 };
  });
}

export type DurationMetric = { samples: number; averageHours: number | null };

function hours(ms: number | null): number | null {
  if (ms === null || ms < 0) return null;
  return Math.round((ms / 3600000) * 100) / 100;
}

/**
 * Stage durations from authoritative timestamps only. A stage with no samples
 * returns null averageHours rather than a fabricated zero.
 */
export async function fulfillmentDurations(period: Period) {
  const rows = await prisma.$queryRaw<Array<{
    paid_to_delivered: string | null;
    shipped_to_delivered: string | null;
    created_to_shipped: string | null;
    samples_paid_delivered: string;
    samples_shipped_delivered: string;
    samples_created_shipped: string;
  }>>(
    Prisma.sql`
      SELECT
        AVG(EXTRACT(EPOCH FROM (d."deliveredAt" - pay."paidAt"))) AS paid_to_delivered,
        AVG(EXTRACT(EPOCH FROM (d."deliveredAt" - d."shippedAt"))) AS shipped_to_delivered,
        AVG(EXTRACT(EPOCH FROM (d."shippedAt" - o."createdAt"))) AS created_to_shipped,
        COUNT(CASE WHEN d."deliveredAt" IS NOT NULL AND pay."paidAt" IS NOT NULL THEN 1 END) AS samples_paid_delivered,
        COUNT(CASE WHEN d."deliveredAt" IS NOT NULL AND d."shippedAt" IS NOT NULL THEN 1 END) AS samples_shipped_delivered,
        COUNT(CASE WHEN d."shippedAt" IS NOT NULL THEN 1 END) AS samples_created_shipped
      FROM "Delivery" d
      JOIN "Order" o ON o."id" = d."orderId"
      LEFT JOIN "Payment" pay ON pay."orderId" = o."id" AND pay."status" = 'PAID'
      WHERE d."createdAt" >= ${period.start} AND d."createdAt" < ${period.end}
    `,
  );
  const row = rows[0];
  const toMetric = (seconds: string | null, samples: string): DurationMetric => ({
    samples: Number(samples),
    averageHours: seconds === null ? null : hours(Number(seconds) * 1000),
  });
  return {
    paidToDelivered: toMetric(row?.paid_to_delivered ?? null, row?.samples_paid_delivered ?? '0'),
    shippedToDelivered: toMetric(row?.shipped_to_delivered ?? null, row?.samples_shipped_delivered ?? '0'),
    createdToShipped: toMetric(row?.created_to_shipped ?? null, row?.samples_created_shipped ?? '0'),
  };
}

export async function deliveryFailures(period: Period) {
  const [failed, attempted, completed] = await Promise.all([
    prisma.delivery.count({ where: { status: 'FAILED', createdAt: { gte: period.start, lt: period.end } } }),
    prisma.delivery.count({ where: { status: 'DELIVERY_ATTEMPTED', createdAt: { gte: period.start, lt: period.end } } }),
    prisma.delivery.count({ where: { status: { in: ['DELIVERED', 'PICKED_UP'] }, createdAt: { gte: period.start, lt: period.end } } }),
  ]);
  const total = failed + attempted + completed;
  return {
    failed,
    deliveryAttempted: attempted,
    delivered: completed,
    failureRate: total === 0 ? null : Math.round(((failed + attempted) / total) * 1000) / 10,
  };
}

export { averageOrNull };
