import type { FastifyInstance } from 'fastify';

import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

export async function healthRoute(app: FastifyInstance) {
  // Liveness: process is running. Cheap, no dependency checks.
  app.get('/health', async () => ({
    ok: true,
    service: 'veyra-api',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // Readiness: safe to serve traffic (database reachable). No details leak:
  // failures return a generic status without driver messages.
  app.get('/ready', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ready: true, service: 'veyra-api', timestamp: new Date().toISOString() };
    } catch {
      return reply.status(503).send({ success: false, error: { code: 'NOT_READY', message: 'Service temporarily unavailable.' } });
    }
  });
}
