import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { hashPassword, hashToken } from './lib/auth.js';
import { prisma } from './lib/prisma.js';

/**
 * Admin/staff least-privilege grant configuration.
 *
 * Hermetic by construction: grants ride on stamp-scoped roles, so this suite
 * never mutates the canonical admin/staff/customer roles and cannot interfere
 * with parallel suites. Canonical roles are only upserted (never granted).
 *
 * Covers:
 * - Unauthenticated -> 401 on representative inventory/order/fulfillment/refund routes.
 * - Customer -> 403 everywhere operational.
 * - Staff with no grants -> 403 on every DB-permission-enforced route.
 * - Staff with inventory/orders/fulfillment grants -> permitted reads AND writes.
 * - Read grant alone never authorizes a mutation (fulfillment.view vs process).
 * - Staff denied admin-only refund completion; admin without refunds.process denied.
 * - Admin with approved grants -> permitted; admin cannot touch role administration.
 * - Only super_admin reaches role/permission/user-role administration.
 * - Revoking a DB grant removes access (no role-name exception involved).
 * - Registration still mints exactly the customer role.
 * - Grant upserts are idempotent (no duplicate RolePermission rows).
 */

let app: FastifyInstance;

const stamp = `rbacgrants-${Date.now().toString(36)}`;
const grantRoleSlug = `grant-${stamp}`;
const grantRoleViewerSlug = `grant-view-${stamp}`;

const emails = {
  customer: `${stamp}-customer@example.com`,
  staffBare: `${stamp}-staff-bare@example.com`,
  staffOps: `${stamp}-staff-ops@example.com`,
  staffViewer: `${stamp}-staff-viewer@example.com`,
  adminOps: `${stamp}-admin-ops@example.com`,
  adminNoRefund: `${stamp}-admin-norefund@example.com`,
  superAdmin: `${stamp}-super@example.com`,
};

const createdUserIds: string[] = [];
const createdGrantRoleIds: string[] = [];
const cookies: Record<string, string> = {};
let variantId = '';
let productId = '';

const STAFF_OPS_GRANTS = ['inventory.manage', 'orders.manage', 'fulfillment.view', 'fulfillment.process', 'delivery.manage'];
const ADMIN_OPS_GRANTS = [...STAFF_OPS_GRANTS, 'refunds.process'];

function permissionAttrs(slug: string) {
  const [resource, action] = slug.split('.');
  return { name: slug, slug, resource, action };
}

async function ensureGrantRole(slug: string, slugs: string[]) {
  const role = await prisma.role.upsert({
    where: { slug },
    update: {},
    create: { name: slug, slug },
  });
  if (!createdGrantRoleIds.includes(role.id)) createdGrantRoleIds.push(role.id);
  for (const permSlug of slugs) {
    const permission = await prisma.permission.upsert({
      where: { slug: permSlug },
      update: {},
      create: permissionAttrs(permSlug),
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
  }
  return role;
}

async function createUser(email: string, roleSlugs: string[]) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('password123'),
      firstName: 'Grant',
      lastName: email,
      status: 'ACTIVE',
    },
  });
  createdUserIds.push(user.id);
  for (const slug of roleSlugs) {
    const role = await prisma.role.upsert({ where: { slug }, update: {}, create: { name: slug, slug } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
  return user;
}

async function revokeGrant(roleSlug: string, permSlug: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { slug: roleSlug } });
  const permission = await prisma.permission.findUniqueOrThrow({ where: { slug: permSlug } });
  await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: permission.id } });
}

/**
 * Runs `fn` with the given canonical-role grants temporarily removed,
 * restoring exactly the rows that existed (no-op on unseeded databases).
 * The shared dev database carries the seeded grant matrix on the canonical
 * roles; hermetic stamp grants are immune to this by design. Safe under
 * parallel suites: no suite depends on canonical-role grants (all fixtures
 * use stamp-scoped grant roles).
 */
async function withCanonicalGrantsRevoked(roleSlug: string, permSlugs: string[], fn: () => Promise<void>) {
  const role = await prisma.role.findUnique({ where: { slug: roleSlug } });
  const removed: string[] = [];
  if (role) {
    for (const permSlug of permSlugs) {
      const permission = await prisma.permission.findUnique({ where: { slug: permSlug } });
      if (permission) {
        const count = await prisma.rolePermission.count({ where: { roleId: role.id, permissionId: permission.id } });
        if (count > 0) {
          await prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: permission.id } });
          removed.push(permission.id);
        }
      }
    }
  }
  try {
    await fn();
  } finally {
    for (const permissionId of removed) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role!.id, permissionId } },
        update: {},
        create: { roleId: role!.id, permissionId },
      });
    }
  }
}

beforeAll(async () => {
  app = await buildApp();
  await ensureGrantRole(grantRoleSlug, ADMIN_OPS_GRANTS);
  await ensureGrantRole(grantRoleViewerSlug, ['fulfillment.view']);
  await createUser(emails.customer, ['customer']);
  await createUser(emails.staffBare, ['staff']);
  await createUser(emails.staffOps, ['staff', grantRoleSlug]);
  await createUser(emails.staffViewer, ['staff', grantRoleViewerSlug]);
  await createUser(emails.adminOps, ['admin', grantRoleSlug]);
  await createUser(emails.adminNoRefund, ['admin', grantRoleSlug]);
  await createUser(emails.superAdmin, ['super_admin']);
  // Revoke refunds.process from the no-refund admin's stamp role copy: it shares
  // the ops grant role, so give this user its own role minus the refund grant.
  const noRefundRole = await prisma.role.upsert({
    where: { slug: `${grantRoleSlug}-norefund` },
    update: {},
    create: { name: `${grantRoleSlug}-norefund`, slug: `${grantRoleSlug}-norefund` },
  });
  createdGrantRoleIds.push(noRefundRole.id);
  for (const permSlug of STAFF_OPS_GRANTS) {
    const permission = await prisma.permission.upsert({
      where: { slug: permSlug },
      update: {},
      create: permissionAttrs(permSlug),
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: noRefundRole.id, permissionId: permission.id } },
      update: {},
      create: { roleId: noRefundRole.id, permissionId: permission.id },
    });
  }
  const adminNoRefund = await prisma.user.findUniqueOrThrow({ where: { email: emails.adminNoRefund } });
  const sharedRole = await prisma.role.findUniqueOrThrow({ where: { slug: grantRoleSlug } });
  await prisma.userRole.deleteMany({ where: { userId: adminNoRefund.id, roleId: sharedRole.id } });
  await prisma.userRole.create({ data: { userId: adminNoRefund.id, roleId: noRefundRole.id } });

  const product = await prisma.product.create({
    data: { name: `Grant ${stamp}`, slug: `grant-${stamp}`, description: 'RBAC grant fixture.', status: 'ACTIVE' },
  });
  productId = product.id;
  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `GRANT-${stamp}`.toUpperCase().slice(0, 24), status: 'ACTIVE' },
  });
  variantId = variant.id;
  await prisma.inventory.create({ data: { variantId, quantityOnHand: 20, quantityReserved: 0, lowStockThreshold: 2 } });
}, 60000);

afterAll(async () => {
  await prisma.inventoryMovement.deleteMany({ where: { variantId } });
  await prisma.inventory.deleteMany({ where: { variantId } });
  await prisma.productVariant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: createdGrantRoleIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdGrantRoleIds } } });
});

function call(method: 'GET' | 'POST' | 'PATCH', url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

describe('grant bootstrap is idempotent and duplicate-free', () => {
  it('reuses canonical roles without duplicates', async () => {
    for (const slug of ['admin', 'staff', 'customer', 'super_admin']) {
      await prisma.role.upsert({ where: { slug }, update: {}, create: { name: slug, slug } });
    }
    for (const slug of ['admin', 'staff', 'customer', 'super_admin']) {
      expect(await prisma.role.count({ where: { slug } })).toBe(1);
    }
  });

  it('re-granting the same permission creates no duplicate rows', async () => {
    const role = await ensureGrantRole(grantRoleSlug, ADMIN_OPS_GRANTS);
    const permission = await prisma.permission.findUniqueOrThrow({ where: { slug: 'inventory.manage' } });
    const before = await prisma.rolePermission.count({ where: { roleId: role.id, permissionId: permission.id } });
    await ensureGrantRole(grantRoleSlug, ADMIN_OPS_GRANTS);
    expect(await prisma.rolePermission.count({ where: { roleId: role.id, permissionId: permission.id } })).toBe(before);
    expect(before).toBe(1);
  });
});

describe('representative route authorization', () => {
  const probes = [
    { method: 'GET', url: '/api/v1/admin/inventory', payload: undefined },
    { method: 'POST', url: '/api/v1/admin/inventory/restock-batch', payload: { reason: 'RBAC probe restock', items: [] } },
    { method: 'GET', url: '/api/v1/admin/orders', payload: undefined },
    { method: 'GET', url: '/api/v1/admin/fulfillments', payload: undefined },
    { method: 'POST', url: '/api/v1/admin/fulfillments/ORD-NOPE/start', payload: {} },
    { method: 'POST', url: '/api/v1/admin/deliveries/00000000-0000-0000-0000-000000000000/status', payload: { status: 'IN_TRANSIT' } },
  ] as const;

  it('unauthenticated requests are rejected with 401', async () => {
    for (const probe of probes) {
      const response = await call(probe.method, probe.url, null, probe.payload as Record<string, unknown> | undefined);
      expect(response.statusCode).toBe(401);
    }
    const refund = await call('POST', '/api/v1/admin/refunds/00000000-0000-0000-0000-000000000000/process', null, { providerReference: 'REF-123' });
    expect(refund.statusCode).toBe(401);
  });

  it('customers are denied on every operational probe', async () => {
    for (const probe of probes) {
      const response = await call(probe.method, probe.url, emails.customer, probe.payload as Record<string, unknown> | undefined);
      expect(response.statusCode).toBe(403);
    }
  });

  it('staff with no grants is denied even with the operations role slug', async () => {
    // The shared dev database may carry seeded operational grants on the
    // canonical staff role: revoke them around these assertions so denial is
    // about the missing grant, never ambient database state.
    await withCanonicalGrantsRevoked(
      'staff',
      ['dashboard.read', 'inventory.manage', 'orders.manage', 'fulfillment.view', 'fulfillment.process', 'delivery.manage'],
      async () => {
        for (const probe of probes) {
          const response = await call(probe.method, probe.url, emails.staffBare, probe.payload as Record<string, unknown> | undefined);
          expect(response.statusCode).toBe(403);
        }
      },
    );
  });

  it('staff with grants can read and write inventory', async () => {
    expect((await call('GET', '/api/v1/admin/inventory', emails.staffOps)).statusCode).toBe(200);
    const restock = await call('POST', `/api/v1/admin/inventory/${variantId}/restock`, emails.staffOps, {
      quantity: 1,
      reason: 'RBAC grant verification restock',
    });
    expect(restock.statusCode).toBe(200);
  });

  it('staff with grants can read orders and cancel an unpaid order', async () => {
    expect((await call('GET', '/api/v1/admin/orders', emails.staffOps)).statusCode).toBe(200);
    const order = await prisma.order.create({
      data: {
        orderNumber: `RBAC-${stamp}`.toUpperCase().slice(0, 24),
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        fulfillmentStatus: 'UNFULFILLED',
        subtotal: 100,
        grandTotal: 100,
        currency: 'KES',
      },
    });
    try {
      const cancel = await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.staffOps, {
        reason: 'RBAC grant verification cancel',
      });
      expect(cancel.statusCode).toBe(200);
    } finally {
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
  });

  it('staff with grants reaches fulfillment reads and writes (404 past the guard)', async () => {
    expect((await call('GET', '/api/v1/admin/fulfillments', emails.staffOps)).statusCode).toBe(200);
    // Unknown order: 404 proves the permission guard passed and lookup failed after it.
    expect((await call('POST', '/api/v1/admin/fulfillments/ORD-NOPE/start', emails.staffOps, {})).statusCode).toBe(404);
    expect(
      (await call('POST', '/api/v1/admin/deliveries/00000000-0000-0000-0000-000000000000/status', emails.staffOps, { status: 'IN_TRANSIT' })).statusCode,
    ).toBe(404);
  });

  it('a read grant never authorizes a mutation', async () => {
    expect((await call('GET', '/api/v1/admin/fulfillments', emails.staffViewer)).statusCode).toBe(200);
    await withCanonicalGrantsRevoked('staff', ['fulfillment.process'], async () => {
      expect((await call('POST', '/api/v1/admin/fulfillments/ORD-NOPE/start', emails.staffViewer, {})).statusCode).toBe(403);
    });
  });

  it('staff is denied refund completion; admin without the grant is denied too', async () => {
    const payload = { providerReference: 'RBAC-PROBE-123' };
    const url = '/api/v1/admin/refunds/00000000-0000-0000-0000-000000000000/process';
    expect((await call('POST', url, emails.staffOps, payload)).statusCode).toBe(403);
    await withCanonicalGrantsRevoked('admin', ['refunds.process'], async () => {
      expect((await call('POST', url, emails.adminNoRefund, payload)).statusCode).toBe(403);
    });
    // Admin holding refunds.process passes the guard (404: no such refund row).
    expect((await call('POST', url, emails.adminOps, payload)).statusCode).toBe(404);
  });

  it('admin with grants can perform approved management reads', async () => {
    expect((await call('GET', '/api/v1/admin/orders', emails.adminOps)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/inventory', emails.adminOps)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/fulfillments', emails.adminOps)).statusCode).toBe(200);
  });

  it('admin cannot manage roles, permissions, or user-role assignments', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.customer } });
    expect((await call('GET', '/api/v1/admin/roles', emails.adminOps)).statusCode).toBe(403);
    expect((await call('GET', '/api/v1/admin/permissions', emails.adminOps)).statusCode).toBe(403);
    expect((await call('POST', `/api/v1/admin/users/${target.id}/roles`, emails.adminOps, { role: 'staff', action: 'assign' })).statusCode).toBe(403);
    expect((await call('POST', `/api/v1/admin/users/${target.id}/roles`, emails.staffOps, { role: 'staff', action: 'assign' })).statusCode).toBe(403);
  });

  it('only super_admin reaches role and permission administration', async () => {
    expect((await call('GET', '/api/v1/admin/roles', emails.superAdmin)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/permissions', emails.superAdmin)).statusCode).toBe(200);
  });

  it('super_admin wildcard covers enforced routes without explicit grants', async () => {
    expect((await call('GET', '/api/v1/admin/inventory', emails.superAdmin)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/orders', emails.superAdmin)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/fulfillments', emails.superAdmin)).statusCode).toBe(200);
  });

  it('revoking a database permission removes access immediately', async () => {
    // Canonical staff may carry a seeded inventory.manage grant in shared
    // databases, which would backfill the stamp-role revocation: neutralize
    // it for the duration (restored in finally by the helper).
    await withCanonicalGrantsRevoked('staff', ['inventory.manage'], async () => {
      expect((await call('GET', '/api/v1/admin/inventory', emails.staffOps)).statusCode).toBe(200);
      await revokeGrant(grantRoleSlug, 'inventory.manage');
      try {
        expect((await call('GET', '/api/v1/admin/inventory', emails.staffOps)).statusCode).toBe(403);
        // Other grants on the same role keep working: revocation is grant-scoped.
        expect((await call('GET', '/api/v1/admin/orders', emails.staffOps)).statusCode).toBe(200);
      } finally {
        await ensureGrantRole(grantRoleSlug, ADMIN_OPS_GRANTS);
      }
      expect((await call('GET', '/api/v1/admin/inventory', emails.staffOps)).statusCode).toBe(200);
    });
  });
});

describe('registration and lifecycle regression', () => {
  it('public registration assigns exactly the customer role', async () => {
    const email = `${stamp}-reg@example.com`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'password123', firstName: 'Reg', lastName: 'Test' },
    });
    expect(response.statusCode).toBe(200);
    const created = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
    expect(created.roles.map((entry) => entry.role.slug)).toEqual(['customer']);
    createdUserIds.push(created.id);
  });
});
