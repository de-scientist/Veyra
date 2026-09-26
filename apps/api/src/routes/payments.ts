import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getSessionUserId } from '../lib/shopping.js';
import { sensitiveLimit } from '../lib/rateLimits.js';
import { HttpError } from '../lib/errors.js';
import { getPaymentStatus, handleMpesaCallback, initiateMpesaPayment, queryPaymentTransaction } from '../lib/payments/service.js';

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
}
