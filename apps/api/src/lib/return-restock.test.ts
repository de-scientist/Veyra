import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ReturnCondition, ReturnDisposition, ReturnType } from '@prisma/client';

import { hashPassword } from './auth.js';
import { prisma } from './prisma.js';
import { inspectReturn } from './returns.js';

/**
 * Phase 4: the inspection restock path must add sellable stock exactly once,
 * even under concurrent inspects (atomic updateMany claim on
 * restockApplied=false). A second claim fails loudly instead of
 * double-adding inventory.
 */
describe('return inspection restock claim', () => {
  const stamp = `restock-${Date.now().toString(36)}`;
  const created = { users: [] as string[], products: [] as string[], orders: [] as string[], returns: [] as string[] };
  let variantId = '';
  let actorId = '';
  let orderItemId = '';
  let orderId = '';
  let counter = 0;

  async function buildReturn(preApplied: boolean): Promise<string> {
    counter += 1;
    const request = await prisma.returnRequest.create({
      data: {
        returnNumber: `R-${stamp}-${counter}`.toUpperCase(),
        orderId,
        userId: actorId,
        type: ReturnType.REFUND,
        status: 'RECEIVED',
        reason: 'Restock claim fixture.',
      },
    });
    created.returns.push(request.id);
    await prisma.returnItem.create({
      data: {
        returnRequestId: request.id,
        orderItemId,
        variantId,
        quantity: 2,
        reason: 'Fixture item.',
        condition: ReturnCondition.UNKNOWN,
        restockApplied: preApplied,
        refundAmount: 0,
      },
    });
    return request.id;
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `${stamp}@example.com`, passwordHash: await hashPassword('password123'), firstName: 'Restock', lastName: 'Staff', status: 'ACTIVE' },
    });
    created.users.push(user.id);
    actorId = user.id;
    const product = await prisma.product.create({
      data: { name: `Restock Widget ${stamp}`, slug: `restock-widget-${stamp}`, description: 'Restock claim fixture product.', status: 'ACTIVE', basePrice: 1000 },
    });
    created.products.push(product.id);
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `RST-${stamp}`.toUpperCase().slice(0, 32), status: 'ACTIVE', priceOverride: 1000 } });
    variantId = variant.id;
    await prisma.inventory.create({ data: { variantId, quantityOnHand: 5, quantityReserved: 0, lowStockThreshold: 2 } });
    const order = await prisma.order.create({
      data: { orderNumber: `RST-ORD-${stamp}`.toUpperCase(), status: 'COMPLETED', paymentStatus: 'PAID', fulfillmentStatus: 'DELIVERED', subtotal: 2000, grandTotal: 2000, currency: 'KES' },
    });
    created.orders.push(order.id);
    orderId = order.id;
    const item = await prisma.orderItem.create({
      data: { orderId, variantId, productName: 'Restock Widget', sku: `RST-${stamp}`.toUpperCase().slice(0, 32), unitPrice: 1000, subtotal: 2000, total: 2000, quantity: 2 },
    });
    orderItemId = item.id;
  }, 60000);

  afterAll(async () => {
    const items = await prisma.returnItem.findMany({ where: { returnRequestId: { in: created.returns } }, select: { id: true } });
    void items;
    await prisma.returnItem.deleteMany({ where: { returnRequestId: { in: created.returns } } });
    await prisma.returnStatusHistory.deleteMany({ where: { returnRequestId: { in: created.returns } } });
    await prisma.returnRequest.deleteMany({ where: { id: { in: created.returns } } });
    await prisma.inventoryMovement.deleteMany({ where: { variantId, movementType: 'RETURN' } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: created.orders } } });
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.inventory.deleteMany({ where: { variantId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: { in: created.products } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  });

  it('restocks sellable inventory exactly once with a traceable movement', async () => {
    const returnId = await buildReturn(false);
    const item = await prisma.returnItem.findFirstOrThrow({ where: { returnRequestId: returnId } });
    await inspectReturn(returnId, actorId, [{ returnItemId: item.id, condition: ReturnCondition.LIKE_NEW, disposition: ReturnDisposition.RESTOCK }]);
    expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantityOnHand).toBe(7);
    expect(await prisma.returnItem.findUniqueOrThrow({ where: { id: item.id } }).then((row) => row.restockApplied)).toBe(true);
    const movements = await prisma.inventoryMovement.findMany({ where: { variantId, movementType: 'RETURN' } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({ quantity: 2, reason: 'RETURN_RESTOCKED', referenceType: 'RETURN', referenceId: returnId });
  });

  it('rejects a second restock claim instead of double-adding stock', async () => {
    const returnId = await buildReturn(true);
    const item = await prisma.returnItem.findFirstOrThrow({ where: { returnRequestId: returnId } });
    const before = (await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantityOnHand;
    await expect(inspectReturn(returnId, actorId, [{ returnItemId: item.id, condition: ReturnCondition.NEW, disposition: ReturnDisposition.RESTOCK }])).rejects.toMatchObject({
      code: 'RETURN_RESTOCK_CONFLICT',
    });
    expect((await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantityOnHand).toBe(before);
  });
});
