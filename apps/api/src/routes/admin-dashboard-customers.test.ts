import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Customer-statistics correction regression:
 * - Total Customers counts every user with the `customer` role (all statuses).
 * - Active/Suspended/Inactive/Deleted break down the same population.
 * - Users (not UserRole rows) are counted: multi-role accounts count once.
 * - Privileged accounts WITHOUT the customer role are excluded.
 * - `registeredCustomers` is preserved as a legacy alias of the total.
 * - Guest-order, commerce, inventory, and operations figures are untouched.
 *
 * Deltas (not absolutes) are asserted: suites share one database and run in
 * parallel, so other fixtures may exist. Every fixture email carries a unique
 * stamp and is removed in afterAll.
 */

let app: FastifyInstance;

const stamp = `custstats-${Date.now().toString(36)}`;
const emails = {
  activeA: `${stamp}-active-a@example.com`,
  activeB: `${stamp}-active-b@example.com`,
  suspended: `${stamp}-suspended@example.com`,
  inactive: `${stamp}-inactive@example.com`,
  deleted: `${stamp}-deleted@example.com`,
  multiRole: `${stamp}-multi@example.com`,
  adminOnly: `${stamp}-admin-only@example.com`,
  staffOnly: `${stamp}-staff-only@example.com`,
  superOnly: `${stamp}-super-only@example.com`,
  staff: `${stamp}-operator@example.com`,
};

const createdUserIds: string[] = [];
let staffCookie = '';

async function ensureRole(slug: string) {
  return prisma.role.upsert({ where: { slug }, update: {}, create: { name: slug, slug } });
}

let sharedPasswordHash = '';

async function createUser(email: string, status: 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'DELETED', roleSlugs: string[]) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: sharedPasswordHash,
      firstName: 'CustStats',
      lastName: status,
      status,
    },
  });
  createdUserIds.push(user.id);
  for (const slug of roleSlugs) {
    const role = await ensureRole(slug);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  return user;
}

async function createSessionCookie(userId: string): Promise<string> {
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  return `veyra_session=${rawToken}`;
}

type DashboardCustomers = {
  totalCustomers: number;
  activeCustomers: number;
  suspendedCustomers: number;
  inactiveCustomers: number;
  deletedCustomers: number;
  registeredCustomers: number;
  guestOrders: number;
};

async function fetchCustomers(): Promise<DashboardCustomers> {
  const response = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie: staffCookie } });
  expect(response.statusCode).toBe(200);
  return (response.json() as { data: { customers: DashboardCustomers } }).data.customers;
}

beforeAll(async () => {
  app = await buildApp();
  // One bcrypt hash reused across fixtures: the hash value is irrelevant to
  // counting (sessions are minted directly); this keeps the suite fast.
  sharedPasswordHash = await hashPassword('password123');
  const operator = await createUser(emails.staff, 'ACTIVE', ['staff']);
  staffCookie = await createSessionCookie(operator.id);
}, 60000);

afterAll(async () => {
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('admin dashboard customer statistics', () => {
  // Nine sequential user+role writes plus two dashboard aggregations exceed
  // the default 5 s per-test budget on loaded CI databases.
  it('counts every customer-role status and excludes privileged non-customers', { timeout: 60000 }, async () => {
    const before = await fetchCustomers();

    await createUser(emails.activeA, 'ACTIVE', ['customer']);
    await createUser(emails.activeB, 'ACTIVE', ['customer']);
    await createUser(emails.suspended, 'SUSPENDED', ['customer']);
    await createUser(emails.inactive, 'INACTIVE', ['customer']);
    await createUser(emails.deleted, 'DELETED', ['customer']);
    // Multi-role account: customer + admin must count exactly once (as ACTIVE).
    await createUser(emails.multiRole, 'ACTIVE', ['customer', 'admin']);
    // Privileged accounts WITHOUT the customer role must not move any metric.
    await createUser(emails.adminOnly, 'ACTIVE', ['admin']);
    await createUser(emails.staffOnly, 'ACTIVE', ['staff']);
    await createUser(emails.superOnly, 'ACTIVE', ['super_admin']);

    const after = await fetchCustomers();

    expect(after.totalCustomers - before.totalCustomers).toBe(6);
    expect(after.activeCustomers - before.activeCustomers).toBe(3);
    expect(after.suspendedCustomers - before.suspendedCustomers).toBe(1);
    expect(after.inactiveCustomers - before.inactiveCustomers).toBe(1);
    expect(after.deletedCustomers - before.deletedCustomers).toBe(1);
    // The parts sum to the whole: no double counting, no leakage.
    expect(after.totalCustomers).toBe(
      after.activeCustomers + after.suspendedCustomers + after.inactiveCustomers + after.deletedCustomers,
    );
  });

  it('preserves the registeredCustomers alias and the dashboard contract', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie: staffCookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      success: boolean;
      data: { commerce: Record<string, unknown>; operations: Record<string, unknown>; inventory: Record<string, unknown>; customers: DashboardCustomers; needsAttention: Record<string, unknown> };
    };
    expect(body.success).toBe(true);
    const { customers } = body.data;
    for (const key of ['totalCustomers', 'activeCustomers', 'suspendedCustomers', 'inactiveCustomers', 'deletedCustomers', 'registeredCustomers', 'guestOrders'] as const) {
      expect(typeof customers[key]).toBe('number');
    }
    expect(customers.registeredCustomers).toBe(customers.totalCustomers);
    // Untouched sections keep their shape.
    expect(body.data.commerce).toHaveProperty('paidOrderValue');
    expect(body.data.commerce).toHaveProperty('currency', 'KES');
    expect(body.data.operations).toHaveProperty('failedPayments');
    expect(body.data.inventory).toHaveProperty('activeReservations');
    expect(body.data.needsAttention).toHaveProperty('pendingPayments');
  });

  it('keeps dashboard fenced: customers get 403, guests get 401', async () => {
    const customer = await createUser(`${stamp}-fence@example.com`, 'ACTIVE', ['customer']);
    const cookie = await createSessionCookie(customer.id);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard' })).statusCode).toBe(401);
  });

  it('public registration still grants exactly the customer role', async () => {
    const email = `${stamp}-registered@example.com`;
    const register = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'password123', firstName: 'Reg', lastName: 'User' },
    });
    expect(register.statusCode).toBe(200);
    const created = await prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
    createdUserIds.push(created.id);
    expect(created.roles.map((entry) => entry.role.slug)).toEqual(['customer']);
  });
});
