import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { requireAuth } from '../middleware/auth.js';
import { requireOperationsAccess } from '../middleware/operations.js';
import { HttpError } from '../lib/errors.js';
import { drainOutbox } from '../lib/notifications/worker.js';
import { retryDelivery } from '../lib/notifications/orchestrator.js';
import { handleEmailCallback, handleSmsCallback } from '../lib/notifications/webhooks.js';
import * as notifications from '../lib/notifications/service.js';

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().trim().max(20).optional(),
  unreadOnly: z.coerce.boolean().optional(),
});

const preferenceSchema = z.object({
  category: z.enum(['TRANSACTIONAL', 'SECURITY', 'MARKETING']),
  channel: z.enum(['IN_APP', 'EMAIL', 'SMS']),
  enabled: z.boolean(),
});

const adminQueueSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  status: z.string().trim().max(20).optional(),
  channel: z.string().trim().max(20).optional(),
});

type AuthedRequest = FastifyRequest & { user?: { id: string } };

function userId(request: FastifyRequest): string {
  const user = (request as AuthedRequest).user;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return user.id;
}

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/account/notifications', { preHandler: requireAuth }, async (request) => {
    const query = listQuerySchema.parse(request.query);
    return { success: true, data: await notifications.listNotifications(userId(request), query) };
  });

  app.get('/account/notifications/unread-count', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await notifications.unreadCount(userId(request)) };
  });

  app.post('/account/notifications/read-all', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await notifications.markAllRead(userId(request)) };
  });

  app.post('/account/notifications/:id/read', { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    return { success: true, data: await notifications.markRead(userId(request), id) };
  });

  app.get('/account/notification-preferences', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await notifications.getPreferences(userId(request)) };
  });

  app.patch('/account/notification-preferences', { preHandler: requireAuth }, async (request) => {
    const payload = preferenceSchema.parse(request.body);
    return { success: true, data: await notifications.updatePreference(userId(request), payload.category, payload.channel, payload.enabled) };
  });

  app.get('/admin/notifications', { preHandler: requireOperationsAccess }, async (request) => {
    const query = adminQueueSchema.parse(request.query);
    return { success: true, data: await notifications.adminQueue(query) };
  });

  app.post('/admin/notifications/process', { preHandler: requireOperationsAccess }, async () => {
    return { success: true, data: await drainOutbox() };
  });

  app.post('/admin/notifications/:id/resend', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const actor = userId(request);
    return { success: true, data: await retryDelivery(id, actor) };
  });

  // Provider delivery callbacks live in an encapsulated context so the raw-body
  // JSON parser (needed for HMAC verification) does not affect other routes.
  await app.register(async (webhooks) => {
    webhooks.addContentTypeParser('application/json', { parseAs: 'string' }, (request, body, done) => {
      (request as FastifyRequest & { rawBody?: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch (error) {
        done(error as Error);
      }
    });

    webhooks.post('/webhooks/email/delivery', async (request) => {
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';
      const signature = request.headers['x-provider-signature'] as string | undefined;
      return { success: true, data: await handleEmailCallback(rawBody, signature, request.body) };
    });

    webhooks.post('/webhooks/sms/delivery', async (request) => {
      const rawBody = (request as FastifyRequest & { rawBody?: string }).rawBody ?? '';
      const signature = request.headers['x-provider-signature'] as string | undefined;
      return { success: true, data: await handleSmsCallback(rawBody, signature, request.body) };
    });
  });
}
