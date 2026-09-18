import { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { averageOrNull, type Period } from './periods.js';

export async function returnMetrics(period: Period) {
  const [byStatus, soldUnits, deliveredOrders, soldOrders] = await Promise.all([
    prisma.returnRequest.groupBy({
      by: ['status'],
      where: { requestedAt: { gte: period.start, lt: period.end } },
      _count: { id: true },
    }),
    prisma.orderItem.aggregate({
      where: { order: { status: { not: 'CANCELLED' }, createdAt: { gte: period.start, lt: period.end } } },
      _sum: { quantity: true },
    }),
    prisma.order.count({ where: { status: { not: 'CANCELLED' }, fulfillmentStatus: 'DELIVERED', createdAt: { gte: period.start, lt: period.end } } }),
    prisma.order.count({ where: { status: { not: 'CANCELLED' }, createdAt: { gte: period.start, lt: period.end } } }),
  ]);
  const returnedItems = await prisma.returnItem.aggregate({
    where: { returnRequest: { requestedAt: { gte: period.start, lt: period.end }, status: { notIn: ['REJECTED', 'CANCELLED'] } } },
    _sum: { quantity: true, refundAmount: true },
  });
  const total = byStatus.reduce((sum, row) => sum + row._count.id, 0);
  const unitsSold = soldUnits._sum.quantity ?? 0;
  const unitsReturned = returnedItems._sum.quantity ?? 0;
  const statusCount = (status: string) => byStatus.find((row) => row.status === status)?._count.id ?? 0;
  return {
    requests: total,
    byStatus: byStatus.map((row) => ({ status: row.status, requests: row._count.id })),
    approved: statusCount('APPROVED') + statusCount('APPROVED_FOR_RESOLUTION') + statusCount('RESOLVED'),
    rejected: statusCount('REJECTED'),
    resolved: statusCount('RESOLVED'),
    unitsReturned,
    returnValue: Number(returnedItems._sum.refundAmount ?? 0),
    /** Returned units / units sold in the same window (windowed proxy, not cohort-tracked). */
    unitReturnRate: unitsSold === 0 ? null : Math.round((unitsReturned / unitsSold) * 1000) / 10,
    /** Orders with a return request / delivered orders in the same window. */
    orderReturnRate: deliveredOrders === 0 ? null : Math.round((total / deliveredOrders) * 1000) / 10,
    deliveredOrders,
    soldOrders,
  };
}

export async function returnReasons(period: Period) {
  const rows = await prisma.returnItem.groupBy({
    by: ['reason'],
    where: { returnRequest: { requestedAt: { gte: period.start, lt: period.end }, status: { notIn: ['REJECTED', 'CANCELLED'] } } },
    _sum: { quantity: true },
    _count: { id: true },
  });
  const total = rows.reduce((sum, row) => sum + row._count.id, 0);
  return rows
    .map((row) => ({ reason: row.reason, requests: row._count.id, units: row._sum.quantity ?? 0, share: total === 0 ? null : Math.round((row._count.id / total) * 1000) / 10 }))
    .sort((a, b) => b.requests - a.requests);
}

export async function returnProcessingTime(period: Period) {
  const rows = await prisma.$queryRaw<Array<{ seconds: string | null; samples: string }>>(
    Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM ("completedAt" - "requestedAt"))) AS seconds,
        COUNT(CASE WHEN "completedAt" IS NOT NULL THEN 1 END) AS samples
      FROM "ReturnRequest"
      WHERE "requestedAt" >= ${period.start} AND "requestedAt" < ${period.end}
        AND "status" = 'RESOLVED'
    `,
  );
  const samples = Number(rows[0]?.samples ?? 0);
  return {
    samples,
    averageHours: rows[0]?.seconds === null || rows[0]?.seconds === undefined ? null : Math.round((Number(rows[0].seconds) / 3600) * 100) / 100,
  };
}

export async function exchangeMetrics(period: Period) {
  const groups = await prisma.exchange.groupBy({
    by: ['status'],
    where: { createdAt: { gte: period.start, lt: period.end } },
    _count: { id: true },
  });
  const total = groups.reduce((sum, row) => sum + row._count.id, 0);
  return {
    requests: total,
    byStatus: groups.map((row) => ({ status: row.status, exchanges: row._count.id })),
  };
}

export async function refundMetrics(period: Period) {
  const groups = await prisma.refund.groupBy({
    by: ['status'],
    where: { createdAt: { gte: period.start, lt: period.end } },
    _sum: { amount: true },
    _count: { id: true },
  });
  const total = groups.reduce((sum, row) => sum + row._count.id, 0);
  const succeeded = groups.find((row) => row.status === 'SUCCEEDED');
  const totalSucceeded = Number(succeeded?._sum.amount ?? 0);
  return {
    requests: total,
    byStatus: groups.map((row) => ({ status: row.status, refunds: row._count.id, amount: Number(row._sum.amount ?? 0) })),
    totalRefunded: totalSucceeded,
    averageRefund: averageOrNull(totalSucceeded, succeeded?._count.id ?? 0),
  };
}
