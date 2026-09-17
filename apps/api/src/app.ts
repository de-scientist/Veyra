import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { authRoutes } from './routes/auth.js';
import { healthRoute } from './routes/health.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as any,
    ignoreTrailingSlash: true,
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: true,
      },
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    global: true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(async (instance) => {
    healthRoute(instance);
    await authRoutes(instance);
  }, { prefix: '/api/v1' });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? 'INTERNAL_SERVER_ERROR';

    logger.error({ err: error, requestId: request.id }, 'Unhandled API error');

    reply.status(statusCode).send({
      success: false,
      error: {
        code,
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        details: statusCode >= 500 ? {} : error.validation ?? {},
      },
    });
  });

  return app;
}

export async function startServer() {
  const app = await buildApp();
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  logger.info({ port: env.API_PORT }, 'API server ready');
}
