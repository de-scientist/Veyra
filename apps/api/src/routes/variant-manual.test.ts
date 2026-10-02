import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * v8-RC Limitation B remediation: manual POST /variants must persist
 * attribute mappings atomically. Previously the endpoint validated
 * `attributeValues` but created only the ProductVariant + inventory rows,
 * leaving mapping-less variants that only the publish gate caught later.
 */

let app: FastifyInstance;

const stamp = `vm-${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];

let categoryId = '';
let colorAttrId = '';
let sizeAttrId = '';
let blackValueId = '';
let whiteValueId = '';
let mValueId = '';
let productId = '';

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Vm', lastName: roleSlug, status: 'ACTIVE' },
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
  const category = await prisma.category.create({
    data: { name: `Vm Cat ${stamp}`, slug: `vm-cat-${stamp}`, status: 'ACTIVE', code: `VM${stamp.slice(-3).toUpperCase()}`, skuTemplate: '{CATEGORY}-{COLOR}-{SIZE}' },
  });
  categoryId = category.id;
  const color = await prisma.attribute.create({ data: { name: `Vm Color ${stamp}`, slug: `vm-${stamp}-color`, type: 'STRING' } });
  const size = await prisma.attribute.create({ data: { name: `Vm Size ${stamp}`, slug: `vm-${stamp}-size`, type: 'STRING' } });
  colorAttrId = color.id;
  sizeAttrId = size.id;
  const black = await prisma.attributeValue.create({ data: { attributeId: color.id, value: 'Black', code: 'BLK' } });
  const white = await prisma.attributeValue.create({ data: { attributeId: color.id, value: 'White', code: 'WHT' } });
  const m = await prisma.attributeValue.create({ data: { attributeId: size.id, value: 'M', code: 'M' } });
  blackValueId = black.id;
  whiteValueId = white.id;
  mValueId = m.id;
  const product = await prisma.product.create({
    data: {
      name: `Vm Product ${stamp}`,
      slug: `vm-product-${stamp}`,
      description: 'Manual variant integrity fixture product.',
      status: 'DRAFT',
      categoryId,
      styleCode: 'VM1',
    },
  });
  productId = product.id;
  // Manual variant creation gates on publish readiness incl. media
  // (pre-existing route behavior): attach a fixture image first.
  await prisma.productImage.create({
    data: { productId, url: 'https://images.unsplash.com/fixture', altText: 'Fixture', isPrimary: true, sortOrder: 0 },
  });
}, 60000);

afterAll(async () => {
  const variantIds = (await prisma.productVariant.findMany({ where: { productId }, select: { id: true } })).map((row) => row.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: [...variantIds, productId] } }] } });
  if (variantIds.length) {
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.attributeValue.deleteMany({ where: { attributeId: { in: [colorAttrId, sizeAttrId] } } });
  await prisma.attribute.deleteMany({ where: { id: { in: [colorAttrId, sizeAttrId] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('manual POST /variants attribute integrity', () => {
  it('denies guests and customers', async () => {
    expect((await call('POST', `/api/v1/admin/products/${productId}/variants`, null, { sku: 'X', price: 1 })).statusCode).toBe(401);
    expect((await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.customer, { sku: 'X', price: 1 })).statusCode).toBe(403);
  });

  it('creates a valid variant with legacy {attributeId, value} mappings persisted', async () => {
    const sku = `VM-${stamp}-BLK-M`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 4500,
      attributeValues: [
        { attributeId: colorAttrId, value: 'Black' },
        { attributeId: sizeAttrId, value: 'M' },
      ],
    });
    expect(response.statusCode).toBe(200);
    const variant = response.json() as { data: { id: string; sku: string; variantAttributeValues: Array<{ attributeId: string; attributeValueId: string }> } };
    expect(variant.data.sku).toBe(sku);

    // DB rows exist: variant + both mappings + inventory.
    const stored = await prisma.productVariant.findUnique({
      where: { id: variant.data.id },
      include: { variantAttributeValues: true, inventory: true },
    });
    expect(stored).toBeTruthy();
    expect(stored?.variantAttributeValues).toHaveLength(2);
    expect(stored?.inventory?.quantityOnHand).toBe(0);

    // Response exposes the mappings.
    expect(variant.data.variantAttributeValues).toHaveLength(2);
    const valueIds = variant.data.variantAttributeValues.map((m) => m.attributeValueId).sort();
    expect(valueIds).toEqual([blackValueId, mValueId].sort());

    // Structured VARIANT_CREATED audit with no secrets.
    const audits = await prisma.auditLog.findMany({
      where: { entity: 'ProductVariant', entityId: variant.data.id, action: 'VARIANT_CREATED' },
    });
    expect(audits).toHaveLength(1);
    const after = audits[0]?.after as unknown as Record<string, unknown>;
    expect(after.entity).toBe('ProductVariant');
    expect(after.productId).toBe(productId);
    expect(after.operation).toBe('VARIANT_CREATED');
    expect(after.variantId).toBe(variant.data.id);
    expect(after.sku).toBe(sku);
    const serialized = JSON.stringify(after).toLowerCase();
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('token');
  });

  it('creates a valid variant with {attributeValueId} mappings', async () => {
    const sku = `VM-${stamp}-WHT-M`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 4600,
      attributeValues: [{ attributeValueId: whiteValueId }, { attributeId: sizeAttrId, attributeValueId: mValueId }],
    });
    expect(response.statusCode).toBe(200);
    const variant = response.json() as { data: { id: string; variantAttributeValues: Array<{ attributeValueId: string }> } };
    expect(variant.data.variantAttributeValues).toHaveLength(2);
    const stored = await prisma.variantAttributeValue.count({ where: { variantId: variant.data.id } });
    expect(stored).toBe(2);
  });

  it('rejects missing mappings without creating a variant', async () => {
    const sku = `VM-${stamp}-EMPTY`.toUpperCase();
    const before = await prisma.productVariant.count({ where: { productId } });
    for (const payload of [{ sku, price: 100 }, { sku, price: 100, attributeValues: [] }]) {
      const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, payload);
      expect(response.statusCode).toBe(400);
    }
    expect(await prisma.productVariant.count({ where: { productId } })).toBe(before);
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });

  it('rejects missing mappings even for INACTIVE variants', async () => {
    const sku = `VM-${stamp}-INACTIVE`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      status: 'INACTIVE',
    });
    expect(response.statusCode).toBe(400);
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });

  it('rejects unknown attribute values and rolls back', async () => {
    const sku = `VM-${stamp}-BADVAL`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      attributeValues: [{ attributeValueId: '00000000-0000-0000-0000-000000000000' }],
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('ATTRIBUTE_VALUE_NOT_FOUND');
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });

  it('rejects legacy value strings that do not exist', async () => {
    const sku = `VM-${stamp}-BADSTR`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      attributeValues: [{ attributeId: colorAttrId, value: 'Neon Invisible' }],
    });
    expect(response.statusCode).toBe(400);
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });

  it('rejects attribute values that belong to a different attribute', async () => {
    const sku = `VM-${stamp}-WRONGATTR`.toUpperCase();
    // mValueId belongs to Size, not Color.
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      attributeValues: [{ attributeId: colorAttrId, attributeValueId: mValueId }],
    });
    expect(response.statusCode).toBe(400);
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });

  it('rejects duplicate attribute combinations', async () => {
    const sku = `VM-${stamp}-DUPCOMBO`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      attributeValues: [
        { attributeId: colorAttrId, value: 'Black' },
        { attributeId: sizeAttrId, value: 'M' },
      ],
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('DUPLICATE_VARIANT_COMBINATION');
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });

  it('rejects duplicate SKUs', async () => {
    const sku = `VM-${stamp}-BLK-M`.toUpperCase();
    // White-alone is a combination no variant holds, isolating the SKU path.
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      attributeValues: [{ attributeValueId: whiteValueId }],
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('SKU_ALREADY_EXISTS');
  });

  it('rejects the same attribute twice in one request', async () => {
    const sku = `VM-${stamp}-DUPATTR`.toUpperCase();
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants`, emails.staff, {
      sku,
      price: 100,
      attributeValues: [{ attributeValueId: blackValueId }, { attributeValueId: whiteValueId }],
    });
    expect(response.statusCode).toBe(400);
    expect(await prisma.productVariant.findUnique({ where: { sku } })).toBeNull();
  });
});

describe('publish readiness defense in depth', () => {
  it('refuses to publish a product whose variant lacks mappings, then publishes once mappings exist', async () => {
    const malformed = await prisma.productVariant.create({
      data: { productId, sku: `VM-${stamp}-MALFORMED`.toUpperCase(), priceOverride: 999 },
    });
    try {
      const blocked = await call('PATCH', `/api/v1/admin/products/${productId}`, emails.staff, { status: 'ACTIVE' });
      // Other variants are valid, but the malformed ACTIVE variant must block publish.
      // Note: the two valid variants keep the product publishable on every
      // other axis, isolating the malformed-variant signal.
      expect(blocked.statusCode).toBe(400);
      const codes = (blocked.json() as { error: { details: { issues: Array<{ code: string }> } } }).error.details.issues.map((i) => i.code);
      expect(codes).toContain('MISSING_ATTRIBUTES');

      // Backfill the missing mapping (simulating remediation of historical data).
      await prisma.variantAttributeValue.create({
        data: { variantId: malformed.id, attributeId: colorAttrId, attributeValueId: blackValueId },
      });
      // Still blocked: Black/M without Size collides with the existing
      // Black+M manual variant combination-wise for readiness? No — readiness
      // only checks per-variant attributes + duplicate combos. Black-alone vs
      // Black+M are distinct combos, but the malformed variant now has only
      // one mapping while siblings have two; give it the full distinct combo
      // by using White (no Size) — still distinct from White+M. Keep single
      // mapping: valid per readiness (≥1 attribute, no duplicate).
      const publishable = await call('PATCH', `/api/v1/admin/products/${productId}`, emails.staff, { status: 'ACTIVE' });
      expect(publishable.statusCode).toBe(200);

      // Restore DRAFT so other suites sharing this product are unaffected.
      await call('PATCH', `/api/v1/admin/products/${productId}`, emails.staff, { status: 'DRAFT' });
    } finally {
      await prisma.variantAttributeValue.deleteMany({ where: { variantId: malformed.id } });
      await prisma.productVariant.delete({ where: { id: malformed.id } });
    }
  });
});
