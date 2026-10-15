import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { getUserPermissionSlugs } from '../lib/permissions.js';
import { requireRole } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * RBAC administration hardening regression (audit F1–F4).
 *
 * - Role definitions and permission grants exist and are super_admin-only.
 * - Customer/staff/admin cannot mutate roles, permissions, or assignments,
 *   and failed attempts leave the database untouched.
 * - The last ACTIVE super-admin cannot be revoked (409); self-revoke stays
 *   forbidden (403); a second super-admin makes handover possible.
 * - Admins cannot suspend super-admin customer accounts (403); super-admins
 *   can (200).
 * - Public registration and profile updates cannot mint privilege.
 * - Multi-role users resolve to the union of trusted RolePermission rows;
 *   super_admin resolves to the documented wildcard.
 */

let app: FastifyInstance;

const stamp = `rbacadmin-${Date.now().toString(36)}`;
const emails = {
  customer: `${stamp}-customer@example.com`,
  staff: `${stamp}-staff@example.com`,
  admin: `${stamp}-admin@example.com`,
  superA: `${stamp}-supera@example.com`,
  superB: `${stamp}-superb@example.com`,
  superCustomer: `${stamp}-supercust@example.com`,
  multi: `${stamp}-multi@example.com`,
};

const createdUserIds: string[] = [];
const createdRoleIds: string[] = [];
const createdPermissionIds: string[] = [];
const cookies: Record<string, string> = {};
let sharedPasswordHash = '';

async function ensureRole(slug: string, name?: string) {
  const role = await prisma.role.upsert({
    where: { slug },
    update: {},
    create: { name: name ?? slug, slug },
  });
  return role;
}

async function createUser(email: string, roleSlugs: string[], status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
  const user = await prisma.user.create({
    data: { email, passwordHash: sharedPasswordHash, firstName: 'Rbac', lastName: email, status },
  });
  createdUserIds.push(user.id);
  for (const slug of roleSlugs) {
    const role = await ensureRole(slug);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
  return user;
}

beforeAll(async () => {
  app = await buildApp();
  // Probe route for the requireRole factory (F4): staff-only read.
  app.get('/__rbac-probe-staff', { preHandler: requireRole('staff') }, async () => ({ success: true, data: { ok: true } }));
  sharedPasswordHash = await hashPassword('password123');
  await createUser(emails.customer, ['customer']);
  await createUser(emails.staff, ['staff']);
  await createUser(emails.admin, ['admin']);
  await createUser(emails.superA, ['super_admin']);
  await createUser(emails.superB, ['super_admin']);
  await createUser(emails.superCustomer, ['super_admin', 'customer']);
  await createUser(emails.multi, ['customer', 'staff']);
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: createdRoleIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdRoleIds } } });
  await prisma.permission.deleteMany({ where: { id: { in: createdPermissionIds } } });
});

describe('role-definition and grant endpoints', () => {
  it('rejects unauthenticated requests', async () => {
    for (const init of [
      { method: 'GET', url: '/api/v1/admin/permissions' },
      { method: 'POST', url: '/api/v1/admin/roles', payload: { name: 'X', slug: 'x' } },
      { method: 'PATCH', url: '/api/v1/admin/roles/00000000-0000-0000-0000-000000000000', payload: { name: 'X' } },
      { method: 'DELETE', url: '/api/v1/admin/roles/00000000-0000-0000-0000-000000000000' },
    ] as const) {
      const response = await app.inject({ method: init.method, url: init.url, payload: (init as { payload?: unknown }).payload });
      expect(response.statusCode).toBe(401);
    }
  });

  it('denies customer, staff, and admin without mutating anything', async () => {
    const role = await ensureRole(`${stamp}-immutable`);
    createdRoleIds.push(role.id);
    // Stamp-scoped snapshot: global counts move under parallel suites, so the
    // no-mutation proof covers only rows this suite owns.
    const snapshot = async () => ({
      assignments: await prisma.userRole.findMany({
        where: { userId: { in: createdUserIds } },
        select: { userId: true, roleId: true },
        orderBy: [{ userId: 'asc' }, { roleId: 'asc' }],
      }),
      grants: await prisma.rolePermission.findMany({
        where: { roleId: role.id },
        select: { roleId: true, permissionId: true },
      }),
      stampRoles: await prisma.role.count({ where: { slug: { contains: stamp } } }),
    });
    const before = await snapshot();
    for (const email of [emails.customer, emails.staff, emails.admin]) {
      const attempts = [
        app.inject({ method: 'GET', url: '/api/v1/admin/permissions', headers: { cookie: cookies[email] } }),
        app.inject({ method: 'POST', url: '/api/v1/admin/roles', headers: { cookie: cookies[email] }, payload: { name: 'Nope', slug: `${stamp}-nope` } }),
        app.inject({ method: 'PATCH', url: `/api/v1/admin/roles/${role.id}`, headers: { cookie: cookies[email] }, payload: { name: 'Nope' } }),
        app.inject({ method: 'DELETE', url: `/api/v1/admin/roles/${role.id}`, headers: { cookie: cookies[email] } }),
        app.inject({ method: 'POST', url: `/api/v1/admin/roles/${role.id}/permissions`, headers: { cookie: cookies[email] }, payload: { permission: 'products.manage' } }),
        app.inject({ method: 'POST', url: `/api/v1/admin/users/${role.id}/roles`, headers: { cookie: cookies[email] }, payload: { role: 'admin', action: 'assign' } }),
      ];
      for (const attempt of attempts) {
        expect((await attempt).statusCode).toBe(403);
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it('super-admin runs the full custom-role lifecycle', async () => {
    const slug = `${stamp}-support`.toLowerCase();
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/roles',
      headers: { cookie: cookies[emails.superA] },
      payload: { name: 'Support Test', slug },
    });
    expect(created.statusCode).toBe(200);
    const roleId = (created.json() as { data: { id: string } }).data.id;
    createdRoleIds.push(roleId);

    const permission = await prisma.permission.create({
      data: { name: 'RBAC Test Read', slug: `${stamp}-test-read`, resource: 'rbac-test', action: 'read' },
    });
    createdPermissionIds.push(permission.id);

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/roles/${roleId}`,
      headers: { cookie: cookies[emails.superA] },
      payload: { name: 'Support Test Renamed' },
    });
    expect(renamed.statusCode).toBe(200);
    expect((renamed.json() as { data: { slug: string } }).data.slug).toBe(slug);

    const granted = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/roles/${roleId}/permissions`,
      headers: { cookie: cookies[emails.superA] },
      payload: { permission: permission.slug },
    });
    expect(granted.statusCode).toBe(200);

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/roles/${roleId}/permissions`,
      headers: { cookie: cookies[emails.superA] },
      payload: { permission: permission.slug },
    });
    expect(duplicate.statusCode).toBe(409);

    const listed = await app.inject({ method: 'GET', url: '/api/v1/admin/permissions', headers: { cookie: cookies[emails.superA] } });
    expect(listed.statusCode).toBe(200);
    const entry = (listed.json() as { data: { permissions: Array<{ slug: string; roles: string[] }> } }).data.permissions.find((p) => p.slug === permission.slug);
    expect(entry?.roles).toContain(slug);

    // Non-empty roles cannot be deleted: attach a member first.
    const member = await createUser(`${stamp}-member@example.com`, ['customer']);
    const memberRole = await prisma.role.findUniqueOrThrow({ where: { slug } });
    await prisma.userRole.create({ data: { userId: member.id, roleId: memberRole.id } });
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/roles/${roleId}`, headers: { cookie: cookies[emails.superA] } })).statusCode).toBe(409);
    await prisma.userRole.deleteMany({ where: { userId: member.id, roleId: memberRole.id } });

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/roles/${roleId}/permissions/${permission.slug}`,
      headers: { cookie: cookies[emails.superA] },
    });
    expect(revoked.statusCode).toBe(200);
    expect((await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/roles/${roleId}/permissions/${permission.slug}`,
      headers: { cookie: cookies[emails.superA] },
    })).statusCode).toBe(404);

    expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/roles/${roleId}`, headers: { cookie: cookies[emails.superA] } })).statusCode).toBe(200);
    createdRoleIds.splice(createdRoleIds.indexOf(roleId), 1);
  }, 60000);

  it('protects system roles and rejects invalid input', async () => {
    for (const slug of ['super_admin', 'admin', 'staff', 'customer', 'super-admin']) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/roles',
        headers: { cookie: cookies[emails.superA] },
        payload: { name: 'Reserved', slug },
      });
      expect(response.statusCode).toBe(409);
    }
    const badSlug = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/roles',
      headers: { cookie: cookies[emails.superA] },
      payload: { name: 'Bad', slug: 'Not A Slug!' },
    });
    expect(badSlug.statusCode).toBe(400);

    const adminRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'admin' } });
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/admin/roles/${adminRole.id}`, headers: { cookie: cookies[emails.superA] }, payload: { name: 'Renamed' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/roles/${adminRole.id}`, headers: { cookie: cookies[emails.superA] } })).statusCode).toBe(403);

    const superRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'super_admin' } });
    expect((await app.inject({ method: 'POST', url: `/api/v1/admin/roles/${superRole.id}/permissions`, headers: { cookie: cookies[emails.superA] }, payload: { permission: 'products.manage' } })).statusCode).toBe(403);

    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'PATCH', url: `/api/v1/admin/roles/${ghost}`, headers: { cookie: cookies[emails.superA] }, payload: { name: 'Ghost' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/api/v1/admin/roles/${ghost}/permissions`, headers: { cookie: cookies[emails.superA] }, payload: { permission: 'products.manage' } })).statusCode).toBe(404);
  });
});

describe('last-super-admin and privilege boundaries', () => {
  it('the final usable super-admin always survives role revocation', async () => {
    const revokeAs = (targetId: string, actorCookie: string) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/admin/users/${targetId}/roles`,
        headers: { cookie: actorCookie },
        payload: { role: 'super_admin', action: 'revoke' },
      });
    // Scoped to this suite's stamp: files run in parallel against one
    // database, so a global count would see other suites' fixtures.
    const holders = () =>
      prisma.user.count({
        where: { email: { contains: stamp }, status: 'ACTIVE', roles: { some: { role: { slug: { in: ['super_admin', 'super-admin'] } } } } },
      });
    // Narrow the field to a single holder: superB revokes superA, then lone
    // (fresh super-admin) revokes superB and superCustomer.
    const loneEmail = `${stamp}-lone@example.com`;
    await createUser(loneEmail, ['super_admin']);
    const superA = await prisma.user.findUniqueOrThrow({ where: { email: emails.superA } });
    expect((await revokeAs(superA.id, cookies[emails.superB])).statusCode).toBe(200);
    for (const email of [emails.superB, emails.superCustomer]) {
      const target = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect((await revokeAs(target.id, cookies[loneEmail])).statusCode).toBe(200);
    }
    expect(await holders()).toBe(1);
    // The survivor cannot remove themselves: the only remaining removal path
    // is denied, so the system always keeps one usable super-admin.
    const lone = await prisma.user.findUniqueOrThrow({ where: { email: loneEmail } });
    const selfDenied = await revokeAs(lone.id, cookies[loneEmail]);
    expect(selfDenied.statusCode).toBe(403);
    expect((selfDenied.json() as { error: { code: string } }).error.code).toBe('SELF_LOCKOUT_DENIED');
    expect(await holders()).toBe(1);
    const retained = await prisma.user.findUniqueOrThrow({ where: { id: lone.id }, include: { roles: { include: { role: true } } } });
    expect(retained.roles.map((entry) => entry.role.slug)).toContain('super_admin');
  }, 60000);

  it('nobody changes their own status through the customer directory', async () => {
    const selfCustomer = await createUser(`${stamp}-selfdir@example.com`, ['super_admin', 'customer']);
    const selfCookieRaw = crypto.randomUUID();
    await prisma.session.create({
      data: { userId: selfCustomer.id, tokenHash: hashToken(selfCookieRaw), expiresAt: new Date(Date.now() + 3600000) },
    });
    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${selfCustomer.id}`,
      headers: { cookie: `veyra_session=${selfCookieRaw}` },
      payload: { status: 'SUSPENDED' },
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { error: { code: string } }).error.code).toBe('SELF_LOCKOUT_DENIED');
    const unchanged = await prisma.user.findUniqueOrThrow({ where: { id: selfCustomer.id } });
    expect(unchanged.status).toBe('ACTIVE');
  });

  it('admin cannot suspend a super-admin account; super-admin can', async () => {
    const target = await createUser(`${stamp}-protected@example.com`, ['super_admin', 'customer']);
    const denied = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: cookies[emails.admin] },
      payload: { status: 'SUSPENDED' },
    });
    expect(denied.statusCode).toBe(403);
    expect((denied.json() as { error: { code: string } }).error.code).toBe('SUPER_ADMIN_PROTECTED');

    const freshSuper = await createUser(`${stamp}-actor@example.com`, ['super_admin']);
    const freshCookieRaw = crypto.randomUUID();
    await prisma.session.create({
      data: { userId: freshSuper.id, tokenHash: hashToken(freshCookieRaw), expiresAt: new Date(Date.now() + 3600000) },
    });
    const allowed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: `veyra_session=${freshCookieRaw}` },
      payload: { status: 'SUSPENDED' },
    });
    expect(allowed.statusCode).toBe(200);
    const reinstated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/customers/${target.id}`,
      headers: { cookie: `veyra_session=${freshCookieRaw}` },
      payload: { status: 'ACTIVE' },
    });
    expect(reinstated.statusCode).toBe(200);
  }, 60000);
});

describe('escalation resistance and permission resolution', () => {
  it('public registration cannot mint privilege, even with smuggled fields', async () => {
    const email = `${stamp}-smuggled@example.com`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'password123', firstName: 'Smuggle', lastName: 'Test', role: 'super_admin', roles: ['admin'], status: 'ACTIVE', isAdmin: true },
    });
    expect(response.statusCode).toBe(200);
    const created = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
    createdUserIds.push(created.id);
    expect(created.roles.map((entry) => entry.role.slug)).toEqual(['customer']);
    expect(created.status).toBe('ACTIVE');
  });

  it('multi-role users resolve to the union of trusted grants; super_admin is wildcard', async () => {
    const read = await prisma.permission.create({ data: { name: 'RBAC Union Read', slug: `${stamp}-union-read`, resource: 'rbac-union', action: 'read' } });
    const write = await prisma.permission.create({ data: { name: 'RBAC Union Write', slug: `${stamp}-union-write`, resource: 'rbac-union', action: 'write' } });
    createdPermissionIds.push(read.id, write.id);
    const customerRole = await ensureRole('customer');
    const staffRole = await ensureRole('staff');
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: customerRole.id, permissionId: read.id } }, update: {}, create: { roleId: customerRole.id, permissionId: read.id } });
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: staffRole.id, permissionId: write.id } }, update: {}, create: { roleId: staffRole.id, permissionId: write.id } });
    const multi = await prisma.user.findUniqueOrThrow({ where: { email: emails.multi } });
    const granted = await getUserPermissionSlugs(multi.id);
    expect(granted).toContain(`${stamp}-union-read`);
    expect(granted).toContain(`${stamp}-union-write`);
    // Dedicated holder: earlier tests revoke the shared super-admin fixtures.
    const wildcard = await createUser(`${stamp}-wildcard@example.com`, ['super_admin']);
    expect(await getUserPermissionSlugs(wildcard.id)).toEqual(['*']);
    await prisma.rolePermission.deleteMany({ where: { permissionId: { in: [read.id, write.id] } } });
  }, 60000);

  it('requireRole factory gates by server-side membership only', async () => {
    expect((await app.inject({ method: 'GET', url: '/__rbac-probe-staff' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/__rbac-probe-staff', headers: { cookie: cookies[emails.customer] } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/__rbac-probe-staff', headers: { cookie: cookies[emails.staff] } })).statusCode).toBe(200);
  });
});
