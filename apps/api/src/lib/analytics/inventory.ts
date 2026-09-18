import { prisma } from '../prisma.js';
import type { Period } from './periods.js';

export type InventorySnapshot = {
  totalSkus: number;
  unitsOnHand: number;
  unitsReserved: number;
  availableUnits: number;
  lowStockSkus: number;
  outOfStockSkus: number;
};

export async function inventorySnapshot(): Promise<InventorySnapshot> {
  const rows = await prisma.inventory.findMany({ select: { quantityOnHand: true, quantityReserved: true, lowStockThreshold: true } });
  let unitsOnHand = 0;
  let unitsReserved = 0;
  let lowStockSkus = 0;
  let outOfStockSkus = 0;
  for (const row of rows) {
    unitsOnHand += row.quantityOnHand;
    unitsReserved += row.quantityReserved;
    const available = row.quantityOnHand - row.quantityReserved;
    if (available <= 0) outOfStockSkus += 1;
    else if (available <= row.lowStockThreshold) lowStockSkus += 1;
  }
  return { totalSkus: rows.length, unitsOnHand, unitsReserved, availableUnits: unitsOnHand - unitsReserved, lowStockSkus, outOfStockSkus };
}

export async function lowStockList(limit = 50) {
  const rows = await prisma.inventory.findMany({
    include: { variant: { select: { id: true, sku: true, status: true, product: { select: { name: true, status: true } } } } },
    take: 2000,
  });
  return rows
    .map((row) => ({ ...row, available: row.quantityOnHand - row.quantityReserved }))
    .filter((row) => row.available <= row.lowStockThreshold)
    .sort((a, b) => a.available - b.available)
    .slice(0, Math.min(Math.max(limit, 1), 100))
    .map((row) => ({
      sku: row.variant.sku,
      productName: row.variant.product.name,
      variantStatus: row.variant.status,
      onHand: row.quantityOnHand,
      reserved: row.quantityReserved,
      available: row.available,
      threshold: row.lowStockThreshold,
      outOfStock: row.available <= 0,
    }));
}

export async function movementAnalytics(period: Period) {
  const groups = await prisma.inventoryMovement.groupBy({
    by: ['movementType'],
    where: { createdAt: { gte: period.start, lt: period.end } },
    _sum: { quantity: true },
    _count: { id: true },
  });
  const largest = await prisma.inventoryMovement.findMany({
    where: { createdAt: { gte: period.start, lt: period.end } },
    select: { id: true, movementType: true, quantity: true, reason: true, createdAt: true, variant: { select: { sku: true, product: { select: { name: true } } } } },
    orderBy: { quantity: 'desc' },
    take: 10,
  });
  return {
    byType: groups.map((group) => ({ movementType: group.movementType, movements: group._count.id, quantity: group._sum.quantity ?? 0 })),
    largest: largest.map((row) => ({ id: row.id, movementType: row.movementType, quantity: row.quantity, reason: row.reason, createdAt: row.createdAt, sku: row.variant.sku, productName: row.variant.product.name })),
  };
}

export async function velocityList(period: Period, limit = 20) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const sold = await prisma.orderItem.groupBy({
    by: ['variantId'],
    where: { order: { status: { not: 'CANCELLED' }, createdAt: { gte: period.start, lt: period.end } } },
    _sum: { quantity: true },
  });
  const soldMap = new Map(sold.map((row) => [row.variantId, row._sum.quantity ?? 0]));
  const inventory = await prisma.inventory.findMany({
    include: { variant: { select: { id: true, sku: true, product: { select: { name: true } } } } },
    take: 2000,
  });
  return inventory
    .map((row) => ({
      sku: row.variant.sku,
      productName: row.variant.product.name,
      soldUnits: soldMap.get(row.variantId) ?? 0,
      available: row.quantityOnHand - row.quantityReserved,
    }))
    .sort((a, b) => b.soldUnits - a.soldUnits)
    .slice(0, safeLimit);
}
