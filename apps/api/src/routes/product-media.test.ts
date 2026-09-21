import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { setMediaConfigForTests } from '../lib/media/cloudinary.js';
import { prisma } from '../lib/prisma.js';

vi.mock('../lib/media/cloudinary.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/media/cloudinary.js')>();
  return { ...mod, destroyMedia: vi.fn().mockResolvedValue(undefined) };
});

import { destroyMedia } from '../lib/media/cloudinary.js';

const mockedDestroy = vi.mocked(destroyMedia);

let app: FastifyInstance;

const stamp = `pmedia-${Date.now().toString(36)}`;
const emails = {
  customer: `${stamp}-customer@example.com`,
  staff: `${stamp}-staff@example.com`,
  admin: `${stamp}-admin@example.com`,
};

const createdUserIds: string[] = [];
const cookies: Record<string, string> = {};
let productA = '';
let productB = '';
let archivedProduct = '';
let variantA = '';
let variantB = '';

function fakeResult(tag: string) {
  return {
    publicId: `jb-mercantile/products/${tag}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    secureUrl: `https://res.cloudinary.com/jb-test-cloud/image/upload/${tag}.webp`,
    width: 1200,
    height: 900,
    format: 'webp',
    bytes: 111111,
  };
}

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Media', lastName: roleSlug, status: 'ACTIVE' },
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

async function call(method: string, url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

beforeAll(async () => {
  setMediaConfigForTests({
    cloudName: 'jb-test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret-never-commit',
    baseFolder: 'jb-mercantile',
  });
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.staff, 'staff');
  await createUser(emails.admin, 'admin');

  const a = await prisma.product.create({
    data: { name: `Media Product A ${stamp}`, slug: `media-a-${stamp}`, description: 'Product A for media tests.', status: 'DRAFT' },
  });
  const b = await prisma.product.create({
    data: { name: `Media Product B ${stamp}`, slug: `media-b-${stamp}`, description: 'Product B for media tests.', status: 'DRAFT' },
  });
  const archived = await prisma.product.create({
    data: { name: `Media Archived ${stamp}`, slug: `media-arch-${stamp}`, description: 'Archived product.', status: 'ARCHIVED' },
  });
  productA = a.id;
  productB = b.id;
  archivedProduct = archived.id;
  const va = await prisma.productVariant.create({ data: { productId: productA, sku: `SKU-A-${stamp}`, priceOverride: 100 } });
  const vb = await prisma.productVariant.create({ data: { productId: productB, sku: `SKU-B-${stamp}`, priceOverride: 100 } });
  variantA = va.id;
  variantB = vb.id;
}, 60000);

afterAll(async () => {
  setMediaConfigForTests(null);
  const imageIds = (await prisma.productImage.findMany({ where: { productId: { in: [productA, productB, archivedProduct] } }, select: { id: true } })).map((r) => r.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: imageIds } }] } });
  await prisma.productImage.deleteMany({ where: { productId: { in: [productA, productB, archivedProduct] } } });
  await prisma.inventory.deleteMany({ where: { variantId: { in: [variantA, variantB] } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: [variantA, variantB] } } });
  await prisma.product.deleteMany({ where: { id: { in: [productA, productB, archivedProduct] } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('product image authorization matrix', () => {
  it('guest cannot read or mutate product media', async () => {
    expect((await call('GET', `/api/v1/admin/products/${productA}/images`, null)).statusCode).toBe(401);
    expect((await call('POST', `/api/v1/admin/products/${productA}/images`, null, fakeResult('x'))).statusCode).toBe(401);
  });

  it('customer is denied on every product-media route', async () => {
    expect((await call('GET', `/api/v1/admin/products/${productA}/images`, emails.customer)).statusCode).toBe(403);
    expect((await call('POST', `/api/v1/admin/products/${productA}/images`, emails.customer, fakeResult('x'))).statusCode).toBe(403);
    expect(
      (await call('PATCH', `/api/v1/admin/products/${productA}/images/nope`, emails.customer, { altText: 'x' })).statusCode,
    ).toBe(403);
    expect(
      (await call('DELETE', `/api/v1/admin/products/${productA}/images/nope`, emails.customer)).statusCode,
    ).toBe(403);
  });

  it('staff reads an empty gallery', async () => {
    const response = await call('GET', `/api/v1/admin/products/${productA}/images`, emails.staff);
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: unknown[] }).data).toEqual([]);
  });
});

describe('product image CRUD', () => {
  let firstId = '';
  let secondId = '';

  it('creates the first image as primary at position 0', async () => {
    const response = await call('POST', `/api/v1/admin/products/${productA}/images`, emails.staff, {
      ...fakeResult('first'),
      altText: 'Blue blender',
    });
    expect(response.statusCode).toBe(200);
    const image = (response.json() as { data: Record<string, unknown> }).data;
    firstId = image.id as string;
    expect(image.isPrimary).toBe(true);
    expect(image.sortOrder).toBe(0);
    expect(image.altText).toBe('Blue blender');
    expect(image.url).toBe(image.secureUrl);
  });

  it('creates subsequent images as secondary in order', async () => {
    const response = await call('POST', `/api/v1/admin/products/${productA}/images`, emails.staff, fakeResult('second'));
    expect(response.statusCode).toBe(200);
    const image = (response.json() as { data: Record<string, unknown> }).data;
    secondId = image.id as string;
    expect(image.isPrimary).toBe(false);
    expect(image.sortOrder).toBe(1);
  });

  it('rejects foreign provider results, unknown products, and archived products', async () => {
    const foreign = await call('POST', `/api/v1/admin/products/${productA}/images`, emails.staff, {
      ...fakeResult('evil'),
      publicId: 'other-folder/evil',
    });
    expect(foreign.statusCode).toBe(400);
    const missing = await call('POST', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/images', emails.staff, fakeResult('x'));
    expect(missing.statusCode).toBe(404);
    const archived = await call('POST', `/api/v1/admin/products/${archivedProduct}/images`, emails.staff, fakeResult('x'));
    expect(archived.statusCode).toBe(409);
  });

  it('rejects cross-product variant assignment', async () => {
    const response = await call('POST', `/api/v1/admin/products/${productA}/images`, emails.staff, {
      ...fakeResult('v'),
      variantId: variantB,
    });
    expect(response.statusCode).toBe(404);
  });

  it('updates alt text but never provider fields', async () => {
    const response = await call('PATCH', `/api/v1/admin/products/${productA}/images/${firstId}`, emails.staff, {
      altText: '  Red  blender  ',
      // @ts-expect-error tamper probe: schema must strip provider fields
      publicId: 'jb-mercantile/products/tampered',
      secureUrl: 'https://example.com/tampered.webp',
    });
    expect(response.statusCode).toBe(200);
    const image = (response.json() as { data: Record<string, unknown> }).data;
    expect(image.altText).toBe('Red blender');
    expect(image.publicId).not.toBe('jb-mercantile/products/tampered');
  });

  it('blocks cross-product image access (IDOR/BOLA → 404)', async () => {
    expect((await call('GET', `/api/v1/admin/products/${productB}/images`, emails.staff)).statusCode).toBe(200);
    expect(
      (await call('PATCH', `/api/v1/admin/products/${productB}/images/${firstId}`, emails.staff, { altText: 'x' })).statusCode,
    ).toBe(404);
    expect(
      (await call('DELETE', `/api/v1/admin/products/${productB}/images/${firstId}`, emails.staff)).statusCode,
    ).toBe(404);
    expect(
      (await call('POST', `/api/v1/admin/products/${productB}/images/${firstId}/primary`, emails.staff)).statusCode,
    ).toBe(404);
  });

  it('sets primary transactionally (exactly one primary)', async () => {
    const response = await call('POST', `/api/v1/admin/products/${productA}/images/${secondId}/primary`, emails.staff);
    expect(response.statusCode).toBe(200);
    const images = (response.json() as { data: Array<{ id: string; isPrimary: boolean }> }).data;
    expect(images.filter((i) => i.isPrimary)).toHaveLength(1);
    expect(images.find((i) => i.isPrimary)?.id).toBe(secondId);
  });

  it('reorders atomically and rejects partial/foreign sets', async () => {
    const bad = await call('PATCH', `/api/v1/admin/products/${productA}/images/reorder`, emails.staff, { imageIds: [firstId] });
    expect(bad.statusCode).toBe(400);
    const dupe = await call('PATCH', `/api/v1/admin/products/${productA}/images/reorder`, emails.staff, {
      imageIds: [firstId, firstId],
    });
    expect(dupe.statusCode).toBe(400);
    const ok = await call('PATCH', `/api/v1/admin/products/${productA}/images/reorder`, emails.staff, {
      imageIds: [secondId, firstId],
    });
    expect(ok.statusCode).toBe(200);
    const images = (ok.json() as { data: Array<{ id: string; sortOrder: number; isPrimary: boolean }> }).data;
    expect(images.map((i) => i.id)).toEqual([secondId, firstId]);
    // Pattern A: reorder never changes primary status.
    expect(images.find((i) => i.id === secondId)?.isPrimary).toBe(true);
  });

  it('replaces the asset while preserving identity, then cleans the old asset', async () => {
    mockedDestroy.mockClear();
    const before = (await call('GET', `/api/v1/admin/products/${productA}/images`, emails.staff).then((r) =>
      (r.json() as { data: Array<Record<string, unknown>> }).data.find((i) => i.id === firstId),
    )) as Record<string, unknown>;
    const response = await call('POST', `/api/v1/admin/products/${productA}/images/${firstId}/replace`, emails.staff, {
      ...fakeResult('replacement'),
      altText: 'Replacement blender',
    });
    expect(response.statusCode).toBe(200);
    const image = (response.json() as { data: Record<string, unknown> }).data;
    expect(image.id).toBe(firstId);
    expect(image.publicId).not.toBe(before.publicId);
    expect(image.sortOrder).toBe(before.sortOrder);
    expect(image.altText).toBe('Replacement blender');
    expect(mockedDestroy).toHaveBeenCalledWith(before.publicId);
    expect(image.providerCleanup).toBe('deleted');
  });

  it('deletes the primary and promotes the next image deterministically', async () => {
    // firstId is secondary now; make it primary, then delete it.
    await call('POST', `/api/v1/admin/products/${productA}/images/${firstId}/primary`, emails.staff);
    const response = await call('DELETE', `/api/v1/admin/products/${productA}/images/${firstId}`, emails.staff);
    expect(response.statusCode).toBe(200);
    const data = (response.json() as { data: { images: Array<{ id: string; isPrimary: boolean }>; providerCleanup: string } }).data;
    expect(data.images).toHaveLength(1);
    expect(data.images[0]?.isPrimary).toBe(true);
    expect(data.providerCleanup).toBe('deleted');
  });

  it('handles concurrent primary updates and double deletes safely', async () => {
    const third = (await call('POST', `/api/v1/admin/products/${productA}/images`, emails.staff, fakeResult('third')).then(
      (r) => (r.json() as { data: { id: string } }).data,
    ));
    const [a, b] = await Promise.all([
      call('POST', `/api/v1/admin/products/${productA}/images/${secondId}/primary`, emails.staff),
      call('POST', `/api/v1/admin/products/${productA}/images/${third.id}/primary`, emails.staff),
    ]);
    expect(a.statusCode).toBe(200);
    expect(b.statusCode).toBe(200);
    const primaries = await prisma.productImage.count({ where: { productId: productA, isPrimary: true } });
    expect(primaries).toBe(1);

    const [d1, d2] = await Promise.all([
      call('DELETE', `/api/v1/admin/products/${productA}/images/${third.id}`, emails.staff),
      call('DELETE', `/api/v1/admin/products/${productA}/images/${third.id}`, emails.staff),
    ]);
    const codes = [d1.statusCode, d2.statusCode].sort();
    expect(codes).toEqual([200, 404]);
  });
});
