import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `adminusers-${Date.now().toString(36)}`;
const emails = {
  customer: `${stamp}-customer@example.com`,
  staff: `${stamp}-staff@example.com`,
  admin: `${stamp}-admin@example.com`,
  superAdmin: `${stamp}-super@example.com`,
};

const createdUserIds: string[] = [];
const cookies: Record<string, string> = {};

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'AdminUsers', lastName: roleSlug, status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.upsert({ where: { slug: roleSlug }, update: {}, create: { name: roleSlug, slug: roleSlug } });
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

describe('super-admin user directory', () => {
  it('rejects unauthenticated access', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/users' })).statusCode).toBe(401);
  });

  it('denies customer, staff, and admin roles (super-admin only)', async () => {
    for (const email of [emails.customer, emails.staff, emails.admin]) {
      const response = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: { cookie: cookies[email] } });
      expect(response.statusCode).toBe(403);
    }
  });

  it('lists users with roles and supports search, without secrets', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: { cookie: cookies[emails.superAdmin] } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { users: Array<{ email: string; roles: string[] }> } };
    expect(body.data.users.length).toBeGreaterThan(0);
    expect(body.data.users[0]).toHaveProperty('roles');
    expect(response.body).not.toContain('passwordHash');
    expect(response.body).not.toContain('tokenHash');

    const search = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users?search=${encodeURIComponent(stamp)}`,
      headers: { cookie: cookies[emails.superAdmin] },
    });
    expect(search.statusCode).toBe(200);
    const searched = (search.json() as { data: { users: Array<{ email: string }> } }).data.users;
    expect(searched.length).toBeGreaterThan(0);
    expect(searched.every((u) => u.email.includes(stamp))).toBe(true);
  });

  it('returns user detail with roles, 404 for unknown IDs', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/v1/admin/users', headers: { cookie: cookies[emails.superAdmin] } })).json() as {
      data: { users: Array<{ id: string }> };
    };
    const detail = await app.inject({ method: 'GET', url: `/api/v1/admin/users/${list.data.users[0].id}`, headers: { cookie: cookies[emails.superAdmin] } });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { data: { roles: unknown } }).data).toHaveProperty('roles');

    const missing = await app.inject({ method: 'GET', url: '/api/v1/admin/users/00000000-0000-0000-0000-000000000000', headers: { cookie: cookies[emails.superAdmin] } });
    expect(missing.statusCode).toBe(404);
  });
});
