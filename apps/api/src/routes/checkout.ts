import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { getSessionUserId } from '../lib/shopping.js';
import { getOrCreateCart } from '../lib/shopping.js';
import { getOrderForConfirmation, placeOrder, previewCheckout, type CheckoutInput } from '../lib/checkout.js';
import { requireAuth } from '../middleware/auth.js';
import { sensitiveLimit } from '../lib/rateLimits.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const addressSchema = z.object({
  line1: z.string().trim().min(1).max(180),
  line2: z.string().trim().max(180).optional(),
  city: z.string().trim().min(1).max(120),
  state: z.string().trim().max(120).optional(),
  postalCode: z.string().trim().max(30).optional(),
  country: z.string().trim().length(2).default('KE'),
});

// Exported for contract tests: blank zone codes are rejected at validation.
export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerEmail: z.string().email().max(200),
  customerPhone: z.string().min(7).max(30),
  deliveryMethodId: z.string().uuid(),
  // Blank zone codes must fail validation explicitly instead of slipping
  // through as `''` and surfacing later as a generic address error.
  shippingZoneCode: z.string().trim().min(1).max(50).optional(),
  address: addressSchema.optional(),
  addressId: z.string().uuid().optional(),
  notes: z.string().trim().max(500).optional(),
  confirmPriceChanges: z.boolean().default(false),
});

function asInput(body: unknown) {
  return checkoutSchema.parse(body) as CheckoutInput;
}

function headerValue(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Authenticated customer id from `requireAuth`. The preHandler already
 * rejected missing/expired/revoked sessions and inactive accounts, so a
 * missing id here is a server invariant violation — never a guest fallback:
 * checkout creation is authenticated-only (guests keep browse/cart).
 */
function getRequestUserId(request: FastifyRequest): string {
  const user = (request as FastifyRequest & { user?: { id: string } }).user;
  if (!user?.id) throw new HttpError(500, 'CHECKOUT_AUTH_UNAVAILABLE', 'Authentication was confirmed but the customer identity is missing.');
  return user.id;
}

export async function checkoutRoutes(app: FastifyInstance) {
  app.get('/checkout/options', async () => {
    const methods = await prisma.shippingMethod.findMany({
      where: { status: 'ACTIVE', rates: { some: { status: 'ACTIVE', zone: { status: 'ACTIVE' } } } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, type: true, description: true },
    });
    const zones = await prisma.shippingZone.findMany({
      where: { status: 'ACTIVE', rates: { some: { status: 'ACTIVE', method: { status: 'ACTIVE' } } } },
      orderBy: { name: 'asc' },
      select: { code: true, name: true, country: true, description: true },
    });
    return { success: true, data: { methods, zones } };
  });

  app.post('/checkout/preview', { preHandler: requireAuth }, async (request, reply) => {
    getRequestUserId(request);
    const cart = await getOrCreateCart(request, reply);
    const input = asInput(request.body);
    return { success: true, data: await previewCheckout(cart.id, input) };
  });

  app.post('/checkout', { preHandler: requireAuth, config: sensitiveLimit().config }, async (request, reply) => {
    const key = headerValue(request, 'idempotency-key');
    if (!key || key.length < 16 || key.length > 200) throw new HttpError(400, 'CHECKOUT_IDEMPOTENCY_REQUIRED', 'A valid Idempotency-Key header is required.');
    const input = asInput(request.body);
    const cart = await getOrCreateCart(request, reply);
    // Authenticated-only checkout: `requireAuth` ran first, so the order is
    // always linked to the customer. The guest cart (if any) was merged into
    // the user cart inside `getOrCreateCart` — no guest scope remains.
    const userId = getRequestUserId(request);
    const scope = `user:${userId}`;
    const result = await placeOrder(cart.id, input, scope, key, userId);
    return { success: true, data: { ...result, nextAction: 'PAYMENT_PENDING' } };
  });

  app.get('/orders/:orderNumber', async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    const userId = await getSessionUserId(request);
    const token = headerValue(request, 'x-confirmation-token') ?? (request.query as { token?: string }).token;
    const order = await getOrderForConfirmation(orderNumber, userId, token);
    return { success: true, data: order };
  });

  app.get('/checkout/saved-addresses', { preHandler: requireAuth }, async (request) => {
    const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id;
    if (!userId) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    const addresses = await prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    return { success: true, data: addresses.map(({ userId: _userId, ...address }) => address) };
  });
}
