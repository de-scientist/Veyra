import { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { averageOrNull, granularityFor, nairobiLabel, percentChange, previousPeriod, type Granularity, type Period } from './periods.js';

export type SalesSummary = {
  currency: string;
  grossSales: number;
  paidRevenue: number;
  netSales: number;
  discounts: number;
  shippingCollected: number;
  orders: number;
  paidOrders: number;
  averageOrderValue: number | null;
  refundedAmount: number;
};

const ACTIVE_ORDER_FILTER = { status: { not: 'CANCELLED' as const } };

async function summarize(period: Period) {
  const [orders, refunds] = await Promise.all([
    prisma.order.aggregate({
      where: { ...ACTIVE_ORDER_FILTER, createdAt: { gte: period.start, lt: period.end } },
      _sum: { grandTotal: true, discountTotal: true, shippingTotal: true },
      _count: { id: true },
    }),
    prisma.refund.aggregate({
      where: { status: 'SUCCEEDED', createdAt: { gte: period.start, lt: period.end } },
      _sum: { amount: true },
    }),
  ]);
  const [paid] = await Promise.all([
    prisma.order.aggregate({
      where: { ...ACTIVE_ORDER_FILTER, paymentStatus: 'PAID', createdAt: { gte: period.start, lt: period.end } },
      _sum: { grandTotal: true },
      _count: { id: true },
    }),
  ]);
  const grossSales = Number(orders._sum.grandTotal ?? 0);
  const paidRevenue = Number(paid._sum.grandTotal ?? 0);
  const refundedAmount = Number(refunds._sum.amount ?? 0);
  const paidOrders = paid._count.id;
  return {
    grossSales,
    paidRevenue,
    netSales: Math.round((paidRevenue - refundedAmount) * 100) / 100,
    discounts: Number(orders._sum.discountTotal ?? 0),
    shippingCollected: Number(orders._sum.shippingTotal ?? 0),
    orders: orders._count.id,
    paidOrders,
    averageOrderValue: averageOrNull(paidRevenue, paidOrders),
    refundedAmount,
  };
}

export async function salesSummary(period: Period, compare: boolean) {
  const current = await summarize(period);
  if (!compare) return { currency: 'KES', period: { from: period.start, to: period.end }, current, previous: null as null | typeof current, change: null };
  const previous = await summarize(previousPeriod(period));
  return {
    currency: 'KES',
    period: { from: period.start, to: period.end },
    current,
    previous,
    change: {
      grossSales: percentChange(current.grossSales, previous.grossSales),
      paidRevenue: percentChange(current.paidRevenue, previous.paidRevenue),
      orders: percentChange(current.orders, previous.orders),
      paidOrders: percentChange(current.paidOrders, previous.paidOrders),
    },
  };
}

export type SeriesPoint = { bucket: string; revenue: number; paidRevenue: number; orders: number; paidOrders: number };

const TRUNC_UNITS: Record<Granularity, string> = { hour: 'hour', day: 'day', week: 'week', month: 'month' };

/**
 * Revenue/orders series bucketed in Africa/Nairobi wall time. Bucket unit is
 * allow-listed; dates are bound parameters — no user input reaches SQL text.
 */
export async function salesSeries(period: Period): Promise<{ granularity: Granularity; points: SeriesPoint[] }> {
  const granularity = granularityFor(period);
  const rows = await prisma.$queryRaw<Array<{ bucket: Date; revenue: string; paid_revenue: string; orders: string; paid_orders: string }>>(
    Prisma.sql`
      SELECT
        date_trunc(${TRUNC_UNITS[granularity]}, "createdAt" AT TIME ZONE 'Africa/Nairobi') AS bucket,
        COALESCE(SUM(CASE WHEN "status" != 'CANCELLED' THEN "grandTotal" ELSE 0 END), 0) AS revenue,
        COALESCE(SUM(CASE WHEN "status" != 'CANCELLED' AND "paymentStatus" = 'PAID' THEN "grandTotal" ELSE 0 END), 0) AS paid_revenue,
        COUNT(CASE WHEN "status" != 'CANCELLED' THEN 1 END) AS orders,
        COUNT(CASE WHEN "status" != 'CANCELLED' AND "paymentStatus" = 'PAID' THEN 1 END) AS paid_orders
      FROM "Order"
      WHERE "createdAt" >= ${period.start} AND "createdAt" < ${period.end}
      GROUP BY bucket
      ORDER BY bucket ASC
    `,
  );
  return {
    granularity,
    points: rows.map((row) => ({
      bucket: nairobiLabel(new Date(row.bucket), granularity),
      revenue: Number(row.revenue),
      paidRevenue: Number(row.paid_revenue),
      orders: Number(row.orders),
      paidOrders: Number(row.paid_orders),
    })),
  };
}

export async function revenueByCategory(period: Period, limit = 20) {
  const rows = await prisma.$queryRaw<Array<{ category: string; revenue: string; units: string; orders: string }>>(
    Prisma.sql`
      SELECT COALESCE(c."name", 'Uncategorised') AS category,
        COALESCE(SUM(oi."total"), 0) AS revenue,
        COALESCE(SUM(oi."quantity"), 0) AS units,
        COUNT(DISTINCT oi."orderId") AS orders
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      LEFT JOIN "ProductVariant" v ON v."id" = oi."variantId"
      LEFT JOIN "Product" p ON p."id" = v."productId"
      LEFT JOIN "Category" c ON c."id" = p."categoryId"
      WHERE o."createdAt" >= ${period.start} AND o."createdAt" < ${period.end} AND o."status" != 'CANCELLED'
      GROUP BY COALESCE(c."name", 'Uncategorised')
      ORDER BY revenue DESC
      LIMIT ${Math.min(Math.max(limit, 1), 50)}
    `,
  );
  return rows.map((row) => ({ category: row.category, revenue: Number(row.revenue), units: Number(row.units), orders: Number(row.orders) }));
}

export async function revenueByPaymentMethod(period: Period) {
  const rows = await prisma.payment.groupBy({
    by: ['provider'],
    where: { status: 'PAID', createdAt: { gte: period.start, lt: period.end } },
    _sum: { amount: true },
    _count: { id: true },
  });
  return rows.map((row) => ({ provider: row.provider, revenue: Number(row._sum.amount ?? 0), payments: row._count.id }));
}
