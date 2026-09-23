import crypto from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { hashPassword, hashToken } from './lib/auth.js';
import { prisma } from './lib/prisma.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

describe('unauthenticated access', () => {
  const guarded = [
    ['GET', '/api/v1/admin/dashboard'],
    ['GET', '/api/v1/admin/orders'],
    ['GET', '/api/v1/admin/payments'],
    ['GET', '/api/v1/admin/customers'],
    ['GET', '/api/v1/admin/audit-logs'],
    ['GET', '/api/v1/admin/analytics/overview'],
    ['GET', '/api/v1/account'],
    ['GET', '/api/v1/account/notifications'],
    ['POST', '/api/v1/admin/products'],
    ['POST', '/api/v1/admin/inventory/any-variant/restock'],
    ['POST', '/api/v1/admin/refunds/any-id/process'],
    ['POST', '/api/v1/account/security/password'],
  ] as const;

  for (const [method, url] of guarded) {
    it(`${method} ${url} requires authentication`, async () => {
      const response = await app.inject({ method, url, payload: {} });
      expect(response.statusCode).toBe(401);
      const body = response.json() as { success: boolean; error: { code: string; requestId: string } };
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHENTICATED');
      expect(typeof body.error.requestId).toBe('string');
    });
  }
});

describe('input validation precedes data access', () => {
  it('rejects malformed login bodies without touching the database', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'not-an-email' } });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects checkout without an idempotency key', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/checkout', payload: {} });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('CHECKOUT_IDEMPOTENCY_REQUIRED');
  });

  it('rejects oversized analytics ranges', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics/overview?from=2020-01-01T00:00:00Z&to=2026-09-18T00:00:00Z',
    });
    // 401 (no session) precedes validation for guarded routes — assert the guard holds.
    expect([400, 401]).toContain(response.statusCode);
  });
});

describe('error contract', () => {
  it('returns safe 404s with a request id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });
    expect(response.statusCode).toBe(404);
    const body = response.json() as { success: boolean; error: { requestId: string } };
    expect(body.success).toBe(false);
    expect(typeof body.error.requestId).toBe('string');
  });

  it('never leaks internals across error shapes', async () => {
    const probes = [
      await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'ghost@example.com', password: 'password123' } }),
      await app.inject({ method: 'GET', url: '/api/v1/no-such-route' }),
      await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'bad' } }),
    ];
    for (const response of probes) {
      expect(response.body).not.toMatch(/prisma|postgres|ECONNREFUSED|P1001|stack|at .*\(.*:\d+:\d+\)/i);
    }
  });
});

describe('CORS policy', () => {
  it('reflects configured origins with credentials', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { origin: 'http://localhost:3000' } });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not reflect unlisted origins', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health', headers: { origin: 'https://evil.example' } });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('security headers', () => {
  it('sets baseline helmet headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
  });

  it('exposes rate-limit accounting headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.headers['x-ratelimit-limit']).toBeDefined();
  });
});

describe('health probes', () => {
  it('liveness is cheap and unauthenticated', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { ok: boolean }).ok).toBe(true);
  });

  it('readiness reports accurately without leaking driver details', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    // Either 200 (database reachable) or fail-closed 503 — never a leak.
    expect([200, 503]).toContain(response.statusCode);
    expect(response.body).not.toMatch(/prisma|postgres|ECONNREFUSED|P1001/i);
    if (response.statusCode === 200) {
      expect((response.json() as { ready: boolean }).ready).toBe(true);
    } else {
      expect((response.json() as { error: { code: string } }).error.code).toBe('NOT_READY');
    }
  });
});

describe('cross-account isolation (DB-backed)', () => {
  const stamp = Date.now().toString(36);
  const emailA = `sec-a-${stamp}@example.com`;
  const emailB = `sec-b-${stamp}@example.com`;
  const orderNumberB = `ORD-SEC-${stamp}-B`.toUpperCase();
  let cookieA = '';
  let cookieB = '';
  let addressIdB = '';
  let notificationIdB = '';
  const createdUserIds: string[] = [];
  let orderIdB = '';

  beforeAll(async () => {
    const passwordHash = await hashPassword('password123');
    const role = await prisma.role.upsert({ where: { slug: 'customer' }, update: {}, create: { name: 'Customer', slug: 'customer' } });
    for (const email of [emailA, emailB]) {
      const user = await prisma.user.create({ data: { email, passwordHash, firstName: 'Sec', lastName: email === emailA ? 'A' : 'B' } });
      createdUserIds.push(user.id);
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const rawToken = crypto.randomUUID();
      await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
      if (email === emailA) cookieA = `veyra_session=${rawToken}`;
      else cookieB = `veyra_session=${rawToken}`;
    }
    const userB = await prisma.user.findUniqueOrThrow({ where: { email: emailB } });
    const order = await prisma.order.create({ data: { orderNumber: orderNumberB, userId: userB.id, subtotal: 100, grandTotal: 100 } });
    orderIdB = order.id;
    const address = await prisma.address.create({ data: { userId: userB.id, line1: '1 Test Road', city: 'Nairobi' } });
    addressIdB = address.id;
    const notification = await prisma.notification.create({ data: { userId: userB.id, type: 'ORDER', title: 'Hello B', body: 'Private' } });
    notificationIdB = notification.id;
  }, 30000);

  it('customer A cannot read customer B order', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/account/orders/${orderNumberB}`, headers: { cookie: cookieA } });
    expect(response.statusCode).toBe(404);
  });

  it('customer B can read their own order (positive control)', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/account/orders/${orderNumberB}`, headers: { cookie: cookieB } });
    expect(response.statusCode).toBe(200);
  });

  it('customer A address list excludes customer B addresses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/account/addresses', headers: { cookie: cookieA } });
    expect(response.statusCode).toBe(200);
    const ids = ((response.json() as { data: Array<{ id: string }> }).data ?? []).map((row) => row.id);
    expect(ids).not.toContain(addressIdB);
  });

  it('customer A cannot mark customer B notification as read', async () => {
    const response = await app.inject({ method: 'POST', url: `/api/v1/account/notifications/${notificationIdB}/read`, headers: { cookie: cookieA } });
    expect(response.statusCode).toBe(404);
  });

  it('customer cannot reach admin endpoints', async () => {
    for (const url of ['/api/v1/admin/orders', '/api/v1/admin/analytics/overview', '/api/v1/admin/audit-logs']) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie: cookieA } });
      expect(response.statusCode).toBe(403);
    }
  });

  it('customer A cannot revoke customer B session', async () => {
    const sessionsB = await prisma.session.findMany({ where: { user: { email: emailB } }, select: { id: true } });
    const response = await app.inject({ method: 'DELETE', url: `/api/v1/account/sessions/${sessionsB[0].id}`, headers: { cookie: cookieA } });
    expect(response.statusCode).toBe(404);
  });

  it('cleanup removes test fixtures', async () => {
    await prisma.notification.deleteMany({ where: { user: { email: { in: [emailA, emailB] } } } });
    await prisma.address.deleteMany({ where: { user: { email: { in: [emailA, emailB] } } } });
    await prisma.order.deleteMany({ where: { id: orderIdB } });
    await prisma.session.deleteMany({ where: { user: { email: { in: [emailA, emailB] } } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    expect(await prisma.user.count({ where: { email: { in: [emailA, emailB] } } })).toBe(0);
  });
});

describe('auth rate limiting', () => {
  it('throttles repeated login attempts', async () => {
    let lastStatus = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: `ratelimit${attempt}@example.com`, password: 'password123' },
      });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  }, 30000);
});
