import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';

import { prisma } from './prisma.js';
import { releaseStaleReservations } from './reservations.js';

const stamp = `stale-${Date.now().toString(36)}`;
const created = { products: [] as string[], variants: [] as string[], orders: [] as string[] };

async function fixture(status: 'PENDING' | 'CONFIRMED', paymentStatus: 'UNPAID' | 'PAID', reservationAgeMinutes: number, tag: string) {
  const product = await prisma.product.create({ data: { name: `Stale ${tag}`, slug: `${stamp}-${tag}`, status: 'DRAFT' } });
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `${stamp}-${tag}`.toUpperCase(), status: 'ACTIVE' } });
  await prisma.inventory.create({ data: { variantId: variant.id, quantityOnHand: 10, quantityReserved: 2 } });
  const order = await prisma.order.create({
    data: { orderNumber: `STALE-${stamp}-${tag}`.toUpperCase().slice(0, 30), status, paymentStatus, subtotal: new Prisma.Decimal(100), grandTotal: new Prisma.Decimal(100) },
  });
  const reservation = await prisma.inventoryReservation.create({
    data: {
      variantId: variant.id,
      orderId: order.id,
      quantity: 2,
      status: 'ACTIVE',
      createdAt: new Date(Date.now() - reservationAgeMinutes * 60 * 1000),
    },
  });
  created.products.push(product.id);
  created.variants.push(variant.id);
  created.orders.push(order.id);
  return { variant, order, reservation };
}

beforeAll(async () => {
  await fixture('PENDING', 'UNPAID', 120, 'old-unpaid');
  await fixture('PENDING', 'UNPAID', 5, 'fresh-unpaid');
  await fixture('CONFIRMED', 'PAID', 180, 'old-paid');
});

afterAll(async () => {
  await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: created.variants } } });
  await prisma.inventoryReservation.deleteMany({ where: { variantId: { in: created.variants } } });
  await prisma.inventory.deleteMany({ where: { variantId: { in: created.variants } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: created.variants } } });
  await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
  await prisma.product.deleteMany({ where: { id: { in: created.products } } });
});

describe('stale reservation release (Phase I regression)', () => {
  it('releases only stale ACTIVE reservations on PENDING+UNPAID orders', async () => {
    const released = await releaseStaleReservations(prisma);
    expect(released).toBe(1);

    const oldUnpaid = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: created.orders[0] } });
    expect(oldUnpaid.status).toBe('RELEASED');
    expect(oldUnpaid.releasedAt).not.toBeNull();

    const inventory = await prisma.inventory.findFirstOrThrow({ where: { variantId: created.variants[0] } });
    expect(inventory.quantityReserved).toBe(0);
    expect(inventory.quantityOnHand).toBe(10);

    const movement = await prisma.inventoryMovement.findFirstOrThrow({
      where: { variantId: created.variants[0], movementType: 'RELEASED', reason: 'STALE_RESERVATION_RELEASED' },
    });
    expect(movement.quantity).toBe(2);

    // Fresh and paid reservations are untouched.
    expect((await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: created.orders[1] } })).status).toBe('ACTIVE');
    expect((await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: created.orders[2] } })).status).toBe('ACTIVE');
  });

  it('is idempotent: a second sweep releases nothing', async () => {
    expect(await releaseStaleReservations(prisma)).toBe(0);
  });
});
