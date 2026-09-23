import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { hashPassword, hashToken } from './lib/auth.js';
import { userHasPermissionSlugs } from './lib/permissions.js';
import { prisma } from './lib/prisma.js';

let app: FastifyInstance;

const stamp = `rbac-${Date.now().toString(36)}`;
const emails = {
  customer: `${stamp}-customer@example.com`,
  staff: `${stamp}-staff@example.com`,
  admin: `${stamp}-admin@example.com`,
  superAdmin: `${stamp}-super@example.com`,
  suspended: `${stamp}-suspended@example.com`,
  deleted: `${stamp}-deleted@example.com`,
  target: `${stamp}-target@example.com`,
};

const createdUserIds: string[] = [];
const cookies: Record<string, string> = {};

async function createUser(email: string, roleSlug: string, status = 'ACTIVE') {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('password123'),
      firstName: 'Rbac',
      lastName: roleSlug,
      status: status as 'ACTIVE',
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
  await createUser(emails.staff, 'staff');
  await createUser(emails.admin, 'admin');
  await createUser(emails.superAdmin, 'super_admin');
  await createUser(emails.suspended, 'customer', 'SUSPENDED');
  await createUser(emails.deleted, 'customer', 'DELETED');
  await createUser(emails.target, 'customer');
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('account-status enforcement', () => {
  it('suspended user cannot log in', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: emails.suspended, password: 'password123' },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('deleted user cannot log in', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: emails.deleted, password: 'password123' },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('ACCOUNT_DELETED');
  });

  it('suspended session is rejected on authenticated routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/account',
      headers: { cookie: cookies[emails.suspended] },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('suspended session is rejected on /auth/me', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: cookies[emails.suspended] },
    });
    expect(response.statusCode).toBe(403);
  });

  it('active customer session still works (positive control)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/account',
      headers: { cookie: cookies[emails.customer] },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe('customer isolation from admin', () => {
  it('customer cannot reach admin reads', async () => {
    for (const url of ['/api/v1/admin/dashboard', '/api/v1/admin/roles']) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie: cookies[emails.customer] } });
      expect(response.statusCode).toBe(403);
    }
  });

  it('customer cannot call admin mutations directly', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/products',
      headers: { cookie: cookies[emails.customer] },
      payload: { name: 'Escalation Attempt' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('customer cannot assign roles (super-admin endpoint)', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${target.id}/roles`,
      headers: { cookie: cookies[emails.customer] },
      payload: { role: 'admin', action: 'assign' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('role/status fields on self-profile update are ignored', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/account/profile',
      headers: { cookie: cookies[emails.customer] },
      payload: { firstName: 'StillCustomer', role: 'admin', roles: ['admin'], status: 'ACTIVE' },
    });
    expect(response.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookies[emails.customer] } });
    expect((me.json() as { data: { roles: string[] } }).data.roles).toEqual(['customer']);
  });
});

describe('staff restriction', () => {
  it('staff can access the admin dashboard read', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/dashboard',
      headers: { cookie: cookies[emails.staff] },
    });
    expect(response.statusCode).toBe(200);
  });

  it('staff can edit customer profile fields', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.staff] },
      payload: { firstName: 'StaffEdited' },
    });
    expect(response.statusCode).toBe(200);
  });

  it('staff cannot suspend customers', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.staff] },
      payload: { status: 'SUSPENDED' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('staff cannot complete refunds', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/refunds/any-id/process',
      headers: { cookie: cookies[emails.staff] },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
  });

  it('staff cannot manage roles', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${target.id}/roles`,
      headers: { cookie: cookies[emails.staff] },
      payload: { role: 'staff', action: 'assign' },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('admin and super-admin', () => {
  it('admin can suspend and reinstate customers, with before/after audit', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const suspend = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.admin] },
      payload: { status: 'SUSPENDED' },
    });
    expect(suspend.statusCode).toBe(200);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'CUSTOMER_UPDATED', entityId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after as unknown as { status: string }).toMatchObject({ status: 'SUSPENDED' });

    // A freshly suspended account loses access immediately.
    const targetCookie = await (async () => {
      const raw = crypto.randomUUID();
      await prisma.session.create({
        data: { userId: target.id, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + 3600000) },
      });
      return `veyra_session=${raw}`;
    })();
    const denied = await app.inject({ method: 'GET', url: '/api/v1/account', headers: { cookie: targetCookie } });
    expect(denied.statusCode).toBe(403);

    const reinstate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.admin] },
      payload: { status: 'ACTIVE' },
    });
    expect(reinstate.statusCode).toBe(200);
  });

  it('admin (non-super) cannot manage roles', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${target.id}/roles`,
      headers: { cookie: cookies[emails.admin] },
      payload: { role: 'staff', action: 'assign' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('super-admin can list roles and assign/revoke with audit', async () => {
    const roles = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/roles',
      headers: { cookie: cookies[emails.superAdmin] },
    });
    expect(roles.statusCode).toBe(200);

    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const assign = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${target.id}/roles`,
      headers: { cookie: cookies[emails.superAdmin] },
      payload: { role: 'staff', action: 'assign' },
    });
    expect(assign.statusCode).toBe(200);
    expect((assign.json() as { data: { roles: string[] } }).data.roles).toContain('staff');

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'USER_ROLE_CHANGED', entityId: target.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();

    const revoke = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${target.id}/roles`,
      headers: { cookie: cookies[emails.superAdmin] },
      payload: { role: 'staff', action: 'revoke' },
    });
    expect(revoke.statusCode).toBe(200);
    expect((revoke.json() as { data: { roles: string[] } }).data.roles).not.toContain('staff');
  });

  it('super-admin cannot remove their own super-admin role', async () => {
    const self = await prisma.user.findUniqueOrThrow({ where: { email: emails.superAdmin } });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${self.id}/roles`,
      headers: { cookie: cookies[emails.superAdmin] },
      payload: { role: 'super_admin', action: 'revoke' },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('SELF_LOCKOUT_DENIED');
  });

  it('role assignment to unknown user or role fails safely', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const unknownRole = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/users/${target.id}/roles`,
      headers: { cookie: cookies[emails.superAdmin] },
      payload: { role: 'nope', action: 'assign' },
    });
    expect(unknownRole.statusCode).toBe(404);
    const unknownUser = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users/00000000-0000-0000-0000-000000000000/roles',
      headers: { cookie: cookies[emails.superAdmin] },
      payload: { role: 'staff', action: 'assign' },
    });
    expect(unknownUser.statusCode).toBe(404);
  });
});

describe('permission helper (pure)', () => {
  it('super-admin wildcard grants everything and only there', () => {
    expect(userHasPermissionSlugs(['*'], ['refunds.process'])).toBe(true);
    expect(userHasPermissionSlugs(['orders.manage'], ['refunds.process'])).toBe(false);
    expect(userHasPermissionSlugs(['orders.manage'], ['orders.manage'])).toBe(true);
    expect(userHasPermissionSlugs([], ['dashboard.read'])).toBe(false);
  });
});
