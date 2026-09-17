import type { FastifyInstance } from 'fastify';

import { env } from '../lib/env.js';

export async function healthRoute(app: FastifyInstance) {
  app.get('/health', async () => ({
    ok: true,
    service: 'veyra-api',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));
}
