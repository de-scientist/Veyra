import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `batch-${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Batch', lastName: roleSlug, status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.upsert({ where: { slug: roleSlug }, update: {}, create: { name: roleSlug, slug: roleSlug } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

async function buildProduct(key: string, variantCount: number): Promise<{ productId: string; variantIds: string[] }> {
  const product = await prisma.product.create({
    data: { name: `Batch ${key} ${stamp}`, slug: `batch-${stamp}-${key}`, description: 'Batch endpoint fixture product.', status: 'DRAFT' },
  });
  createdProductIds.push(product.id);
  const variantIds: string[] = [];
  for (let i = 0; i < variantCount; i += 1) {
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `BCH-${stamp}-${key}-${i}`.toUpperCase().slice(0, 32), priceOverride: 1000 },
    });
    await prisma.inventory.create({ data: { variantId: variant.id, quantityOnHand: 5, quantityReserved: 0, lowStockThreshold: 2 } });
    variantIds.push(variant.id);
  }
  return { productId: product.id, variantIds };
}

beforeAll(async () => {
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.staff, 'staff');
}, 60000);

afterAll(async () => {
  const variantIds = (
    await prisma.productVariant.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } })
  ).map((row) => row.id);
  if (variantIds.length) {
    await prisma.inventoryMovement.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('batch variant + inventory endpoints', () => {
  it('denies customers on batch routes', async () => {
    expect((await call('PATCH', '/api/v1/admin/products/x/variants', emails.customer, { variants: [] })).statusCode).toBe(403);
    expect((await call('POST', '/api/v1/admin/inventory/restock-batch', emails.customer, { items: [] })).statusCode).toBe(403);
  });

  it('updates several variant prices in one transaction', async () => {
    const { productId, variantIds } = await buildProduct('price', 2);
    const response = await call('PATCH', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      variants: [
        { id: variantIds[0], price: 2500 },
        { id: variantIds[1], price: 3000, compareAtPrice: 3500 },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } }).then((row) => Number(row.priceOverride))).toBe(2500);
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[1] } }).then((row) => Number(row.compareAtPrice))).toBe(3500);
    // Audited per row with the same semantics as single updates.
    const audits = await prisma.auditLog.findMany({ where: { entity: 'ProductVariant', entityId: { in: variantIds }, action: 'PRICE_CHANGED' } });
    expect(audits.length).toBe(2);
  });

  it('rejects batch updates atomically (unknown id, duplicates, negative price)', async () => {
    const { productId, variantIds } = await buildProduct('price-fail', 2);
    const unknown = await call('PATCH', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      variants: [{ id: variantIds[0], price: 2500 }, { id: 'no-such-variant', price: 2500 }],
    });
    expect(unknown.statusCode).toBe(404);
    // Nothing was partially applied.
    expect(await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } }).then((row) => Number(row.priceOverride))).toBe(1000);

    const duplicate = await call('PATCH', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      variants: [{ id: variantIds[0], price: 2500 }, { id: variantIds[0], price: 2600 }],
    });
    expect(duplicate.statusCode).toBe(400);

    const negative = await call('PATCH', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      variants: [{ id: variantIds[0], price: -5 }],
    });
    expect(negative.statusCode).toBe(400);
  });

  it('restocks several variants in one transaction with movements', async () => {
    const { variantIds } = await buildProduct('stock', 2);
    const response = await call('POST', '/api/v1/admin/inventory/restock-batch', emails.staff, {
      reason: 'Matrix initial stock',
      items: [
        { variantId: variantIds[0], quantity: 10 },
        { variantId: variantIds[1], quantity: 5 },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(await prisma.inventory.findUniqueOrThrow({ where: { variantId: variantIds[0] } }).then((row) => row.quantityOnHand)).toBe(15);
    expect(await prisma.inventoryMovement.count({ where: { variantId: { in: variantIds }, movementType: 'IN' } })).toBe(2);
  });

  it('rejects batch restocks atomically (missing inventory, duplicates, bad quantity)', async () => {
    const { variantIds } = await buildProduct('stock-fail', 1);
    const missing = await call('POST', '/api/v1/admin/inventory/restock-batch', emails.staff, {
      reason: 'Matrix initial stock',
      items: [{ variantId: variantIds[0], quantity: 3 }, { variantId: 'no-such-variant', quantity: 3 }],
    });
    expect(missing.statusCode).toBe(404);
    expect(await prisma.inventory.findUniqueOrThrow({ where: { variantId: variantIds[0] } }).then((row) => row.quantityOnHand)).toBe(5);

    const duplicate = await call('POST', '/api/v1/admin/inventory/restock-batch', emails.staff, {
      reason: 'Matrix initial stock',
      items: [{ variantId: variantIds[0], quantity: 3 }, { variantId: variantIds[0], quantity: 4 }],
    });
    expect(duplicate.statusCode).toBe(400);

    const badQuantity = await call('POST', '/api/v1/admin/inventory/restock-batch', emails.staff, {
      reason: 'Matrix initial stock',
      items: [{ variantId: variantIds[0], quantity: 0 }],
    });
    expect(badQuantity.statusCode).toBe(400);
  });
});
