import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getSessionUserId } from '../lib/shopping.js';
import { sensitiveLimit } from '../lib/rateLimits.js';
import { HttpError } from '../lib/errors.js';
import { getPaymentStatus, handleMpesaCallback, initiateMpesaPayment, queryPaymentTransaction } from '../lib/payments/service.js';
import { MANUAL_CHANNELS, listManualPending, rejectManualPayment, submitManualPayment, verifyManualPayment } from '../lib/payments/manual.js';
import { requireFinancialAccess } from '../middleware/auth.js';

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function confirmationToken(request: FastifyRequest) {
  return headerValue(request, 'x-confirmation-token') ?? (request.query as { token?: string }).token;
}

export async function paymentRoutes(app: FastifyInstance) {
  app.post('/payments/mpesa/initiate', sensitiveLimit(), async (request) => {
    const payload = z.object({ orderNumber: z.string().min(8).max(40) }).parse(request.body);
    const key = headerValue(request, 'idempotency-key');
    if (!key || key.length < 16 || key.length > 200) throw new HttpError(400, 'PAYMENT_IDEMPOTENCY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const userId = await getSessionUserId(request);
    return { success: true, data: await initiateMpesaPayment(payload.orderNumber, key, userId, confirmationToken(request)) };
  });

  app.post('/payments/mpesa/callback', async (request) => {
    const result = await handleMpesaCallback(request.body);
    return { ResultCode: 0, ResultDesc: result.processed ? 'Accepted' : 'Acknowledged' };
  });

  app.get('/payments/:paymentId/status', async (request) => {
    const { paymentId } = request.params as { paymentId: string };
    const userId = await getSessionUserId(request);
    return { success: true, data: await getPaymentStatus(paymentId, userId, confirmationToken(request)) };
  });

  app.post('/payments/:paymentId/query', sensitiveLimit(), async (request) => {
    const { paymentId } = request.params as { paymentId: string };
    const userId = await getSessionUserId(request);
    return { success: true, data: await queryPaymentTransaction(paymentId, userId, confirmationToken(request)) };
  });

  // Manual M-Pesa fallback: the customer paid externally (Paybill/Pochi) and
  // submits the M-Pesa receipt code. This records a PENDING claim — never
  // PAID. Only financial staff verification transitions it to paid.
  app.post('/payments/manual/submit', sensitiveLimit(), async (request) => {
    const payload = z.object({
      orderNumber: z.string().min(8).max(40),
      transactionCode: z.string().min(1).max(40),
      channel: z.enum(MANUAL_CHANNELS),
    }).parse(request.body);
    const userId = await getSessionUserId(request);
    return {
      success: true,
      data: await submitManualPayment(payload.orderNumber, payload.transactionCode, payload.channel, userId, confirmationToken(request)),
    };
  });

  app.get('/admin/payments/manual-pending', { preHandler: requireFinancialAccess }, async () => {
    return { success: true, data: await listManualPending() };
  });

  app.post('/admin/payments/:paymentId/verify', { preHandler: requireFinancialAccess }, async (request) => {
    const { paymentId } = request.params as { paymentId: string };
    const { note } = z.object({ note: z.string().max(500).optional() }).parse(request.body ?? {});
    const actorId = (request as FastifyRequest & { user?: { id: string } }).user?.id;
    if (!actorId) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    return { success: true, data: await verifyManualPayment(paymentId, actorId, note) };
  });

  app.post('/admin/payments/:paymentId/reject', { preHandler: requireFinancialAccess }, async (request) => {
    const { paymentId } = request.params as { paymentId: string };
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);
    const actorId = (request as FastifyRequest & { user?: { id: string } }).user?.id;
    if (!actorId) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    return { success: true, data: await rejectManualPayment(paymentId, actorId, reason) };
  });
}
