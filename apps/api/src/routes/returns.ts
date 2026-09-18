import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ReturnCondition, ReturnDisposition, ReturnStatus, ReturnType } from '@prisma/client';

import { requireAuth } from '../middleware/auth.js';
import { requireFinancialAccess, requireOperationsAccess } from '../middleware/operations.js';
import { HttpError } from '../lib/errors.js';
import { sensitiveLimit } from '../lib/rateLimits.js';
import { approveReturn, completeManualRefund, createReturn, customerReturns, inspectReturn, ownedReturnDetail, receiveReturn, rejectReturn, requestRefund, returnDetail, returnQueue, reviewReturn } from '../lib/returns.js';

const createSchema = z.object({
  orderNumber: z.string().min(8).max(40),
  type: z.nativeEnum(ReturnType),
  reason: z.string().trim().min(2).max(160),
  customerNote: z.string().trim().max(500).optional(),
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().positive(), reason: z.string().trim().min(2).max(160), replacementVariantId: z.string().uuid().optional() })).min(1),
});
const noteSchema = z.object({ note: z.string().trim().max(500).optional() });
const inspectSchema = z.object({ items: z.array(z.object({ returnItemId: z.string().uuid(), condition: z.nativeEnum(ReturnCondition), disposition: z.nativeEnum(ReturnDisposition), note: z.string().trim().max(500).optional() })) });
const refundSchema = z.object({ idempotencyKey: z.string().min(16).max(200) });
const completeRefundSchema = z.object({ providerReference: z.string().trim().min(3).max(100) });

function currentUser(request: FastifyRequest) {
  const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id;
  if (!userId) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return userId;
}

export async function returnRoutes(app: FastifyInstance) {
  app.post('/returns', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await createReturn(currentUser(request), createSchema.parse(request.body)) };
  });

  app.get('/returns', { preHandler: requireAuth }, async (request) => {
    return { success: true, data: await customerReturns(currentUser(request), (request.query as { orderNumber?: string }).orderNumber) };
  });

  app.get('/returns/:returnId', { preHandler: requireAuth }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    return { success: true, data: await ownedReturnDetail(returnId, currentUser(request)) };
  });

  app.get('/admin/returns', { preHandler: requireOperationsAccess }, async (request) => {
    const value = (request.query as { status?: string }).status;
    const status = value ? z.nativeEnum(ReturnStatus).parse(value) : undefined;
    return { success: true, data: await returnQueue(status) };
  });

  app.get('/admin/returns/:returnId', { preHandler: requireOperationsAccess }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    return { success: true, data: await returnDetail(returnId) };
  });

  app.post('/admin/returns/:returnId/review', { preHandler: requireOperationsAccess }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    return { success: true, data: await reviewReturn(returnId, currentUser(request)) };
  });

  app.post('/admin/returns/:returnId/approve', { preHandler: requireOperationsAccess }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    const payload = noteSchema.parse(request.body ?? {});
    return { success: true, data: await approveReturn(returnId, currentUser(request), payload.note) };
  });

  app.post('/admin/returns/:returnId/reject', { preHandler: requireOperationsAccess }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    const payload = z.object({ reason: z.string().trim().min(2).max(500) }).parse(request.body);
    return { success: true, data: await rejectReturn(returnId, currentUser(request), payload.reason) };
  });

  app.post('/admin/returns/:returnId/receive', { preHandler: requireOperationsAccess }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    const payload = noteSchema.parse(request.body ?? {});
    return { success: true, data: await receiveReturn(returnId, currentUser(request), payload.note) };
  });

  app.post('/admin/returns/:returnId/inspect', { preHandler: requireOperationsAccess }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    return { success: true, data: await inspectReturn(returnId, currentUser(request), inspectSchema.parse(request.body).items) };
  });

  app.post('/admin/returns/:returnId/refund', { preHandler: requireOperationsAccess, ...sensitiveLimit() }, async (request) => {
    const { returnId } = request.params as { returnId: string };
    const payload = refundSchema.parse(request.body);
    return { success: true, data: await requestRefund(returnId, currentUser(request), payload.idempotencyKey) };
  });

  app.post('/admin/refunds/:refundId/process', { preHandler: requireFinancialAccess, ...sensitiveLimit() }, async (request) => {
    const { refundId } = request.params as { refundId: string };
    const payload = completeRefundSchema.parse(request.body);
    return { success: true, data: await completeManualRefund(refundId, currentUser(request), payload.providerReference) };
  });
}
