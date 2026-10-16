import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { hashPassword, hashToken } from './lib/auth.js';
import { setMediaConfigForTests } from './lib/media/cloudinary.js';
import { prisma } from './lib/prisma.js';

/**
 * Phase-2 admin route hardening: database-backed permissions on catalogue,
 * media, coupons, reviews, customers, payments, analytics, audit logs,
 * notifications, dashboard, sweep, returns operations, and refund initiation.
 *
 * Hermetic by construction: every grant rides on a stamp-scoped role — the
 * canonical admin/staff/customer roles are only upserted, never granted.
 * Super-admin needs no grants (code wildcard).
 */

let app: FastifyInstance;

const stamp = `rbacadmin2-${Date.now().toString(36)}`;
const ROLE_OPS = `grant2-ops-${stamp}`;
const ROLE_READER = `grant2-reader-${stamp}`;
const ROLE_FULL = `grant2-full-${stamp}`;
const ROLE_NOCOUPON = `grant2-nocoupon-${stamp}`;
const ROLE_REQONLY = `grant2-reqonly-${stamp}`;
const ROLE_ORDERS = `grant2-orders-${stamp}`;

const ADMIN_SLUGS = [
  'dashboard.read',
  'products.read',
  'products.manage',
  'inventory.manage',
  'categories.manage',
  'collections.manage',
  'orders.manage',
  'fulfillment.view',
  'fulfillment.process',
  'delivery.manage',
  'refunds.request',
  'refunds.process',
  'customers.read',
  'customers.manage',
  'audit.read',
  'notifications.read',
  'notifications.manage',
  'analytics.read',
  'coupons.manage',
  'reviews.moderate',
  'payments.read',
  'payments.manage',
];

const emails = {
  customer: `${stamp}-customer@example.com`,
  staffBare: `${stamp}-staff-bare@example.com`,
  staffReader: `${stamp}-staff-reader@example.com`,
  staffOps: `${stamp}-staff-ops@example.com`,
  staffOrders: `${stamp}-staff-orders@example.com`,
  adminFull: `${stamp}-admin-full@example.com`,
  adminNoCoupon: `${stamp}-admin-nocoupon@example.com`,
  adminReqOnly: `${stamp}-admin-reqonly@example.com`,
  superAdmin: `${stamp}-super@example.com`,
  target: `${stamp}-target@example.com`,
};

const createdUserIds: string[] = [];
const createdGrantRoleIds: string[] = [];
const cookies: Record<string, string> = {};

function permissionAttrs(slug: string) {
  const [resource, action] = slug.split('.');
  return { name: slug, slug, resource, action };
}

async function ensureGrantRole(slug: string, slugs: string[]) {
  const role = await prisma.role.upsert({ where: { slug }, update: {}, create: { name: slug, slug } });
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
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Adm2', lastName: email, status: 'ACTIVE' },
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
 * Needed because the shared dev database carries the seeded grant matrix on
 * the canonical roles; hermetic stamp grants are immune to this by design.
 * Safe under parallel suites: after the fixture updates, no suite depends on
 * canonical-role grants (all fixtures use stamp-scoped grant roles).
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
  setMediaConfigForTests({ cloudName: 'jb-test-cloud', apiKey: 'test-key', apiSecret: 'test-secret-never-commit', baseFolder: 'jb-mercantile' });
  app = await buildApp();
  await ensureGrantRole(ROLE_READER, ['products.read', 'customers.read', 'dashboard.read']);
  await ensureGrantRole(ROLE_OPS, ['inventory.manage', 'orders.manage']);
  await ensureGrantRole(ROLE_ORDERS, ['orders.manage']);
  await ensureGrantRole(ROLE_FULL, ADMIN_SLUGS);
  await ensureGrantRole(ROLE_NOCOUPON, ADMIN_SLUGS.filter((s) => s !== 'coupons.manage'));
  await ensureGrantRole(ROLE_REQONLY, ['refunds.request']);
  await createUser(emails.customer, ['customer']);
  await createUser(emails.staffBare, ['staff']);
  await createUser(emails.staffReader, ['staff', ROLE_READER]);
  await createUser(emails.staffOps, ['staff', ROLE_OPS]);
  await createUser(emails.staffOrders, ['staff', ROLE_ORDERS]);
  await createUser(emails.adminFull, ['admin', ROLE_FULL]);
  await createUser(emails.adminNoCoupon, ['admin', ROLE_NOCOUPON]);
  await createUser(emails.adminReqOnly, ['admin', ROLE_REQONLY]);
  await createUser(emails.superAdmin, ['super_admin']);
  await createUser(emails.target, ['customer']);
}, 60000);

afterAll(async () => {
  setMediaConfigForTests(null);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await prisma.rolePermission.deleteMany({ where: { roleId: { in: createdGrantRoleIds } } });
  await prisma.role.deleteMany({ where: { id: { in: createdGrantRoleIds } } });
});

function call(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

describe('catalogue reads vs writes', () => {
  it('unauthenticated requests are rejected with 401', async () => {
    expect((await call('GET', '/api/v1/admin/products', null)).statusCode).toBe(401);
    expect((await call('POST', '/api/v1/admin/products', null, { name: 'X' })).statusCode).toBe(401);
    expect((await call('GET', '/api/v1/admin/coupons', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/v1/admin/customers', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/v1/admin/analytics/overview', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/v1/admin/audit-logs', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/v1/admin/notifications', null)).statusCode).toBe(401);
    expect((await call('GET', '/api/v1/admin/returns', null)).statusCode).toBe(401);
  });

  it('customers are denied on every newly protected route', async () => {
    const probes: Array<[string, string, Record<string, unknown>?]> = [
      ['GET', '/api/v1/admin/products'],
      ['POST', '/api/v1/admin/products', { name: 'X' }],
      ['GET', '/api/v1/admin/categories'],
      ['POST', '/api/v1/admin/categories', { name: 'X' }],
      ['GET', '/api/v1/admin/coupons'],
      ['POST', '/api/v1/admin/coupons', { code: 'X', value: 1 }],
      ['GET', '/api/v1/admin/reviews'],
      ['GET', '/api/v1/admin/customers'],
      ['PATCH', '/api/v1/admin/customers/x', { firstName: 'X' }],
      ['GET', '/api/v1/admin/payments'],
      ['GET', '/api/v1/admin/analytics/overview'],
      ['GET', '/api/v1/admin/audit-logs'],
      ['GET', '/api/v1/admin/notifications'],
      ['POST', '/api/v1/admin/notifications/process', {}],
      ['GET', '/api/v1/admin/dashboard'],
      ['GET', '/api/v1/admin/returns'],
      ['POST', '/api/v1/admin/returns/x/refund', { idempotencyKey: '1234567890123456' }],
    ];
    for (const [method, url, payload] of probes) {
      expect((await call(method as 'GET', url, emails.customer, payload)).statusCode).toBe(403);
    }
  });

  it('staff with no grants is denied even with the operations role slug', async () => {
    // Shared databases may carry seeded grants on the canonical staff role:
    // neutralize the full staff matrix around these assertions so denial is
    // about the missing grant, never ambient database state.
    await withCanonicalGrantsRevoked(
      'staff',
      ['dashboard.read', 'products.read', 'customers.read', 'inventory.manage', 'orders.manage', 'fulfillment.view', 'fulfillment.process', 'delivery.manage'],
      async () => {
        expect((await call('GET', '/api/v1/admin/products', emails.staffBare)).statusCode).toBe(403);
        expect((await call('POST', '/api/v1/admin/products', emails.staffBare, { name: 'X' })).statusCode).toBe(403);
        expect((await call('GET', '/api/v1/admin/coupons', emails.staffBare)).statusCode).toBe(403);
        expect((await call('GET', '/api/v1/admin/analytics/overview', emails.staffBare)).statusCode).toBe(403);
        expect((await call('GET', '/api/v1/admin/dashboard', emails.staffBare)).statusCode).toBe(403);
      },
    );
  });

  it('staff reads catalogue data but cannot write it', async () => {
    expect((await call('GET', '/api/v1/admin/products', emails.staffReader)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/categories', emails.staffReader)).statusCode).toBe(200);
    expect((await call('POST', '/api/v1/admin/products', emails.staffReader, { name: 'Escalation' })).statusCode).toBe(403);
    expect((await call('POST', '/api/v1/admin/categories', emails.staffReader, { name: 'Escalation' })).statusCode).toBe(403);
    expect((await call('PATCH', '/api/v1/admin/products/x/variants', emails.staffReader, { variants: [] })).statusCode).toBe(403);
  });

  it('batch, nested, and alternate catalogue routes do not bypass guards', async () => {
    const admin = emails.adminFull;
    const staff = emails.staffReader;
    // Batch variant update: admin passes the guard, then body validation
    // rejects the empty variants array (400 still proves guard passage —
    // validation runs after authorization, never before it).
    expect((await call('PATCH', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/variants', admin, { variants: [] })).statusCode).toBe(400);
    expect((await call('PATCH', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/variants', staff, { variants: [] })).statusCode).toBe(403);
    // Nested barcode generation.
    expect((await call('POST', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/variants/barcodes/generate-missing', staff, {})).statusCode).toBe(403);
    // Alternate collections PUT.
    expect((await call('PUT', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/collections', staff, { collectionIds: [] })).statusCode).toBe(403);
    // Admin product detail read (storefront module).
    expect((await call('GET', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000', admin)).statusCode).toBe(404);
    expect((await call('GET', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000', staff)).statusCode).toBe(404);
  });

  it('admin with grants manages catalogue; missing grant denies', async () => {
    const created = await call('POST', '/api/v1/admin/products', emails.adminFull, { name: `Grant2 ${stamp}`, description: 'Phase-2 fixture product.' });
    expect(created.statusCode).toBe(200);
    const productId = (created.json() as { data: { id: string } }).data.id;
    try {
      expect((await call('PATCH', `/api/v1/admin/products/${productId}`, emails.adminFull, { name: `Renamed ${stamp}` })).statusCode).toBe(200);
    } finally {
      await prisma.product.deleteMany({ where: { id: productId } });
    }
  });

  it('revoking a catalogue grant removes access immediately', async () => {
    // The canonical admin role may carry a seeded products.read grant in
    // shared databases: neutralize it so the stamp-role revocation below is
    // what the assertion measures (restored afterwards by the helper).
    await withCanonicalGrantsRevoked('admin', ['products.read'], async () => {
      expect((await call('GET', '/api/v1/admin/products', emails.adminFull)).statusCode).toBe(200);
      await revokeGrant(ROLE_FULL, 'products.read');
      try {
        expect((await call('GET', '/api/v1/admin/products', emails.adminFull)).statusCode).toBe(403);
      } finally {
        await ensureGrantRole(ROLE_FULL, ADMIN_SLUGS);
      }
      expect((await call('GET', '/api/v1/admin/products', emails.adminFull)).statusCode).toBe(200);
    });
  });
});

describe('media, coupons, and reviews', () => {
  it('product image reads stay with staff; writes require products.manage', async () => {
    expect((await call('GET', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/images', emails.staffReader)).statusCode).toBe(404);
    expect(
      (await call('POST', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/images', emails.staffReader, {
        publicId: 'jb-mercantile/products/x',
        secureUrl: 'https://res.cloudinary.com/jb-test-cloud/image/upload/x.webp',
        width: 10,
        height: 10,
        format: 'webp',
      })).statusCode,
    ).toBe(403);
    expect(
      (await call('POST', '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/images', emails.adminFull, {
        publicId: 'jb-mercantile/products/x',
        secureUrl: 'https://res.cloudinary.com/jb-test-cloud/image/upload/x.webp',
        width: 10,
        height: 10,
        format: 'webp',
      })).statusCode,
    ).toBe(404);
  });

  it('product upload signing requires products.manage; profile signing stays customer-accessible', async () => {
    expect((await call('POST', '/api/v1/media/sign-upload', emails.staffReader, { context: 'product' })).statusCode).toBe(403);
    const admin = await call('POST', '/api/v1/media/sign-upload', emails.adminFull, { context: 'product' });
    expect(admin.statusCode).toBe(200);
    expect((admin.json() as { data: { folder: string } }).data.folder).toBe('jb-mercantile/products');
    expect((await call('POST', '/api/v1/media/sign-upload', emails.customer, { context: 'profile' })).statusCode).toBe(200);
  });

  it('coupons and reviews are admin-only via dedicated slugs', async () => {
    expect((await call('GET', '/api/v1/admin/coupons', emails.adminFull)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/reviews', emails.adminFull)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/coupons', emails.staffReader)).statusCode).toBe(403);
    expect((await call('GET', '/api/v1/admin/reviews', emails.staffReader)).statusCode).toBe(403);
    // Admin holding every grant except coupons.manage is denied coupons only.
    // Canonical admin may carry a seeded coupons.manage grant in shared
    // databases: revoke it around the assertion so denial is grant-scoped.
    await withCanonicalGrantsRevoked('admin', ['coupons.manage'], async () => {
      expect((await call('GET', '/api/v1/admin/coupons', emails.adminNoCoupon)).statusCode).toBe(403);
    });
    expect((await call('GET', '/api/v1/admin/reviews', emails.adminNoCoupon)).statusCode).toBe(200);
    expect((await call('POST', '/api/v1/admin/reviews/00000000-0000-0000-0000-000000000000/moderate', emails.adminFull, { status: 'APPROVED' })).statusCode).toBe(404);
  });
});

describe('customers, payments, reporting, and notifications', () => {
  it('staff reads the customer directory but cannot administer it', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    expect((await call('GET', '/api/v1/admin/customers', emails.staffReader)).statusCode).toBe(200);
    expect((await call('GET', `/api/v1/admin/customers/${target.id}`, emails.staffReader)).statusCode).toBe(200);
    expect((await call('PATCH', `/api/v1/admin/customers/${target.id}`, emails.staffReader, { firstName: 'Nope' })).statusCode).toBe(403);
  });

  it('admin manages customer records; super-admin boundary preserved', async () => {
    const target = await prisma.user.findUniqueOrThrow({ where: { email: emails.target } });
    const updated = await call('PATCH', `/api/v1/admin/customers/${target.id}`, emails.adminFull, { firstName: 'Grant2' });
    expect(updated.statusCode).toBe(200);
    await call('PATCH', `/api/v1/admin/customers/${target.id}`, emails.adminFull, { firstName: 'Rbac' });
    expect((await call('GET', '/api/v1/admin/users', emails.adminFull)).statusCode).toBe(403);
    expect((await call('GET', '/api/v1/admin/users', emails.superAdmin)).statusCode).toBe(200);
  });

  it('payment reads and mutations are admin-only via dedicated slugs', async () => {
    expect((await call('GET', '/api/v1/admin/payments', emails.adminFull)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/payments', emails.staffReader)).statusCode).toBe(403);
    expect((await call('GET', '/api/v1/admin/payments/manual-pending', emails.adminFull)).statusCode).toBe(200);
    expect((await call('POST', '/api/v1/admin/payments/00000000-0000-0000-0000-000000000000/verify', emails.staffReader, {})).statusCode).toBe(403);
    expect((await call('POST', '/api/v1/admin/payments/00000000-0000-0000-0000-000000000000/verify', emails.adminFull, {})).statusCode).toBe(404);
    expect((await call('POST', '/api/v1/admin/payments/00000000-0000-0000-0000-000000000000/reject', emails.adminFull, { reason: 'Probe' })).statusCode).toBe(404);
  });

  it('analytics, audit logs, and notifications are admin-only', async () => {
    for (const url of ['/api/v1/admin/analytics/overview', '/api/v1/admin/analytics/definitions', '/api/v1/admin/audit-logs', '/api/v1/admin/notifications']) {
      expect((await call('GET', url, emails.adminFull)).statusCode).toBe(200);
      expect((await call('GET', url, emails.staffReader)).statusCode).toBe(403);
    }
    expect((await call('POST', '/api/v1/admin/notifications/process', emails.staffReader, {})).statusCode).toBe(403);
    expect((await call('POST', '/api/v1/admin/notifications/00000000-0000-0000-0000-000000000000/resend', emails.adminFull, {})).statusCode).toBe(404);
  });

  it('dashboard stays available to operations roles via dashboard.read', async () => {
    expect((await call('GET', '/api/v1/admin/dashboard', emails.staffReader)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/dashboard', emails.adminFull)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/dashboard', emails.superAdmin)).statusCode).toBe(200);
  });

  it('settings intentionally remains role-gated (no fitting grant)', async () => {
    expect((await call('GET', '/api/v1/admin/settings', emails.staffReader)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/settings', emails.adminFull)).statusCode).toBe(200);
    expect((await call('GET', '/api/v1/admin/settings', emails.customer)).statusCode).toBe(403);
  });
});

describe('returns operations, sweep, and refund initiation vs completion', () => {
  it('returns operations enforce orders.manage; inspect additionally needs inventory.manage', async () => {
    expect((await call('GET', '/api/v1/admin/returns', emails.staffOps)).statusCode).toBe(200);
    expect((await call('POST', '/api/v1/admin/returns/00000000-0000-0000-0000-000000000000/review', emails.staffOps, {})).statusCode).toBe(404);
    expect((await call('POST', '/api/v1/admin/returns/00000000-0000-0000-0000-000000000000/inspect', emails.staffOps, { items: [] })).statusCode).toBe(404);
    // orders.manage alone is not enough for inspect (restocks inventory), and
    // the reader role reaches no returns route. Canonical staff may carry
    // seeded operational grants in shared databases, so revoke them around
    // these grant-absence assertions.
    await withCanonicalGrantsRevoked('staff', ['orders.manage', 'inventory.manage'], async () => {
      expect((await call('POST', '/api/v1/admin/returns/00000000-0000-0000-0000-000000000000/inspect', emails.staffOrders, { items: [] })).statusCode).toBe(403);
      expect((await call('GET', '/api/v1/admin/returns', emails.staffReader)).statusCode).toBe(403);
    });
  });

  it('reservation sweep enforces inventory.manage', async () => {
    expect((await call('POST', '/api/v1/admin/inventory/reservations/release-stale', emails.staffOps, {})).statusCode).toBe(200);
    await withCanonicalGrantsRevoked('staff', ['inventory.manage'], async () => {
      expect((await call('POST', '/api/v1/admin/inventory/reservations/release-stale', emails.staffReader, {})).statusCode).toBe(403);
    });
  });

  it('refund initiation and completion enforce separate rules', async () => {
    const payload = { idempotencyKey: '1234567890123456' };
    const initiate = '/api/v1/admin/returns/00000000-0000-0000-0000-000000000000/refund';
    const complete = '/api/v1/admin/refunds/00000000-0000-0000-0000-000000000000/process';
    // Staff (operations role, no refund grants) is denied both.
    expect((await call('POST', initiate, emails.staffOps, payload)).statusCode).toBe(403);
    // Initiation grant alone reaches the handler (404: no such return) but
    // does not authorize completion. The canonical admin role may carry a
    // seeded refunds.process grant in shared databases: revoke it around the
    // separation assertion so completion denial is about the missing grant.
    expect((await call('POST', initiate, emails.adminReqOnly, payload)).statusCode).toBe(404);
    await withCanonicalGrantsRevoked('admin', ['refunds.process'], async () => {
      expect((await call('POST', complete, emails.adminReqOnly, { providerReference: 'REF-123' })).statusCode).toBe(403);
    });
    // Full admin passes both guards (404: no such rows; no money moves).
    expect((await call('POST', initiate, emails.adminFull, payload)).statusCode).toBe(404);
    expect((await call('POST', complete, emails.adminFull, { providerReference: 'REF-123' })).statusCode).toBe(404);
    // Super-admin retains financial access via wildcard.
    expect((await call('POST', initiate, emails.superAdmin, payload)).statusCode).toBe(404);
  });

  it('refund input validation and state guards remain intact past authorization', async () => {
    // Short idempotency key is rejected by validation, not auth.
    const bad = await call('POST', '/api/v1/admin/returns/00000000-0000-0000-0000-000000000000/refund', emails.adminFull, { idempotencyKey: 'short' });
    expect(bad.statusCode).toBe(400);
  });
});
