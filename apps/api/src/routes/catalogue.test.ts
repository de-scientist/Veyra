import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `cat-${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Cat', lastName: roleSlug, status: 'ACTIVE' },
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

beforeAll(async () => {
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.staff, 'staff');
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.attribute.deleteMany({ where: { slug: { startsWith: `crud-${stamp}` } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: `crud-${stamp}` } } });
  await prisma.collection.deleteMany({ where: { slug: { startsWith: `crud-${stamp}` } } });
});

describe('catalogue admin CRUD', () => {
  it('denies customers on attribute and taxonomy routes', async () => {
    expect((await call('PATCH', '/api/v1/admin/attributes/x', emails.customer, { name: 'Y' })).statusCode).toBe(403);
    expect((await call('DELETE', '/api/v1/admin/attributes/x', emails.customer)).statusCode).toBe(403);
    expect((await call('DELETE', '/api/v1/admin/categories/x', emails.customer)).statusCode).toBe(403);
    expect((await call('DELETE', '/api/v1/admin/collections/x', emails.customer)).statusCode).toBe(403);
  });

  it('updates attribute names without changing slugs', async () => {
    const created = await call('POST', '/api/v1/admin/attributes', emails.staff, { name: `Crud Attr ${stamp}` });
    expect(created.statusCode).toBe(200);
    const attr = (created.json() as { data: { id: string; slug: string } }).data;
    const updated = await call('PATCH', `/api/v1/admin/attributes/${attr.id}`, emails.staff, { name: `Renamed ${stamp}` });
    expect(updated.statusCode).toBe(200);
    const body = (updated.json() as { data: { name: string; slug: string } }).data;
    expect(body.name).toBe(`Renamed ${stamp}`);
    expect(body.slug).toBe(attr.slug);
    // Cleanup inside the test to keep the suite hermetic.
    expect((await call('DELETE', `/api/v1/admin/attributes/${attr.id}`, emails.staff)).statusCode).toBe(200);
  });

  it('refuses to delete attributes and values that variants use', async () => {
    const attribute = await prisma.attribute.create({ data: { name: `Used ${stamp}`, slug: `crud-${stamp}-used`, type: 'STRING' } });
    const value = await prisma.attributeValue.create({ data: { attributeId: attribute.id, value: 'Used' } });
    const product = await prisma.product.create({
      data: { name: `Used ${stamp}`, slug: `crud-${stamp}-used`, description: 'Used attribute fixture.', status: 'DRAFT' },
    });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `CRUD-${stamp}`, priceOverride: 10 } });
    await prisma.variantAttributeValue.create({ data: { variantId: variant.id, attributeId: attribute.id, attributeValueId: value.id } });

    expect((await call('DELETE', `/api/v1/admin/attributes/values/${value.id}`, emails.staff)).statusCode).toBe(409);
    expect((await call('DELETE', `/api/v1/admin/attributes/${attribute.id}`, emails.staff)).statusCode).toBe(409);

    await prisma.variantAttributeValue.deleteMany({ where: { variantId: variant.id } });
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    expect((await call('DELETE', `/api/v1/admin/attributes/values/${value.id}`, emails.staff)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/v1/admin/attributes/${attribute.id}`, emails.staff)).statusCode).toBe(200);
  });

  it('archives empty categories but guards products and children', async () => {
    const parent = await prisma.category.create({ data: { name: `Parent ${stamp}`, slug: `crud-${stamp}-parent`, status: 'ACTIVE' } });
    const child = await prisma.category.create({ data: { name: `Child ${stamp}`, slug: `crud-${stamp}-child`, status: 'ACTIVE', parentId: parent.id } });
    expect((await call('DELETE', `/api/v1/admin/categories/${parent.id}`, emails.staff)).statusCode).toBe(409);
    const product = await prisma.product.create({
      data: { name: `Cat Prod ${stamp}`, slug: `crud-${stamp}-prod`, description: 'Category guard fixture.', status: 'DRAFT', categoryId: child.id },
    });
    expect((await call('DELETE', `/api/v1/admin/categories/${child.id}`, emails.staff)).statusCode).toBe(409);
    await prisma.product.delete({ where: { id: product.id } });
    expect((await call('DELETE', `/api/v1/admin/categories/${child.id}`, emails.staff)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/v1/admin/categories/${parent.id}`, emails.staff)).statusCode).toBe(200);
    const archived = await prisma.category.findUnique({ where: { id: parent.id } });
    expect(archived?.deletedAt).not.toBeNull();
  });

  it('archives collections and drops memberships', async () => {
    const created = await call('POST', '/api/v1/admin/collections', emails.staff, { name: `Crud Col ${stamp}` });
    expect(created.statusCode).toBe(200);
    const collection = (created.json() as { data: { id: string } }).data;
    expect((await call('DELETE', `/api/v1/admin/collections/${collection.id}`, emails.staff)).statusCode).toBe(200);
    expect((await call('DELETE', `/api/v1/admin/collections/${collection.id}`, emails.staff)).statusCode).toBe(404);
  });

  it('enforces SKU normalization, uniqueness and barcode rules on variants', async () => {
    const category = await prisma.category.create({
      data: { name: `Sku ${stamp}`, slug: `crud-${stamp}-sku`, status: 'ACTIVE', code: `S${stamp.slice(-4).toUpperCase()}`, skuTemplate: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}' },
    });
    const attribute = await prisma.attribute.create({ data: { name: `Sku Color ${stamp}`, slug: `crud-${stamp}-sku-color`, type: 'STRING' } });
    await prisma.attributeValue.create({ data: { attributeId: attribute.id, value: 'Black', code: 'BLK' } });
    await prisma.attributeValue.create({ data: { attributeId: attribute.id, value: 'White', code: 'WHT' } });
    await prisma.attributeValue.create({ data: { attributeId: attribute.id, value: 'Red', code: 'RED' } });
    const product = await prisma.product.create({
      data: { name: `Sku ${stamp}`, slug: `crud-${stamp}-sku`, description: 'SKU foundation fixture product.', status: 'DRAFT', categoryId: category.id, styleCode: 'SK1' },
    });
    // Variant creation gates on publish readiness incl. media (pre-existing
    // route behavior): attach a fixture image first.
    await prisma.productImage.create({
      data: { productId: product.id, url: 'https://images.unsplash.com/fixture', altText: 'Fixture', isPrimary: true, sortOrder: 0 },
    });
    const sku = `P1-${stamp}-BLK-M`;
    const attrs = [{ attributeId: attribute.id, value: 'Black' }];
    try {
      // Lowercase + padded manual SKU is normalized, not rejected.
      const created = await call('POST', `/api/v1/admin/products/${product.id}/variants`, emails.staff, {
        sku: `  ${sku.toLowerCase()}  `, price: 1500, attributeValues: attrs,
      });
      expect(created.statusCode).toBe(200);
      expect((created.json() as { data: { sku: string } }).data.sku).toBe(sku.toUpperCase());

      // Duplicate SKU is rejected deterministically (DB unique constraint).
      const duplicate = await call('POST', `/api/v1/admin/products/${product.id}/variants`, emails.staff, {
        sku, price: 1500, attributeValues: attrs,
      });
      expect(duplicate.statusCode).toBe(409);
      expect((duplicate.json() as { error: { code: string } }).error.code).toBe('SKU_ALREADY_EXISTS');

      // Invalid SKU shape is rejected before persistence.
      const invalid = await call('POST', `/api/v1/admin/products/${product.id}/variants`, emails.staff, {
        sku: 'AB', price: 1500, attributeValues: attrs,
      });
      expect(invalid.statusCode).toBe(400);

      // Invalid barcode is rejected; valid barcode persists and collides on reuse.
      // Each creation uses a distinct attribute value: manual variants now
      // persist mappings, so reusing one value would (correctly) collide on
      // the attribute combination instead of exercising the barcode path.
      const badBarcode = await call('POST', `/api/v1/admin/products/${product.id}/variants`, emails.staff, {
        sku: `${sku}-2`, price: 1500, barcode: 'SHORT', attributeValues: attrs,
      });
      expect(badBarcode.statusCode).toBe(400);
      const withBarcode = await call('POST', `/api/v1/admin/products/${product.id}/variants`, emails.staff, {
        sku: `${sku}-2`, price: 1500, barcode: '6001234567890', attributeValues: [{ attributeId: attribute.id, value: 'White' }],
      });
      expect(withBarcode.statusCode).toBe(200);
      const clash = await call('POST', `/api/v1/admin/products/${product.id}/variants`, emails.staff, {
        sku: `${sku}-3`, price: 1500, barcode: '6001234567890', attributeValues: [{ attributeId: attribute.id, value: 'Red' }],
      });
      expect(clash.statusCode).toBe(409);
      expect((clash.json() as { error: { code: string } }).error.code).toBe('BARCODE_ALREADY_EXISTS');
    } finally {
      await prisma.inventory.deleteMany({ where: { variant: { productId: product.id } } });
      await prisma.productVariant.deleteMany({ where: { productId: product.id } });
      await prisma.product.delete({ where: { id: product.id } });
      await prisma.attributeValue.deleteMany({ where: { attributeId: attribute.id } });
      await prisma.attribute.delete({ where: { id: attribute.id } });
      await prisma.category.delete({ where: { id: category.id } });
    }
  });

  it('keeps variant SKUs immutable when products are edited', async () => {
    const product = await prisma.product.create({
      data: { name: `Locked ${stamp}`, slug: `crud-${stamp}-locked`, description: 'SKU immutability fixture.', status: 'DRAFT', styleCode: 'LK1' },
    });
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `LOCK-${stamp}`, priceOverride: 10 } });
    try {
      // Unknown PATCH keys (sku) are stripped; the stored SKU never changes
      // as a side effect of editing the variant or its product.
      const patched = await call('PATCH', `/api/v1/admin/products/${product.id}/variants/${variant.id}`, emails.staff, {
        name: 'Renamed', sku: 'HACKED-01',
      } as Record<string, unknown>);
      expect(patched.statusCode).toBe(200);
      expect((patched.json() as { data: { name: string } }).data.name).toBe('Renamed');
      const stored = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect(stored.sku).toBe(`LOCK-${stamp}`);

      const productPatched = await call('PATCH', `/api/v1/admin/products/${product.id}`, emails.staff, {
        name: `Renamed Product ${stamp}`, styleCode: 'LK2',
      });
      expect(productPatched.statusCode).toBe(200);
      const storedAgain = await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
      expect(storedAgain.sku).toBe(`LOCK-${stamp}`);
    } finally {
      await prisma.productVariant.delete({ where: { id: variant.id } });
      await prisma.product.delete({ where: { id: product.id } });
    }
  });

  it('validates category SKU templates and dictionary codes', async () => {
    const badTemplate = await call('POST', '/api/v1/admin/categories', emails.staff, {
      name: `Bad Tpl ${stamp}`, skuTemplate: '{BRAND}-{NOPE}',
    });
    expect(badTemplate.statusCode).toBe(400);
    const badCode = await call('POST', '/api/v1/admin/categories', emails.staff, {
      name: `Bad Code ${stamp}`, code: 'TOOLONGCODE',
    });
    expect(badCode.statusCode).toBe(400);
  });

  it('serves admin product detail for drafts', async () => {
    const product = await prisma.product.create({
      data: { name: `Detail ${stamp}`, slug: `crud-${stamp}-detail`, description: 'Admin detail fixture.', status: 'DRAFT' },
    });
    try {
      expect((await call('GET', `/api/v1/admin/products/${product.id}`, emails.customer)).statusCode).toBe(403);
      const response = await call('GET', `/api/v1/admin/products/${product.id}`, emails.staff);
      expect(response.statusCode).toBe(200);
      expect((response.json() as { data: { slug: string } }).data.slug).toBe(`crud-${stamp}-detail`);
      expect((await call('GET', '/api/v1/admin/products/no-such-id', emails.staff)).statusCode).toBe(404);
    } finally {
      await prisma.product.delete({ where: { id: product.id } });
    }
  });
});
