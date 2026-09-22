import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Phase 15 regression: GET/PATCH /admin/customers/:id must apply the same
 * customer-role filter as GET /admin/customers (list). Non-customer user IDs
 * (staff/admin/super_admin) return 404 CUSTOMER_NOT_FOUND, never PII.
 */

let app: FastifyInstance;

const stamp = `custauthz-${Date.now().toString(36)}`;
const emails = {
  customer: `${stamp}-customer@example.com`,
  otherCustomer: `${stamp}-other@example.com`,
  staff: `${stamp}-staff@example.com`,
  admin: `${stamp}-admin@example.com`,
  superAdmin: `${stamp}-super@example.com`,
};

const createdUserIds: string[] = [];
const cookies: Record<string, string> = {};

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('password123'),
      firstName: 'Authz',
      lastName: roleSlug,
      status: 'ACTIVE',
    },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.upsert({
    where: { slug: roleSlug },
    update: {},
    create: { name: roleSlug, slug: roleSlug },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
  return user;
}

beforeAll(async () => {
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.otherCustomer, 'customer');
  await createUser(emails.staff, 'staff');
  await createUser(emails.admin, 'admin');
  await createUser(emails.superAdmin, 'super_admin');
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('customer detail authorization (Phase 15)', () => {
  it('CUSTOMER role is denied on the admin detail endpoint', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.otherCustomer } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.customer] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('unauthenticated requests are denied', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.otherCustomer } });
    const response = await app.inject({ method: 'GET', url: `/api/v1/admin/customers/${target.id}` });
    expect(response.statusCode).toBe(401);
  });

  it('authorized STAFF can read a customer record', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.otherCustomer } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.staff] },
    });
    expect(response.statusCode).toBe(200);
  });

  it('ADMIN can read a customer record', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.otherCustomer } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.admin] },
    });
    expect(response.statusCode).toBe(200);
  });

  it('SUPER_ADMIN can read a customer record', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.otherCustomer } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.superAdmin] },
    });
    expect(response.statusCode).toBe(200);
  });

  it('staff lookup of a non-customer (staff) ID returns 404, not PII', async () => {
    const nonCustomer = await prisma.user.findUniqueOrThrow({ where: { email: emails.staff } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${nonCustomer.id}`,
      headers: { cookie: cookies[emails.staff] },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: { code: string } }).error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('admin lookup of an admin ID returns 404 (directory scope, not user directory)', async () => {
    const nonCustomer = await prisma.user.findUniqueOrThrow({ where: { email: emails.admin } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${nonCustomer.id}`,
      headers: { cookie: cookies[emails.admin] },
    });
    expect(response.statusCode).toBe(404);
  });

  it('nonexistent customer returns 404', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/customers/00000000-0000-0000-0000-000000000000',
      headers: { cookie: cookies[emails.admin] },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: { code: string } }).error.code).toBe('CUSTOMER_NOT_FOUND');
  });

  it('malformed ID returns 404, not 500', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/customers/not-a-customer-id',
      headers: { cookie: cookies[emails.admin] },
    });
    expect(response.statusCode).toBe(404);
  });

  it('PATCH of a non-customer ID returns 404 (no cross-role edit via customer endpoint)', async () => {
    const nonCustomer = await prisma.user.findUniqueOrThrow({ where: { email: emails.staff } });
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${nonCustomer.id}`,
      headers: { cookie: cookies[emails.admin] },
      payload: { firstName: 'ShouldNotApply' },
    });
    expect(response.statusCode).toBe(404);
  });
});
