import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { DeliveryStatus } from '@prisma/client';

import { requireOperationsAccess } from '../middleware/operations.js';
import { getSessionUserId } from '../lib/shopping.js';
import { customerDelivery, fulfillmentDetail, fulfillmentQueue, startFulfillment, pickFulfillment, packFulfillment, assignDelivery, transitionDelivery } from '../lib/fulfillment.js';
import { HttpError } from '../lib/errors.js';

const noteSchema = z.object({ note: z.string().trim().max(500).optional() });
const statusSchema = z.object({ status: z.nativeEnum(DeliveryStatus), note: z.string().trim().max(500).optional() });
const assignmentSchema = z.object({ assigneeId: z.string().uuid() });

function actor(request: FastifyRequest) {
  const id = (request as FastifyRequest & { user?: { id: string } }).user?.id;
  if (!id) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return { id };
}

function confirmationToken(request: FastifyRequest) {
  const header = request.headers['x-confirmation-token'];
  return (Array.isArray(header) ? header[0] : header) ?? (request.query as { token?: string }).token;
}

export async function fulfillmentRoutes(app: FastifyInstance) {
  app.get('/admin/fulfillments', { preHandler: requireOperationsAccess }, async (request) => {
    const value = (request.query as { status?: string }).status;
    const status = value ? z.nativeEnum(DeliveryStatus).parse(value) : undefined;
    return { success: true, data: await fulfillmentQueue(status) };
  });

  app.get('/admin/fulfillments/:orderNumber', { preHandler: requireOperationsAccess }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    return { success: true, data: await fulfillmentDetail(orderNumber) };
  });

  app.post('/admin/fulfillments/:orderNumber/start', { preHandler: requireOperationsAccess }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    const payload = noteSchema.parse(request.body ?? {});
    return { success: true, data: await startFulfillment(orderNumber, actor(request), payload.note) };
  });

  app.post('/admin/fulfillments/:orderNumber/pick', { preHandler: requireOperationsAccess }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    const payload = noteSchema.parse(request.body ?? {});
    return { success: true, data: await pickFulfillment(orderNumber, actor(request), payload.note) };
  });

  app.post('/admin/fulfillments/:orderNumber/pack', { preHandler: requireOperationsAccess }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    const payload = noteSchema.parse(request.body ?? {});
    return { success: true, data: await packFulfillment(orderNumber, actor(request), payload.note) };
  });

  app.post('/admin/deliveries/:deliveryId/assign', { preHandler: requireOperationsAccess }, async (request) => {
    const { deliveryId } = request.params as { deliveryId: string };
    const payload = assignmentSchema.parse(request.body);
    return { success: true, data: await assignDelivery(deliveryId, payload.assigneeId, actor(request)) };
  });

  app.post('/admin/deliveries/:deliveryId/status', { preHandler: requireOperationsAccess }, async (request) => {
    const { deliveryId } = request.params as { deliveryId: string };
    const payload = statusSchema.parse(request.body);
    return { success: true, data: await transitionDelivery(deliveryId, payload.status, actor(request), payload.note) };
  });

  app.get('/orders/:orderNumber/delivery', async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    const userId = await getSessionUserId(request);
    return { success: true, data: await customerDelivery(orderNumber, userId, confirmationToken(request)) };
  });
}
