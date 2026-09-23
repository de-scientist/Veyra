import { Prisma } from '@prisma/client';

import { prisma } from '../prisma.js';
import { averageOrNull, type Period } from './periods.js';

export type ProductRow = {
  productName: string;
  sku: string;
  units: number;
  revenue: number;
  orders: number;
  averagePrice: number | null;
  returnedUnits: number;
  returnRate: number | null;
};

export type VariantRow = {
  productName: string;
  sku: string;
  variantDescription: string | null;
  units: number;
  revenue: number;
  available: number;
};

function clampLimit(limit: number) {
  return Math.min(Math.max(Math.floor(limit) || 10, 1), 50);
}

/** Top products from immutable OrderItem snapshots — archived products remain reportable. */
export async function topProducts(period: Period, limit = 20): Promise<ProductRow[]> {
  const rows = await prisma.$queryRaw<Array<{ product_name: string; sku: string; units: string; revenue: string; orders: string; returned_units: string }>>(
    Prisma.sql`
      SELECT oi."productName" AS product_name, oi."sku" AS sku,
        COALESCE(SUM(oi."quantity"), 0) AS units,
        COALESCE(SUM(oi."total"), 0) AS revenue,
        COUNT(DISTINCT oi."orderId") AS orders,
        COALESCE(SUM(COALESCE(ri."returned", 0)), 0) AS returned_units
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      LEFT JOIN (
        SELECT "orderItemId", SUM("quantity") AS returned
        FROM "ReturnItem" ri
        JOIN "ReturnRequest" rr ON rr."id" = ri."returnRequestId"
        WHERE rr."status" NOT IN ('REJECTED', 'CANCELLED')
        GROUP BY "orderItemId"
      ) ri ON ri."orderItemId" = oi."id"
      WHERE o."createdAt" >= ${period.start} AND o."createdAt" < ${period.end} AND o."status" != 'CANCELLED'
      GROUP BY oi."productName", oi."sku"
      ORDER BY revenue DESC
      LIMIT ${clampLimit(limit)}
    `,
  );
  return rows.map((row) => {
    const units = Number(row.units);
    const returnedUnits = Number(row.returned_units);
    return {
      productName: row.product_name,
      sku: row.sku,
      units,
      revenue: Number(row.revenue),
      orders: Number(row.orders),
      averagePrice: averageOrNull(Number(row.revenue), units),
      returnedUnits,
      returnRate: units === 0 ? null : Math.round((returnedUnits / units) * 1000) / 10,
    };
  });
}

/** Variant-level performance; variantDescription preserves the flexible attribute combination. */
export async function topVariants(period: Period, limit = 20): Promise<VariantRow[]> {
  const rows = await prisma.$queryRaw<Array<{ product_name: string; sku: string; variant_description: string | null; units: string; revenue: string; on_hand: string | null; reserved: string | null }>>(
    Prisma.sql`
      SELECT oi."productName" AS product_name, oi."sku" AS sku, oi."variantDescription" AS variant_description,
        COALESCE(SUM(oi."quantity"), 0) AS units,
        COALESCE(SUM(oi."total"), 0) AS revenue,
        MAX(inv."quantityOnHand") AS on_hand, MAX(inv."quantityReserved") AS reserved
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      LEFT JOIN "ProductVariant" v ON v."id" = oi."variantId"
      LEFT JOIN "Inventory" inv ON inv."variantId" = v."id"
      WHERE o."createdAt" >= ${period.start} AND o."createdAt" < ${period.end} AND o."status" != 'CANCELLED'
      GROUP BY oi."productName", oi."sku", oi."variantDescription"
      ORDER BY revenue DESC
      LIMIT ${clampLimit(limit)}
    `,
  );
  return rows.map((row) => ({
    productName: row.product_name,
    sku: row.sku,
    variantDescription: row.variant_description,
    units: Number(row.units),
    revenue: Number(row.revenue),
    available: row.on_hand === null ? 0 : Number(row.on_hand) - Number(row.reserved ?? 0),
  }));
}

export async function mostReturnedProducts(period: Period, limit = 10) {
  const rows = await prisma.$queryRaw<Array<{ product_name: string; sku: string; returned_units: string; requests: string }>>(
    Prisma.sql`
      SELECT oi."productName" AS product_name, oi."sku" AS sku,
        COALESCE(SUM(ri."quantity"), 0) AS returned_units,
        COUNT(DISTINCT ri."returnRequestId") AS requests
      FROM "ReturnItem" ri
      JOIN "OrderItem" oi ON oi."id" = ri."orderItemId"
      JOIN "ReturnRequest" rr ON rr."id" = ri."returnRequestId"
      WHERE rr."requestedAt" >= ${period.start} AND rr."requestedAt" < ${period.end}
        AND rr."status" NOT IN ('REJECTED', 'CANCELLED')
      GROUP BY oi."productName", oi."sku"
      ORDER BY returned_units DESC
      LIMIT ${clampLimit(limit)}
    `,
  );
  return rows.map((row) => ({ productName: row.product_name, sku: row.sku, returnedUnits: Number(row.returned_units), requests: Number(row.requests) }));
}
