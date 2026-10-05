import { afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';

let app: FastifyInstance;

describe('CORS contract for credentialed admin UI', () => {
  it('boots the app', async () => {
    app = await buildApp();
  });

  it('advertises PUT for the product-collections preflight from the dev origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/collections',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'PUT',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(response.statusCode).toBe(204);
    const methods = String(response.headers['access-control-allow-methods'] ?? '');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
      expect(methods).toContain(method);
    }
    // Credentialed cookie sessions: exact origin echo, never `*`.
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not expose a wildcard origin to credentialed requests', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/admin/products/00000000-0000-0000-0000-000000000000/collections',
      headers: { origin: 'http://localhost:3000', 'access-control-request-method': 'PUT' },
    });
    expect(response.headers['access-control-allow-origin']).not.toBe('*');
  });

  afterAll(async () => {
    await app?.close();
  });
});
