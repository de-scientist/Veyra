import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { z } from 'zod';

import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { authRoutes } from './routes/auth.js';
import { catalogueRoutes } from './routes/catalogue.js';
import { healthRoute } from './routes/health.js';
import { shoppingRoutes } from './routes/shopping.js';
import { checkoutRoutes } from './routes/checkout.js';
import { paymentRoutes } from './routes/payments.js';

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

  await app.register(cookie, {
    secret: env.AUTH_SECRET,
    parseOptions: {},
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
    await catalogueRoutes(instance);
    await shoppingRoutes(instance);
    await checkoutRoutes(instance);
    await paymentRoutes(instance);
  }, { prefix: '/api/v1' });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof z.ZodError) {
      reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'The request contains invalid data.',
          details: error.flatten(),
        },
      });
      return;
    }

    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? 'INTERNAL_SERVER_ERROR';

    logger.error({ err: error, requestId: request.id }, 'Unhandled API error');

    reply.status(statusCode).send({
      success: false,
      error: {
        code,
        message: statusCode >= 500 ? 'Internal server error' : error.message,
        details: statusCode >= 500 ? {} : (error as FastifyError & { details?: unknown }).details ?? error.validation ?? {},
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
