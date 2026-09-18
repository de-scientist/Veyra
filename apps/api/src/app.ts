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
import { fulfillmentRoutes } from './routes/fulfillment.js';
import { returnRoutes } from './routes/returns.js';
import { accountRoutes } from './routes/account.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin.js';
import { analyticsRoutes } from './routes/analytics.js';

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim().replace(/\/$/, ''))
  .filter((origin) => origin.length > 0);

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  try {
    const normalized = new URL(origin).origin;
    return allowedOrigins.includes(normalized);
  } catch {
    return false;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger as any,
    ignoreTrailingSlash: true,
    bodyLimit: env.BODY_LIMIT_BYTES,
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
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Confirmation-Token', 'X-Provider-Signature'],
    maxAge: 600,
  });

  await app.register(helmet, {
    global: true,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
  });

  // Handlers are registered inside the encapsulated API context: Fastify
  // encapsulation means hook-thrown errors (e.g. auth guards in preHandler)
  // would otherwise fall back to the framework default error shape.
  await app.register(async (instance) => {
    instance.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'The requested resource was not found.',
          requestId: request.id,
        },
      });
    });

    instance.setErrorHandler((error, request, reply) => {
      if (error instanceof z.ZodError) {
        reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'The request contains invalid data.',
            details: error.flatten(),
            requestId: request.id,
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
          requestId: request.id,
        },
      });
    });

    healthRoute(instance);
    await authRoutes(instance);
    await catalogueRoutes(instance);
    await shoppingRoutes(instance);
    await checkoutRoutes(instance);
    await paymentRoutes(instance);
    await fulfillmentRoutes(instance);
    await returnRoutes(instance);
    await accountRoutes(instance);
    await notificationRoutes(instance);
    await adminRoutes(instance);
    await analyticsRoutes(instance);
  }, { prefix: '/api/v1' });

  return app;
}

export async function startServer() {
  const app = await buildApp();
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
  logger.info({ port: env.API_PORT }, 'API server ready');
}
