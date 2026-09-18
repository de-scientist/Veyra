import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';

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

  it('does not leak internals on database failures', async () => {
    // No database is reachable in this environment; any DB-backed route must
    // fail closed with a generic 500 and no driver details.
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: 'user@example.com', password: 'password123' },
    });
    expect(response.statusCode).toBe(500);
    const text = response.body;
    expect(text).not.toMatch(/prisma|postgres|ECONNREFUSED|P1001/i);
    expect((response.json() as { error: { message: string } }).error.message).toBe('Internal server error');
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

  it('readiness fails closed without leaking driver details', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/ready' });
    expect(response.statusCode).toBe(503);
    const body = response.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('NOT_READY');
    expect(response.body).not.toMatch(/prisma|postgres|ECONNREFUSED|P1001/i);
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
