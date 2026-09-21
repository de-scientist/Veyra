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
