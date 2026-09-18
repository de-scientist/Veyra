import { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';

export type QualityIssue = {
  key: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  samples: string[];
};

const SAMPLE_LIMIT = 10;

/** Bounded data-quality probes. Counts are exact; samples are capped. */
export async function dataQuality(): Promise<QualityIssue[]> {
  const [
    paidWithoutPayment,
    negativeInventory,
    reservedOverflow,
    refundsOverPaid,
    deliveredWithoutTimestamp,
    zeroTotalOrders,
    paidWithoutReference,
  ] = await Promise.all([
    prisma.$queryRaw<Array<{ order_number: string }>>(
      Prisma.sql`SELECT o."orderNumber" AS order_number FROM "Order" o WHERE o."status" != 'CANCELLED' AND o."paymentStatus" = 'PAID' AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'PAID') LIMIT ${SAMPLE_LIMIT}`,
    ),
    prisma.inventory.findMany({ where: { quantityOnHand: { lt: 0 } }, select: { variant: { select: { sku: true } } }, take: SAMPLE_LIMIT }),
    prisma.$queryRaw<Array<{ sku: string }>>(
      Prisma.sql`SELECT v."sku" AS sku FROM "Inventory" i JOIN "ProductVariant" v ON v."id" = i."variantId" WHERE i."quantityReserved" > i."quantityOnHand" LIMIT ${SAMPLE_LIMIT}`,
    ),
    prisma.$queryRaw<Array<{ refund_number: string }>>(
      Prisma.sql`SELECT r."refundNumber" AS refund_number FROM "Refund" r JOIN "Payment" p ON p."id" = r."paymentId" WHERE r."status" = 'SUCCEEDED' AND r."amount" > p."amount" LIMIT ${SAMPLE_LIMIT}`,
    ),
    prisma.delivery.findMany({ where: { status: 'DELIVERED', deliveredAt: null }, select: { trackingNumber: true, order: { select: { orderNumber: true } } }, take: SAMPLE_LIMIT }),
    prisma.order.findMany({ where: { status: { not: 'CANCELLED' }, grandTotal: { lte: 0 } }, select: { orderNumber: true }, take: SAMPLE_LIMIT }),
    prisma.payment.findMany({ where: { status: 'PAID', providerReference: null }, select: { order: { select: { orderNumber: true } } }, take: SAMPLE_LIMIT }),
  ]);

  const [paidWithoutPaymentCount, negativeCount, overflowCount, overRefundCount, missingTimestampCount, zeroTotalCount, missingRefCount] = await Promise.all([
    prisma.$queryRaw<Array<{ count: string }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "Order" o WHERE o."status" != 'CANCELLED' AND o."paymentStatus" = 'PAID' AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."orderId" = o."id" AND p."status" = 'PAID')`,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.inventory.count({ where: { quantityOnHand: { lt: 0 } } }),
    prisma.$queryRaw<Array<{ count: string }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "Inventory" i WHERE i."quantityReserved" > i."quantityOnHand"`,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.$queryRaw<Array<{ count: string }>>(
      Prisma.sql`SELECT COUNT(*) AS count FROM "Refund" r JOIN "Payment" p ON p."id" = r."paymentId" WHERE r."status" = 'SUCCEEDED' AND r."amount" > p."amount"`,
    ).then((rows) => Number(rows[0]?.count ?? 0)),
    prisma.delivery.count({ where: { status: 'DELIVERED', deliveredAt: null } }),
    prisma.order.count({ where: { status: { not: 'CANCELLED' }, grandTotal: { lte: 0 } } }),
    prisma.payment.count({ where: { status: 'PAID', providerReference: null } }),
  ]);

  return [
    { key: 'paid-without-payment', title: 'Paid orders without a successful payment record', severity: 'high', count: paidWithoutPaymentCount, samples: paidWithoutPayment.map((row) => row.order_number) },
    { key: 'negative-inventory', title: 'Inventory records below zero on hand', severity: 'high', count: negativeCount, samples: negativeInventory.map((row) => row.variant.sku) },
    { key: 'reserved-overflow', title: 'Reserved quantity exceeding on-hand quantity', severity: 'high', count: overflowCount, samples: reservedOverflow.map((row) => row.sku) },
    { key: 'refund-over-paid', title: 'Succeeded refunds exceeding the paid amount', severity: 'high', count: overRefundCount, samples: refundsOverPaid.map((row) => row.refund_number) },
    { key: 'delivered-without-timestamp', title: 'Deliveries marked delivered without a delivery timestamp', severity: 'medium', count: missingTimestampCount, samples: deliveredWithoutTimestamp.map((row) => row.order.orderNumber) },
    { key: 'zero-total-orders', title: 'Non-cancelled orders with zero grand total', severity: 'medium', count: zeroTotalCount, samples: zeroTotalOrders.map((row) => row.orderNumber) },
    { key: 'paid-without-reference', title: 'Paid payments without a provider reference', severity: 'low', count: missingRefCount, samples: paidWithoutReference.map((row) => row.order.orderNumber) },
  ];
}
