import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { setMediaConfigForTests } from '../lib/media/cloudinary.js';
import { prisma } from '../lib/prisma.js';

/**
 * Product-creation limitations remediation: reproducible runtime workflow.
 * Exercises the full lifecycle against the real database via HTTP injection:
 * draft → readiness rejection (incl. direct-API bypass) → variants →
 * inventory → media (metadata persistence path; Cloudinary bytes are out of
 * scope headless) → collections → draft autosave incl. stale-write safety →
 * publish → storefront visibility.
 */

let app: FastifyInstance;

const stamp = `lc-${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdAttributeIds: string[] = [];
const createdCollectionIds: string[] = [];

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Lc', lastName: roleSlug, status: 'ACTIVE' },
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

async function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

function fakeImage(tag: string) {
  return {
    publicId: `jb-mercantile/products/${tag}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    secureUrl: `https://res.cloudinary.com/jb-test-cloud/image/upload/${tag}.webp`,
    width: 1200,
    height: 900,
    format: 'webp',
    bytes: 111111,
  };
}

let categoryId = '';
let colorAttrId = '';
let blackValueId = '';
let draftId = '';
let draftSlug = '';

beforeAll(async () => {
  setMediaConfigForTests({ cloudName: 'jb-test-cloud', apiKey: 'test-key', apiSecret: 'test-secret-never-commit', baseFolder: 'jb-mercantile' });
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.staff, 'staff');
  const category = await prisma.category.create({
    data: { name: `Lc Cat ${stamp}`, slug: `lc-cat-${stamp}`, status: 'ACTIVE', code: `LC${stamp.slice(-3).toUpperCase()}`, skuTemplate: '{CATEGORY}-{COLOR}' },
  });
  categoryId = category.id;
  createdCategoryIds.push(category.id);
  const attribute = await prisma.attribute.create({ data: { name: 'Color', slug: `lc-${stamp}-color`, type: 'STRING' } });
  colorAttrId = attribute.id;
  createdAttributeIds.push(attribute.id);
  const black = await prisma.attributeValue.create({ data: { attributeId: attribute.id, value: 'Black', code: 'BLK' } });
  blackValueId = black.id;
}, 60000);

afterAll(async () => {
  setMediaConfigForTests(null);
  const variantIds = (await prisma.productVariant.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } })).map((row) => row.id);
  const imageIds = (await prisma.productImage.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } })).map((row) => row.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: [...variantIds, ...imageIds, ...createdProductIds] } }] } });
  if (variantIds.length) {
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  await prisma.productImage.deleteMany({ where: { productId: { in: createdProductIds } } });
  await prisma.productCollection.deleteMany({ where: { productId: { in: createdProductIds } } });
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.attributeValue.deleteMany({ where: { attributeId: { in: createdAttributeIds } } });
  await prisma.attribute.deleteMany({ where: { id: { in: createdAttributeIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.collection.deleteMany({ where: { id: { in: createdCollectionIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('server-side publish readiness gate', () => {
  it('rejects unauthenticated and customer publish attempts', async () => {
    expect((await call('PATCH', '/api/v1/admin/products/nope', null, { status: 'ACTIVE' })).statusCode).toBe(401);
    expect((await call('PATCH', '/api/v1/admin/products/nope', emails.customer, { status: 'ACTIVE' })).statusCode).toBe(403);
  });

  it('rejects creating directly ACTIVE with structured issues', async () => {
    const response = await call('POST', '/api/v1/admin/products', emails.staff, {
      name: `Lc Direct ${stamp}`,
      description: 'A product that tries to skip the draft phase entirely.',
      status: 'ACTIVE',
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string; details: { issues: Array<{ field: string; code: string }> } } };
    expect(body.error.code).toBe('PRODUCT_NOT_READY_FOR_PUBLISH');
    const codes = body.error.details.issues.map((issue) => issue.code);
    expect(codes).toContain('NO_ACTIVE_VARIANT');
    expect(codes).toContain('NO_IMAGES');
  });

  it('rejects UI-bypass publish of an incomplete draft and changes nothing', async () => {
    const created = await call('POST', '/api/v1/admin/products', emails.staff, {
      name: `Lc Draft ${stamp}`,
      description: 'An intentionally incomplete draft for bypass testing.',
      status: 'DRAFT',
    });
    expect(created.statusCode).toBe(200);
    draftId = (created.json() as { data: { id: string; slug: string } }).data.id;
    draftSlug = (created.json() as { data: { id: string; slug: string } }).data.slug;
    createdProductIds.push(draftId);

    const bypass = await call('PATCH', `/api/v1/admin/products/${draftId}`, emails.staff, { status: 'ACTIVE' });
    expect(bypass.statusCode).toBe(400);
    const body = bypass.json() as { error: { code: string; message: string; details: { issues: Array<{ field: string; code: string; message: string }> } } };
    expect(body.error.code).toBe('PRODUCT_NOT_READY_FOR_PUBLISH');
    expect(body.error.details.issues.length).toBeGreaterThan(0);
    for (const issue of body.error.details.issues) {
      expect(issue.field).toBeTruthy();
      expect(issue.code).toBeTruthy();
      expect(issue.message).toBeTruthy();
    }

    const stored = await prisma.product.findUnique({ where: { id: draftId } });
    expect(stored?.status).toBe('DRAFT');
  });

  it('still allows archiving incomplete products', async () => {
    const response = await call('PATCH', `/api/v1/admin/products/${draftId}`, emails.staff, { status: 'ARCHIVED' });
    expect(response.statusCode).toBe(200);
    await call('PATCH', `/api/v1/admin/products/${draftId}`, emails.staff, { status: 'DRAFT' });
  });
});

describe('product collection assignment', () => {
  let collectionA = '';
  let collectionB = '';

  it('creates collections and starts unassigned', async () => {
    for (const tag of ['alpha', 'beta']) {
      const response = await call('POST', '/api/v1/admin/collections', emails.staff, { name: `Lc ${tag} ${stamp}` });
      expect(response.statusCode).toBe(200);
      const id = (response.json() as { data: { id: string } }).data.id;
      createdCollectionIds.push(id);
      if (tag === 'alpha') collectionA = id;
      else collectionB = id;
    }
    const current = await call('GET', `/api/v1/admin/products/${draftId}/collections`, emails.staff);
    expect(current.statusCode).toBe(200);
    expect((current.json() as { data: { collections: unknown[] } }).data.collections).toEqual([]);
  });

  it('denies guests and customers', async () => {
    expect((await call('GET', `/api/v1/admin/products/${draftId}/collections`, null)).statusCode).toBe(401);
    expect((await call('GET', `/api/v1/admin/products/${draftId}/collections`, emails.customer)).statusCode).toBe(403);
    expect((await call('PUT', `/api/v1/admin/products/${draftId}/collections`, emails.customer, { collectionIds: [collectionA] })).statusCode).toBe(403);
  });

  it('rejects unknown products and collections', async () => {
    expect((await call('GET', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/collections', emails.staff)).statusCode).toBe(404);
    expect((await call('PUT', `/api/v1/admin/products/${draftId}/collections`, emails.staff, { collectionIds: ['nope'] })).statusCode).toBe(404);
  });

  it('assigns, replaces exactly, and clears', async () => {
    const assigned = await call('PUT', `/api/v1/admin/products/${draftId}/collections`, emails.staff, { collectionIds: [collectionA, collectionB, collectionA] });
    expect(assigned.statusCode).toBe(200);
    expect(((assigned.json() as { data: { collections: Array<{ id: string }> } }).data.collections).map((c) => c.id).sort()).toEqual([collectionA, collectionB].sort());

    const replaced = await call('PUT', `/api/v1/admin/products/${draftId}/collections`, emails.staff, { collectionIds: [collectionB] });
    expect(replaced.statusCode).toBe(200);
    expect((replaced.json() as { data: { collections: Array<{ id: string }> } }).data.collections.map((c) => c.id)).toEqual([collectionB]);

    const cleared = await call('PUT', `/api/v1/admin/products/${draftId}/collections`, emails.staff, { collectionIds: [] });
    expect(cleared.statusCode).toBe(200);
    expect((cleared.json() as { data: { collections: unknown[] } }).data.collections).toEqual([]);
  });
});

describe('server-backed draft persistence', () => {
  it('denies guests and customers', async () => {
    expect((await call('PATCH', `/api/v1/admin/products/${draftId}/draft`, null, { name: 'X' })).statusCode).toBe(401);
    expect((await call('PATCH', `/api/v1/admin/products/${draftId}/draft`, emails.customer, { name: 'X' })).statusCode).toBe(403);
  });

  it('saves draft fields without ever publishing', async () => {
    const response = await call('PATCH', `/api/v1/admin/products/${draftId}/draft`, emails.staff, {
      name: `Lc Draft Renamed ${stamp}`,
      description: 'An intentionally incomplete draft for bypass testing, renamed.',
      categoryId,
      status: 'ACTIVE',
    });
    expect(response.statusCode).toBe(200);
    const product = (response.json() as { data: { name: string; status: string; categoryId: string; updatedAt: string } }).data;
    expect(product.name).toBe(`Lc Draft Renamed ${stamp}`);
    expect(product.status).toBe('DRAFT');
    expect(product.categoryId).toBe(categoryId);
  });

  it('validates draft input', async () => {
    expect((await call('PATCH', `/api/v1/admin/products/${draftId}/draft`, emails.staff, { name: 'X' })).statusCode).toBe(400);
  });

  it('rejects stale autosaves with canonical state instead of overwriting', async () => {
    const fresh = await prisma.product.findUnique({ where: { id: draftId } });
    const staleStamp = new Date(new Date(fresh!.updatedAt).getTime() - 60000).toISOString();
    const stale = await call('PATCH', `/api/v1/admin/products/${draftId}/draft`, emails.staff, {
      name: 'Stale overwrite attempt',
      expectedUpdatedAt: staleStamp,
    });
    expect(stale.statusCode).toBe(409);
    const body = stale.json() as { error: { code: string; details: { product: { name: string } } } };
    expect(body.error.code).toBe('DRAFT_CONFLICT');
    expect(body.error.details.product.name).toBe(`Lc Draft Renamed ${stamp}`);

    const current = await call('PATCH', `/api/v1/admin/products/${draftId}/draft`, emails.staff, {
      name: `Lc Draft Current ${stamp}`,
      expectedUpdatedAt: fresh!.updatedAt.toISOString(),
    });
    expect(current.statusCode).toBe(200);
    expect((current.json() as { data: { name: string } }).data.name).toBe(`Lc Draft Current ${stamp}`);
  });
});

describe('full lifecycle walkthrough to published storefront', () => {
  it('generates a variant, restocks inventory, and persists media with primary + order', async () => {
    const generated = await call('POST', `/api/v1/admin/products/${draftId}/variants/generate`, emails.staff, {
      attributes: { [colorAttrId]: [blackValueId] },
      price: 4999,
    });
    expect(generated.statusCode).toBe(200);
    expect((generated.json() as { data: { summary: { created: number } } }).data.summary.created).toBe(1);

    const variant = await prisma.productVariant.findFirst({ where: { productId: draftId } });
    expect(variant).toBeTruthy();
    const restocked = await call('POST', `/api/v1/admin/inventory/${variant!.id}/restock`, emails.staff, { quantity: 10, reason: 'Lifecycle walkthrough stock' });
    expect(restocked.statusCode).toBe(200);

    const first = await call('POST', `/api/v1/admin/products/${draftId}/images`, emails.staff, fakeImage('one'));
    expect(first.statusCode).toBe(200);
    const firstId = (first.json() as { data: { id: string; isPrimary: boolean } }).data.id;
    expect((first.json() as { data: { isPrimary: boolean } }).data.isPrimary).toBe(true);
    const second = await call('POST', `/api/v1/admin/products/${draftId}/images`, emails.staff, fakeImage('two'));
    expect(second.statusCode).toBe(200);
    const secondId = (second.json() as { data: { id: string } }).data.id;
    const reordered = await call('PATCH', `/api/v1/admin/products/${draftId}/images/reorder`, emails.staff, { imageIds: [secondId, firstId] });
    expect(reordered.statusCode).toBe(200);
  });

  it('publishes the now-complete product and exposes it on the storefront', async () => {
    const published = await call('PATCH', `/api/v1/admin/products/${draftId}`, emails.staff, { status: 'ACTIVE' });
    expect(published.statusCode).toBe(200);
    expect((published.json() as { data: { status: string } }).data.status).toBe('ACTIVE');

    const publicProduct = await call('GET', `/api/v1/catalog/products/${draftSlug}`, null);
    expect(publicProduct.statusCode).toBe(200);
    expect((publicProduct.json() as { data: { name: string; status?: string } }).data.name).toContain('Lc Draft');
  });
});
