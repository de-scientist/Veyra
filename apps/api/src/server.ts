import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from './lib/env.js';
import { logger } from './lib/logger.js';
import { healthRoute } from './routes/health.js';

const app = Fastify({
  logger,
  ignoreTrailingSlash: true,
  ajv: {
    customOptions: {
      removeAdditional: 'all',
      coerceTypes: true,
    },
  },
});

app.register(cors, {
  origin: true,
  credentials: true,
});

app.register(helmet, {
  global: true,
});

app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
});

app.register(async (instance) => {
  healthRoute(instance);
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

app.listen({ host: env.API_HOST, port: env.API_PORT }).then(() => {
  logger.info({ port: env.API_PORT }, 'API server ready');
}).catch((error) => {
  logger.error({ err: error }, 'API startup failed');
  process.exit(1);
});
