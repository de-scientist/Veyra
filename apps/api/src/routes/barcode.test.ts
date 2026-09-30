import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `bc-${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
let productId = '';
const variantIds: string[] = [];

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Barcode', lastName: roleSlug, status: 'ACTIVE' },
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
  const product = await prisma.product.create({
    data: { name: `Barcode Widget ${stamp}`, slug: `barcode-widget-${stamp}`, description: 'Barcode fixture product.', status: 'ACTIVE', basePrice: 1000 },
  });
  productId = product.id;
  createdProductIds.push(product.id);
  for (let i = 0; i < 3; i += 1) {
    const variant = await prisma.productVariant.create({
      data: { productId, sku: `BC-${stamp}-${i}`.toUpperCase().slice(0, 32), status: 'ACTIVE', priceOverride: 1000 },
    });
    variantIds.push(variant.id);
    await prisma.inventory.create({ data: { variantId: variant.id, quantityOnHand: 8, quantityReserved: 0, lowStockThreshold: 2 } });
  }
}, 60000);

afterAll(async () => {
  await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('barcode operations', () => {
  it('denies customers on barcode routes', async () => {
    expect((await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[0]}/barcode/generate`, emails.customer)).statusCode).toBe(403);
    expect((await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[0]}/barcode/assign`, emails.customer, { barcode: '5901234123457', source: 'MANUFACTURER' })).statusCode).toBe(403);
    expect((await call('GET', '/api/v1/admin/inventory/lookup?barcode=5901234123457', emails.customer)).statusCode).toBe(403);
  });

  it('generates internal EAN-13 barcodes server-side (never GTIN)', async () => {
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[0]}/barcode/generate`, emails.staff);
    expect(response.statusCode).toBe(200);
    const body = (response.json() as { data: { barcode: string; type: string } }).data;
    expect(body.type).toBe('EAN13');
    expect(body.barcode).toMatch(/^29\d{11}$/);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } })).barcode).toBe(body.barcode);

    // Never overwrites: second generation is refused, not replaced.
    const again = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[0]}/barcode/generate`, emails.staff);
    expect(again.statusCode).toBe(409);
    expect((again.json() as { error: { code: string } }).error.code).toBe('BARCODE_ALREADY_ASSIGNED');
  });

  it('assigns manufacturer barcodes with strict validation', async () => {
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[1]}/barcode/assign`, emails.staff, {
      barcode: '5901234123457',
      source: 'MANUFACTURER',
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: { type: string; source: string } }).data).toMatchObject({ type: 'EAN13', source: 'MANUFACTURER' });

    // Invalid check digit rejected (never length-only).
    const badCheck = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[2]}/barcode/assign`, emails.staff, {
      barcode: '5901234123450',
      type: 'EAN13',
      source: 'MANUFACTURER',
    });
    expect(badCheck.statusCode).toBe(400);
    expect((badCheck.json() as { error: { code: string } }).error.code).toBe('INVALID_BARCODE_CHECK_DIGIT');

    // Duplicate across variants refused with the owning SKU named.
    const duplicate = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[2]}/barcode/assign`, emails.staff, {
      barcode: '5901234123457',
      source: 'SUPPLIER',
    });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe('BARCODE_ALREADY_EXISTS');

    // Silent overwrite refused; explicit replacement with reason succeeds and audits.
    const silent = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[1]}/barcode/assign`, emails.staff, {
      barcode: '036000291452',
      source: 'MANUAL',
    });
    expect((silent.json() as { error: { code: string } }).error.code).toBe('BARCODE_ALREADY_ASSIGNED');
    const replaced = await call('POST', `/api/v1/admin/products/${productId}/variants/${variantIds[1]}/barcode/assign`, emails.staff, {
      barcode: '036000291452',
      source: 'MANUAL',
      replace: true,
      reason: 'Manufacturer reissued identifier',
    });
    expect(replaced.statusCode).toBe(200);
    const audits = await prisma.auditLog.findMany({ where: { entity: 'ProductVariant', entityId: variantIds[1], action: 'VARIANT_UPDATED' } });
    expect(audits.some((entry) => JSON.stringify(entry.after).includes('036000291452'))).toBe(true);
  });

  it('looks up variants by barcode (grouping tolerant) and 404s unknown codes', async () => {
    const stored = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } })).barcode as string;
    const grouped = `${stored.slice(0, 4)} ${stored.slice(4, 8)} ${stored.slice(8)}`;
    const response = await call('GET', `/api/v1/admin/inventory/lookup?barcode=${encodeURIComponent(grouped)}`, emails.staff);
    expect(response.statusCode).toBe(200);
    const body = (response.json() as { data: { variant: { sku: string }; product: { name: string }; inventory: { quantityOnHand: number } } }).data;
    expect(body.variant.sku).toBe(`BC-${stamp}-0`.toUpperCase().slice(0, 32));
    expect(body.product.name).toContain('Barcode Widget');
    expect(body.inventory.quantityOnHand).toBe(8);

    const unknown = await call('GET', '/api/v1/admin/inventory/lookup?barcode=2900000000016', emails.staff);
    expect(unknown.statusCode).toBe(404);
    expect((unknown.json() as { error: { code: string } }).error.code).toBe('BARCODE_NOT_FOUND');
  });

  it('bulk-generates only missing barcodes and preserves existing ones', async () => {
    const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } })).barcode;
    const response = await call('POST', `/api/v1/admin/products/${productId}/variants/barcodes/generate-missing`, emails.staff, { limit: 100 });
    expect(response.statusCode).toBe(200);
    const body = (response.json() as { data: { generated: Array<{ variantId: string }>; skipped: number; errors: unknown[] } }).data;
    // variantIds[2] was never assigned (duplicate attempt failed before persist).
    expect(body.generated.map((entry) => entry.variantId)).toContain(variantIds[2]);
    expect(body.generated.map((entry) => entry.variantId)).not.toContain(variantIds[0]);
    expect(body.generated.map((entry) => entry.variantId)).not.toContain(variantIds[1]);
    expect(body.skipped).toBe(2);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } })).barcode).toBe(before);
  });

  it('finds variants by barcode in inventory search', async () => {
    const stored = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantIds[0] } })).barcode as string;
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/inventory?search=${stored.slice(0, 8)}`,
      headers: { cookie: cookies[emails.staff] },
    });
    expect(response.statusCode).toBe(200);
    const body = (response.json() as { data: { inventory: Array<{ variant: { sku: string } }> } }).data;
    expect(body.inventory.some((row) => row.variant.sku === `BC-${stamp}-0`.toUpperCase().slice(0, 32))).toBe(true);
  });
});
