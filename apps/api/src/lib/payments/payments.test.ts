import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../app.js';
import { hashPassword, hashToken } from '../auth.js';
import { env } from '../env.js';
import { prisma } from '../prisma.js';
import { handleMpesaCallback } from './service.js';
import { resetMpesaTokenCacheForTests } from './mpesa.js';

/**
 * Phase C payment matrix: initiation, M-Pesa provider behavior (mocked
 * Daraja), callbacks, idempotency, amount verification, authorization, and
 * concurrency — against the real API + database with self-cleaning fixtures.
 * No real money moves: every provider response is a mocked sandbox shape.
 */
describe('payments + M-Pesa (Phase C)', () => {
  const stamp = Date.now().toString(36);
  const tag = (name: string) => `${name}-${stamp}`.toUpperCase().slice(0, 30);
  let app: FastifyInstance;
  let variantId = '';
  let methodId = '';
  let zoneCode = '';
  let otherCookie = '';
  const created = { users: [] as string[], orders: [] as string[], guestSessions: [] as string[] };
  const ids = { category: '', product: '', zone: '', method: '' };
  const savedEnv = { ...env } as Record<string, unknown>;

  // ---- Mocked Daraja transport (scripted per test) ----
  type MockResponse = { status: number; body: unknown } | { reject: Error };
  let oauthScript: MockResponse = { status: 200, body: { access_token: 'mock-token', expires_in: 3599 } };
  let stkScript: MockResponse = { status: 200, body: { ResponseCode: '0', CheckoutRequestID: 'ws_CO_mock', MerchantRequestID: 'm_mock', CustomerMessage: 'Success. Request accepted for processing' } };
  let queryScript: MockResponse = { status: 200, body: { ResponseCode: '0', ResponseDescription: 'Success', MerchantRequestID: 'm_mock', CheckoutRequestID: 'ws_CO_mock' } };
  let checkoutCounter = 0;

  function mockDaraja() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: unknown) => {
        const target = String(url);
        const script = target.includes('oauth') ? oauthScript : target.includes('stkpushquery') ? queryScript : stkScript;
        if ('reject' in script) throw script.reject;
        if (target.includes('stkpush') && !target.includes('stkpushquery')) {
          checkoutCounter += 1;
          const body = script.body as Record<string, unknown>;
          return { ok: script.status < 300, status: script.status, text: async () => JSON.stringify({ ...body, CheckoutRequestID: `ws_CO_${stamp}_${checkoutCounter}` }) };
        }
        return { ok: script.status < 300, status: script.status, text: async () => JSON.stringify(script.body) };
      }),
    );
  }

  function stkCallback(checkoutRequestId: string, opts: { resultCode?: number; amount?: number; receipt?: string } = {}) {
    const resultCode = opts.resultCode ?? 0;
    const items =
      resultCode === 0
        ? [{ Name: 'Amount', Value: opts.amount }, { Name: 'MpesaReceiptNumber', Value: opts.receipt ?? `RCPT-${stamp}` }, { Name: 'PhoneNumber', Value: 254712345678 }]
        : [];
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: 'm_mock',
          CheckoutRequestID: checkoutRequestId,
          ResultCode: resultCode,
          ResultDesc: resultCode === 0 ? 'The service request is processed successfully.' : 'The balance is insufficient for the transaction.',
          ...(items.length ? { CallbackMetadata: { Item: items } } : {}),
        },
      },
    };
  }

  function cookies(response: { headers: Record<string, unknown> }): string {
    const setCookies = response.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [String(setCookies)] : [];
    return list.map((entry) => String(entry).split(';')[0]).join('; ');
  }

  function checkoutInput() {
    return {
      customerName: 'Phase C Buyer',
      customerEmail: 'phase-c-buyer@example.com',
      customerPhone: '+254712345678',
      deliveryMethodId: methodId,
      shippingZoneCode: zoneCode,
      address: { line1: '9 Ledger Road', city: 'Nairobi', country: 'KE' },
    };
  }

  /** Fresh guest order (PENDING/UNPAID) with confirmation token; session tracked for scoped cleanup. */
  async function createOrder(quantity = 1) {
    const cartResponse = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    const cookie = cookies(cartResponse);
    const sessionId = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('veyra_guest_cart='))?.slice('veyra_guest_cart='.length);
    if (sessionId) created.guestSessions.push(decodeURIComponent(sessionId));
    const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    await app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie }, payload: { variantId, quantity } });
    // Contractual retry for transient write-race losers under parallel-suite load.
    let placed;
    for (let attempt = 0; ; attempt += 1) {
      placed = await app.inject({
        method: 'POST', url: '/api/v1/checkout', headers: { cookie, 'idempotency-key': `phase-c-${stamp}-${crypto.randomUUID()}` }, payload: checkoutInput(),
      });
      const conflict = placed.statusCode === 409 && (placed.json() as { error?: { code?: string } }).error?.code === 'CHECKOUT_CONFLICT';
      if (!conflict || attempt >= 2) break;
    }
    expect(placed.statusCode).toBe(200);
    const data = (placed.json() as { data: { order: { orderNumber: string; grandTotal: number }; confirmationToken?: string } }).data;
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: data.order.orderNumber } });
    created.orders.push(order.id);
    return { order, grandTotal: data.order.grandTotal, token: data.confirmationToken as string, variant };
  }

  async function initiate(orderNumber: string, key: string, token?: string, cookie?: string) {
    return app.inject({
      method: 'POST', url: `/api/v1/payments/mpesa/initiate${token ? `?token=${token}` : ''}`,
      headers: { ...(cookie ? { cookie } : {}), 'idempotency-key': key }, payload: { orderNumber },
    });
  }

  beforeAll(async () => {
    app = await buildApp();
    // Sandbox-shaped credentials for the mocked provider (mutating the shared
    // env snapshot; restored in afterAll so other suites keep their posture).
    env.MPESA_CONSUMER_KEY = 'test-key';
    env.MPESA_CONSUMER_SECRET = 'test-secret';
    env.MPESA_SHORTCODE = '174379';
    env.MPESA_PASSKEY = 'test-passkey';
    env.MPESA_CALLBACK_URL = 'https://example.com/api/v1/payments/mpesa/callback';
    env.MPESA_ENVIRONMENT = 'sandbox';

    const category = await prisma.category.create({ data: { name: `Pay ${stamp}`, slug: `pay-${stamp}` } });
    ids.category = category.id;
    const product = await prisma.product.create({
      data: { name: `Pay Widget ${stamp}`, slug: `pay-widget-${stamp}`, description: 'Phase C fixture product with sufficient description length.', status: 'ACTIVE', basePrice: 2500, categoryId: category.id },
    });
    ids.product = product.id;
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: tag('PAYSKU'), status: 'ACTIVE', priceOverride: 2500, isDefault: true } });
    variantId = variant.id;
    await prisma.inventory.create({ data: { variantId, quantityOnHand: 50, quantityReserved: 0, lowStockThreshold: 2 } });
    const zone = await prisma.shippingZone.create({ data: { name: `Pay Zone ${stamp}`, code: tag('PAYZONE'), country: 'KE', status: 'ACTIVE' } });
    ids.zone = zone.id;
    zoneCode = zone.code;
    const method = await prisma.shippingMethod.create({ data: { name: 'Pay Courier', code: tag('PAYCOURIER'), type: 'COURIER', status: 'ACTIVE' } });
    ids.method = method.id;
    methodId = method.id;
    await prisma.shippingRate.create({ data: { zoneId: zone.id, methodId: method.id, basePrice: 0, minOrderValue: 0, status: 'ACTIVE' } });

    const role = await prisma.role.upsert({ where: { slug: 'customer' }, update: {}, create: { name: 'Customer', slug: 'customer' } });
    const other = await prisma.user.create({ data: { email: `phase-c-other-${stamp}@example.com`, passwordHash: await hashPassword('password123'), firstName: 'Phase', lastName: 'Other' } });
    created.users.push(other.id);
    await prisma.userRole.create({ data: { userId: other.id, roleId: role.id } });
    const rawToken = crypto.randomUUID();
    await prisma.session.create({ data: { userId: other.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
    otherCookie = `veyra_session=${rawToken}`;
    mockDaraja();
  }, 60000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    for (const [key, value] of Object.entries(savedEnv)) (env as Record<string, unknown>)[key] = value;
    for (const orderId of created.orders) {
      await prisma.inventoryReservation.deleteMany({ where: { orderId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.delivery.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.checkoutIdempotency.deleteMany({ where: { orderId } });
      const payments = await prisma.payment.findMany({ where: { orderId }, select: { id: true } });
      await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
      await prisma.payment.deleteMany({ where: { orderId } });
    }
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    const ownCarts = await prisma.cart.findMany({ where: { sessionId: { in: created.guestSessions } }, select: { id: true } });
    await prisma.cartItem.deleteMany({ where: { cartId: { in: ownCarts.map((c) => c.id) } } });
    await prisma.cart.deleteMany({ where: { id: { in: ownCarts.map((c) => c.id) } } });
    await prisma.inventory.deleteMany({ where: { variantId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.shippingRate.deleteMany({ where: { zoneId: ids.zone } });
    await prisma.shippingMethod.deleteMany({ where: { id: ids.method } });
    await prisma.shippingZone.deleteMany({ where: { id: ids.zone } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }, 60000);

  describe('initiation', () => {
    it('creates a PENDING payment/transaction for the authoritative order total', async () => {
      const { order, grandTotal, token } = await createOrder();
      const response = await initiate(order.orderNumber, `phase-c-init-${stamp}-123456`, token);
      expect(response.statusCode).toBe(200);
      const data = (response.json() as { data: { payment: { status: string; amount: number; provider: string }; transactionId: string; replayed: boolean; customerMessage: string } }).data;
      expect(data.payment).toMatchObject({ status: 'PENDING', provider: 'MPESA', amount: grandTotal });
      expect(data.replayed).toBe(false);
      expect(data.transactionId).toBeTruthy();
      // No amount is accepted from the client — the request body has no amount field at all.
      const stored = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(Number(stored.amount)).toBe(grandTotal);
    });

    it('replays duplicate initiation keys without new attempts', async () => {
      const { order, token } = await createOrder();
      const key = `phase-c-dupe-${stamp}-123456`;
      const first = await initiate(order.orderNumber, key, token);
      expect(first.statusCode).toBe(200);
      const second = await initiate(order.orderNumber, key, token);
      expect(second.statusCode).toBe(200);
      expect((second.json() as { data: { replayed: boolean } }).data.replayed).toBe(true);
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(await prisma.paymentTransaction.count({ where: { paymentId: payment.id } })).toBe(1);
    });

    it('collapses rapid retries onto the active attempt', async () => {
      const { order, token } = await createOrder();
      await initiate(order.orderNumber, `phase-c-retry-a-${stamp}-123456`, token);
      const retry = await initiate(order.orderNumber, `phase-c-retry-b-${stamp}-123456`, token);
      expect(retry.statusCode).toBe(200);
      expect((retry.json() as { data: { replayed: boolean } }).data.replayed).toBe(true);
    });

    it('rejects unknown, foreign, paid, and unpayable orders', async () => {
      const missing = await initiate('ORD-DOES-NOT-EXIST', `phase-c-miss-${stamp}-123456`);
      expect(missing.statusCode).toBe(404);
      const { order, token } = await createOrder();
      const foreign = await initiate(order.orderNumber, `phase-c-foreign-${stamp}-123456`, undefined, otherCookie);
      expect(foreign.statusCode).toBe(404);
      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });
      try {
        const paid = await initiate(order.orderNumber, `phase-c-paid-${stamp}-123456`, token);
        expect(paid.statusCode).toBe(409);
      } finally {
        await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'UNPAID' } });
      }
    });

    it('rejects malformed phone numbers without provider secrets leaking', async () => {
      const { order, token } = await createOrder();
      await prisma.order.update({ where: { id: order.id }, data: { customerPhone: 'not-a-phone' } });
      const response = await initiate(order.orderNumber, `phase-c-phone-${stamp}-123456`, token);
      expect(response.statusCode).toBe(400);
      expect((response.json() as { error: { code: string } }).error.code).toBe('MPESA_INVALID_PHONE');
      expect(response.body).not.toMatch(/passkey|consumer|secret/i);
    });

    it('fails closed when M-Pesa is unconfigured', async () => {
      const { order, token } = await createOrder();
      env.MPESA_CONSUMER_KEY = 'replace-me';
      try {
        const response = await initiate(order.orderNumber, `phase-c-unconf-${stamp}-123456`, token);
        expect(response.statusCode).toBe(400);
        expect((response.json() as { error: { code: string } }).error.code).toBe('MPESA_NOT_CONFIGURED');
      } finally {
        env.MPESA_CONSUMER_KEY = 'test-key';
      }
    });

    it('marks provider rejections FAILED and surfaces retryable outages as 503', async () => {
      const { order, token } = await createOrder();
      stkScript = { status: 200, body: { ResponseCode: '1', ResponseDescription: 'Rejected', CustomerMessage: 'Cannot start.' } };
      try {
        const rejected = await initiate(order.orderNumber, `phase-c-reject-${stamp}-123456`, token);
        expect(rejected.statusCode).toBe(200);
        expect((rejected.json() as { data: { payment: { status: string } } }).data.payment.status).toBe('FAILED');
      } finally {
        stkScript = { status: 200, body: { ResponseCode: '0', CheckoutRequestID: 'ws_CO_mock', MerchantRequestID: 'm_mock', CustomerMessage: 'Success. Request accepted for processing' } };
      }
      const { order: order2, token: token2 } = await createOrder();
      const abort = new Error('aborted');
      abort.name = 'AbortError';
      resetMpesaTokenCacheForTests();
      oauthScript = { reject: abort };
      try {
        const timeout = await initiate(order2.orderNumber, `phase-c-timeout-${stamp}-123456`, token2);
        expect(timeout.statusCode).toBe(503);
        const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order2.id } });
        // Retryable outage: attempt stays PENDING for recovery via retry/query.
        expect((await prisma.paymentTransaction.findFirstOrThrow({ where: { paymentId: payment.id } })).status).toBe('PENDING');
      } finally {
        oauthScript = { status: 200, body: { access_token: 'mock-token', expires_in: 3599 } };
      }
    });

    it('rejects invalid OAuth responses without retrying blindly', async () => {
      const { order, token } = await createOrder();
      resetMpesaTokenCacheForTests();
      oauthScript = { status: 401, body: { error: 'invalid_client' } };
      try {
        const denied = await initiate(order.orderNumber, `phase-c-oauth-${stamp}-123456`, token);
        expect(denied.statusCode).toBe(400);
        expect((denied.json() as { error: { code: string } }).error.code).toBe('MPESA_REQUEST_FAILED');
      } finally {
        oauthScript = { status: 200, body: { access_token: 'mock-token', expires_in: 3599 } };
      }
      resetMpesaTokenCacheForTests();
      oauthScript = { status: 200, body: { access_token: null } };
      try {
        const missing = await initiate(order.orderNumber, `phase-c-oauth2-${stamp}-123456`, token);
        expect(missing.statusCode).toBe(400);
        expect((missing.json() as { error: { code: string } }).error.code).toBe('MPESA_AUTH_FAILED');
      } finally {
        oauthScript = { status: 200, body: { access_token: 'mock-token', expires_in: 3599 } };
      }
    });
  });

  describe('callbacks', () => {
    it('processes success end-to-end exactly once across triple delivery', async () => {
      const { order, grandTotal, token } = await createOrder(2);
      const started = await initiate(order.orderNumber, `phase-c-cb-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      const payload = stkCallback(checkoutRequestId, { amount: grandTotal });
      const results = [await handleMpesaCallback(payload), await handleMpesaCallback(payload), await handleMpesaCallback(payload)];
      expect(results[0]).toMatchObject({ acknowledged: true, processed: true, successful: true });
      expect(results[1]).toMatchObject({ acknowledged: true, processed: true, duplicate: true });
      expect(results[2]).toMatchObject({ acknowledged: true, processed: true, duplicate: true });

      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(payment.status).toBe('PAID');
      expect(payment.providerReference).toBe(`RCPT-${stamp}`);
      expect(payment.paidAt).not.toBeNull();
      const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(updated.paymentStatus).toBe('PAID');
      expect(updated.status).toBe('CONFIRMED');
      expect(updated.fulfillmentStatus).toBe('UNFULFILLED');
      expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, status: 'CONFIRMED' } })).toBe(1);
      expect((await prisma.inventoryReservation.findMany({ where: { orderId: order.id } })).every((r) => r.status === 'CONVERTED')).toBe(true);
      expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'OUT' } })).toBe(1);
      const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(inventory.quantityOnHand).toBeLessThanOrEqual(50 - 2);
    });

    it('keeps the Daraja acknowledgement shape on the HTTP route', async () => {
      const { order, grandTotal, token } = await createOrder();
      const started = await initiate(order.orderNumber, `phase-c-shape-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      const response = await app.inject({ method: 'POST', url: '/api/v1/payments/mpesa/callback', payload: stkCallback(checkoutRequestId, { amount: grandTotal }) });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    });

    it('handles customer cancellation as FAILED with retry left open', async () => {
      const { order, grandTotal, token } = await createOrder();
      const started = await initiate(order.orderNumber, `phase-c-cancel-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      const result = await handleMpesaCallback(stkCallback(checkoutRequestId, { resultCode: 1032, amount: grandTotal }));
      expect(result).toMatchObject({ acknowledged: true, processed: true, successful: false });
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(payment.status).toBe('FAILED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('UNPAID');
      // Reservation stays ACTIVE under Phase B lifecycle (sweep-owned release); retry works.
      expect((await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('ACTIVE');
      const retry = await initiate(order.orderNumber, `phase-c-cancel-retry-${stamp}-123456`, token);
      expect(retry.statusCode).toBe(200);
      expect((retry.json() as { data: { replayed: boolean } }).data.replayed).toBe(false);
    });

    it('allows FAILED → PAID on retry but never PAID → FAILED', async () => {
      const { order, grandTotal, token } = await createOrder();
      const first = await initiate(order.orderNumber, `phase-c-fp-a-${stamp}-123456`, token);
      const firstId = (first.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      await handleMpesaCallback(stkCallback(firstId, { resultCode: 1032, amount: grandTotal }));
      const second = await initiate(order.orderNumber, `phase-c-fp-b-${stamp}-123456`, token);
      const secondId = (second.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      await handleMpesaCallback(stkCallback(secondId, { amount: grandTotal }));
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('PAID');

      // Late failure for the superseded attempt must not move PAID anywhere.
      const late = await handleMpesaCallback(stkCallback(firstId, { resultCode: 1032, amount: grandTotal }));
      expect(late).toMatchObject({ acknowledged: true, processed: true, duplicate: true });
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      expect(payment.status).toBe('PAID');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PAID');
    });

    it('rejects amount mismatch without paying (2500 vs 1000)', async () => {
      const { order, token } = await createOrder();
      const started = await initiate(order.orderNumber, `phase-c-amt-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      // Order total is KES 2,500 but the provider result claims KES 1,000.
      const result = await handleMpesaCallback(stkCallback(checkoutRequestId, { amount: 1000 }));
      expect(result).toMatchObject({ acknowledged: true, reconciliationRequired: true });
      expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('FAILED');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('UNPAID');
    });

    it('acks unknown transactions without side effects', async () => {
      const result = await handleMpesaCallback(stkCallback('ws_CO_unknown_transaction', { amount: 2500 }));
      expect(result).toEqual({ acknowledged: true, processed: false });
    });

    it('collapses concurrent duplicate successes to one effective transition', async () => {
      const { order, grandTotal, token } = await createOrder();
      const started = await initiate(order.orderNumber, `phase-c-race-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      const payload = stkCallback(checkoutRequestId, { amount: grandTotal });
      const [first, second] = await Promise.all([handleMpesaCallback(payload), handleMpesaCallback(payload)]);
      const outcomes = [first, second].map((r) => ('duplicate' in r && r.duplicate ? 'duplicate' : 'processed'));
      expect(outcomes.sort()).toEqual(['duplicate', 'processed']);
      expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'OUT' } })).toBe(1);
      expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, status: 'CONFIRMED' } })).toBe(1);
    });
  });

  describe('query recovery', () => {
    it('promotes a pending attempt on provider-confirmed success', async () => {
      const { order, grandTotal, token } = await createOrder();
      const started = await initiate(order.orderNumber, `phase-c-q-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      queryScript = { status: 200, body: { ResponseCode: '0', ResponseDescription: 'Success', MerchantRequestID: 'm_mock', CheckoutRequestID: checkoutRequestId, ResultCode: 0, ResultDesc: 'The service request is processed successfully.' } };
      try {
        const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
        const queried = await app.inject({ method: 'POST', url: `/api/v1/payments/${payment.id}/query`, headers: { 'idempotency-key': `phase-c-qkey-${stamp}-123456`, ...(token ? { 'x-confirmation-token': token } : {}) } });
        expect(queried.statusCode).toBe(200);
        const body = (queried.json() as { data: { payment: { status: string }; refreshed: boolean } }).data;
        expect(body.payment.status).toBe('PAID');
        expect(body.refreshed).toBe(true);
        expect(grandTotal).toBeGreaterThan(0);
      } finally {
        queryScript = { status: 200, body: { ResponseCode: '0', ResponseDescription: 'Success', MerchantRequestID: 'm_mock', CheckoutRequestID: 'ws_CO_mock' } };
      }
    });

    it('leaves UNKNOWN provider states untouched', async () => {
      const { order, token } = await createOrder();
      await initiate(order.orderNumber, `phase-c-qu-${stamp}-123456`, token);
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      const queried = await app.inject({ method: 'POST', url: `/api/v1/payments/${payment.id}/query`, headers: { 'idempotency-key': `phase-c-qukey-${stamp}-123456`, ...(token ? { 'x-confirmation-token': token } : {}) } });
      expect(queried.statusCode).toBe(200);
      const body = (queried.json() as { data: { payment: { status: string }; refreshed: boolean; pending: boolean } }).data;
      expect(body.payment.status).toBe('PENDING');
      expect(body.refreshed).toBe(false);
      expect(body.pending).toBe(true);
    });

    it('forbids cross-customer query and status reads', async () => {
      const { order, token } = await createOrder();
      await initiate(order.orderNumber, `phase-c-qx-${stamp}-123456`, token);
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      const status = await app.inject({ method: 'GET', url: `/api/v1/payments/${payment.id}/status`, headers: { cookie: otherCookie } });
      expect(status.statusCode).toBe(404);
      const query = await app.inject({ method: 'POST', url: `/api/v1/payments/${payment.id}/query`, headers: { cookie: otherCookie, 'idempotency-key': `phase-c-qxkey-${stamp}-123456` } });
      expect(query.statusCode).toBe(404);
      // Owner access via confirmation token still works.
      const own = await app.inject({ method: 'GET', url: `/api/v1/payments/${payment.id}/status?token=${token}` });
      expect(own.statusCode).toBe(200);
    });
  });

  describe('audit trail', () => {
    it('records PAYMENT_UPDATED entries for initiation and confirmation', async () => {
      const { order, grandTotal, token } = await createOrder();
      const started = await initiate(order.orderNumber, `phase-c-audit-${stamp}-123456`, token);
      const checkoutRequestId = (started.json() as { data: { providerRequestId: string } }).data.providerRequestId;
      await handleMpesaCallback(stkCallback(checkoutRequestId, { amount: grandTotal }));
      const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
      const entries = await prisma.auditLog.findMany({ where: { entity: 'Payment', entityId: payment.id, action: 'PAYMENT_UPDATED' }, orderBy: { createdAt: 'asc' } });
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[entries.length - 1].after).toMatchObject({ status: 'PAID' });
    });
  });
});
