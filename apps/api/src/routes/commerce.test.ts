import crypto from 'node:crypto';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Phase B commerce matrix: cart, checkout, inventory, and order creation
 * against the real API + database with self-cleaning fixtures. No payment
 * moves here — orders must remain PENDING/UNPAID (payment is a later phase).
 */
describe('commerce flow (Phase B)', () => {
  const stamp = Date.now().toString(36);
  const tag = (name: string) => `${name}-${stamp}`.toUpperCase().slice(0, 30);
  let app: FastifyInstance;
  let variantId = '';
  let lowStockVariantId = '';
  let methodId = '';
  let zoneCode = '';
  let customerCookie = '';
  const created = { users: [] as string[], orders: [] as string[], carts: [] as string[] };
  const ids = { category: '', product: '', zone: '', method: '' };

  function cookies(response: { headers: Record<string, unknown> }): string {
    const setCookies = response.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [String(setCookies)] : [];
    return list.map((entry) => String(entry).split(';')[0]).join('; ');
  }

  function checkoutInput(overrides: Record<string, unknown> = {}) {
    return {
      customerName: 'Phase B Buyer',
      customerEmail: 'phase-b-buyer@example.com',
      customerPhone: '+254712345678',
      deliveryMethodId: methodId,
      shippingZoneCode: zoneCode,
      address: { line1: '7 Commerce Lane', city: 'Nairobi', country: 'KE' },
      ...overrides,
    };
  }

  /** Fresh guest cart with captured cookie. */
  async function freshGuestCart() {
    const response = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    expect(response.statusCode).toBe(200);
    return cookies(response);
  }

  async function addItem(cookie: string, variant: string, quantity: number) {
    return app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie }, payload: { variantId: variant, quantity } });
  }

  async function place(cookie: string, key: string, overrides: Record<string, unknown> = {}) {
    return app.inject({ method: 'POST', url: '/api/v1/checkout', headers: { cookie, 'idempotency-key': key }, payload: checkoutInput(overrides) });
  }

  /**
   * Placement with retry on transient write races. When suites run in
   * parallel, a placement may lose a lock race and receive the retryable
   * 409 CHECKOUT_CONFLICT (its transaction rolled back); retrying with a
   * fresh key is the documented client contract.
   */
  async function placeSettled(cookie: string, keyBase: string, overrides: Record<string, unknown> = {}) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const key = `${keyBase}-try${attempt}`;
      const response = await place(cookie, key, overrides);
      const code = response.statusCode === 409 ? (response.json() as { error?: { code?: string } }).error?.code : undefined;
      if (code !== 'CHECKOUT_CONFLICT') return { response, key };
    }
    throw new Error('placement repeatedly lost write races');
  }

  beforeAll(async () => {
    app = await buildApp();
    const category = await prisma.category.create({ data: { name: `Commerce ${stamp}`, slug: `commerce-${stamp}` } });
    ids.category = category.id;
    const product = await prisma.product.create({
      data: { name: `Commerce Widget ${stamp}`, slug: `commerce-widget-${stamp}`, description: 'Phase B fixture product with sufficient description length.', status: 'ACTIVE', basePrice: 2000, categoryId: category.id },
    });
    ids.product = product.id;
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: tag('SKU'), status: 'ACTIVE', priceOverride: 2000, isDefault: true } });
    variantId = variant.id;
    await prisma.inventory.create({ data: { variantId, quantityOnHand: 10, quantityReserved: 0, lowStockThreshold: 2 } });
    const scarce = await prisma.productVariant.create({ data: { productId: product.id, sku: tag('SCARCE'), status: 'ACTIVE', priceOverride: 500, isDefault: false } });
    lowStockVariantId = scarce.id;
    await prisma.inventory.create({ data: { variantId: lowStockVariantId, quantityOnHand: 1, quantityReserved: 0, lowStockThreshold: 1 } });
    const zone = await prisma.shippingZone.create({ data: { name: `Commerce Zone ${stamp}`, code: tag('ZONE'), country: 'KE', status: 'ACTIVE' } });
    ids.zone = zone.id;
    zoneCode = zone.code;
    const method = await prisma.shippingMethod.create({ data: { name: 'Commerce Courier', code: tag('COURIER'), type: 'COURIER', status: 'ACTIVE' } });
    ids.method = method.id;
    methodId = method.id;
    await prisma.shippingRate.create({ data: { zoneId: zone.id, methodId: method.id, basePrice: 250, minOrderValue: 0, status: 'ACTIVE' } });

    const role = await prisma.role.upsert({ where: { slug: 'customer' }, update: {}, create: { name: 'Customer', slug: 'customer' } });
    const user = await prisma.user.create({ data: { email: `phase-b-${stamp}@example.com`, passwordHash: await hashPassword('password123'), firstName: 'Phase', lastName: 'Bee' } });
    created.users.push(user.id);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    const rawToken = crypto.randomUUID();
    await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
    customerCookie = `veyra_session=${rawToken}`;
  }, 60000);

  afterAll(async () => {
    for (const orderId of created.orders) {
      await prisma.inventoryReservation.deleteMany({ where: { orderId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.delivery.deleteMany({ where: { orderId } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId } });
      await prisma.checkoutIdempotency.deleteMany({ where: { orderId } });
    }
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.cartItem.deleteMany({ where: { cartId: { in: created.carts } } });
    await prisma.cart.deleteMany({ where: { id: { in: created.carts } } });
    await prisma.cartItem.deleteMany({ where: { cart: { user: null } } });
    await prisma.cart.deleteMany({ where: { user: null } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: [variantId, lowStockVariantId] } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: [variantId, lowStockVariantId] } } });
    await prisma.product.deleteMany({ where: { id: ids.product } });
    await prisma.category.deleteMany({ where: { id: ids.category } });
    await prisma.shippingRate.deleteMany({ where: { zoneId: ids.zone } });
    await prisma.shippingMethod.deleteMany({ where: { id: ids.method } });
    await prisma.shippingZone.deleteMany({ where: { id: ids.zone } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }, 60000);

  async function trackOrder(orderNumber: string) {
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    created.orders.push(order.id);
    return order;
  }

  describe('cart', () => {
    it('adds a new variant with authoritative totals', async () => {
      const cookie = await freshGuestCart();
      const response = await addItem(cookie, variantId, 2);
      expect(response.statusCode).toBe(200);
      const cart = (response.json() as { data: { items: unknown[]; itemCount: number; subtotal: number } }).data;
      expect(cart.items).toHaveLength(1);
      expect(cart.itemCount).toBe(2);
      expect(cart.subtotal).toBe(4000);
    });

    it('merges quantities for an existing variant without duplicate rows', async () => {
      const cookie = await freshGuestCart();
      await addItem(cookie, variantId, 1);
      const second = await addItem(cookie, variantId, 2);
      expect(second.statusCode).toBe(200);
      const cart = (second.json() as { data: { items: Array<{ quantity: number }>; itemCount: number } }).data;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
      expect(cart.itemCount).toBe(3);
    });

    it('rejects quantities beyond available stock', async () => {
      const cookie = await freshGuestCart();
      const response = await addItem(cookie, lowStockVariantId, 2);
      expect(response.statusCode).toBe(409);
      expect((response.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('rejects archived variants', async () => {
      const cookie = await freshGuestCart();
      await prisma.productVariant.update({ where: { id: lowStockVariantId }, data: { status: 'ARCHIVED' } });
      try {
        const response = await addItem(cookie, lowStockVariantId, 1);
        expect(response.statusCode).toBe(409);
        expect((response.json() as { error: { code: string } }).error.code).toBe('VARIANT_UNAVAILABLE');
      } finally {
        await prisma.productVariant.update({ where: { id: lowStockVariantId }, data: { status: 'ACTIVE' } });
      }
    });

    it('updates quantity against authoritative stock and validates input', async () => {
      const cookie = await freshGuestCart();
      const added = await addItem(cookie, variantId, 1);
      const itemId = ((added.json() as { data: { items: Array<{ id: string }> } }).data.items[0]).id;
      const updated = await app.inject({ method: 'PATCH', url: `/api/v1/cart/items/${itemId}`, headers: { cookie }, payload: { quantity: 3 } });
      expect(updated.statusCode).toBe(200);
      expect(((updated.json() as { data: { items: Array<{ quantity: number }> } }).data.items[0]).quantity).toBe(3);
      expect((await app.inject({ method: 'PATCH', url: `/api/v1/cart/items/${itemId}`, headers: { cookie }, payload: { quantity: 0 } })).statusCode).toBe(400);
      const over = await app.inject({ method: 'PATCH', url: `/api/v1/cart/items/${itemId}`, headers: { cookie }, payload: { quantity: 15 } });
      expect(over.statusCode).toBe(409);
      expect((over.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('removes items and reports an empty cart', async () => {
      const cookie = await freshGuestCart();
      const added = await addItem(cookie, variantId, 1);
      const itemId = ((added.json() as { data: { items: Array<{ id: string }> } }).data.items[0]).id;
      const removed = await app.inject({ method: 'DELETE', url: `/api/v1/cart/items/${itemId}`, headers: { cookie } });
      expect(removed.statusCode).toBe(200);
      const cart = (removed.json() as { data: { items: unknown[]; itemCount: number; subtotal: number } }).data;
      expect(cart.items).toHaveLength(0);
      expect(cart.itemCount).toBe(0);
      expect(cart.subtotal).toBe(0);
    });

    it('guest cart survives refresh via cookie and merges into the user cart on login', async () => {
      const guestCookie = await freshGuestCart();
      await addItem(guestCookie, variantId, 2);
      const revisit = await app.inject({ method: 'GET', url: '/api/v1/cart', headers: { cookie: guestCookie } });
      expect(((revisit.json() as { data: { itemCount: number } }).data.itemCount)).toBe(2);

      const merged = await app.inject({ method: 'GET', url: '/api/v1/cart', headers: { cookie: `${customerCookie}; ${guestCookie}` } });
      expect(merged.statusCode).toBe(200);
      const cart = (merged.json() as { data: { id: string; items: Array<{ variantId: string; quantity: number }>; itemCount: number } }).data;
      created.carts.push(cart.id);
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0]).toMatchObject({ variantId, quantity: 2 });
      // Guest cart is retired, not left active.
      const guestCartId = (await prisma.cart.findFirstOrThrow({ where: { sessionId: guestCookie.split('=')[1] } })).id;
      expect((await prisma.cart.findUniqueOrThrow({ where: { id: guestCartId } })).status).toBe('MERGED');
    });

    it('flags price changes instead of charging stale prices', async () => {
      const cookie = await freshGuestCart();
      await addItem(cookie, variantId, 1);
      await prisma.productVariant.update({ where: { id: variantId }, data: { priceOverride: 2500 } });
      try {
        const cart = (await app.inject({ method: 'GET', url: '/api/v1/cart', headers: { cookie } })).json() as {
          data: { items: Array<{ priceChanged: boolean; currentPrice: number }> };
        };
        expect(cart.data.items[0].priceChanged).toBe(true);
        expect(cart.data.items[0].currentPrice).toBe(2500);
        // Preview never blocks: it reports the change for explicit confirmation.
        const preview = await app.inject({ method: 'POST', url: '/api/v1/checkout/preview', headers: { cookie }, payload: checkoutInput() });
        expect(preview.statusCode).toBe(200);
        const previewBody = (preview.json() as { data: { subtotal: number; requiresPriceConfirmation: boolean; priceChangedItems: string[] } }).data;
        expect(previewBody.subtotal).toBe(2500);
        expect(previewBody.requiresPriceConfirmation).toBe(true);
        expect(previewBody.priceChangedItems).toHaveLength(1);
        // Placing without confirmation is rejected; the stale price is never charged.
        const blocked = await place(cookie, `phase-b-price-${stamp}-123456`);
        expect(blocked.statusCode).toBe(409);
        expect((blocked.json() as { error: { code: string } }).error.code).toBe('CHECKOUT_REQUIRES_UPDATE');
        const confirmed = await place(cookie, `phase-b-price-ok-${stamp}-123456`, { confirmPriceChanges: true });
        expect(confirmed.statusCode).toBe(200);
        expect((confirmed.json() as { data: { order: { grandTotal: number } } }).data.order.grandTotal).toBe(2500 + 250);
        await trackOrder(((confirmed.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber));
      } finally {
        await prisma.productVariant.update({ where: { id: variantId }, data: { priceOverride: 2000 } });
        await app.inject({ method: 'DELETE', url: '/api/v1/cart', headers: { cookie } });
      }
    });
  });

  describe('checkout validation', () => {
    it('rejects empty carts', async () => {
      const cookie = await freshGuestCart();
      const response = await place(cookie, `phase-b-empty-${stamp}-123456`);
      expect(response.statusCode).toBe(409);
      expect((response.json() as { error: { code: string } }).error.code).toBe('CHECKOUT_CART_EMPTY');
    });

    it('rejects invalid zones, methods, and addresses with controlled errors', async () => {
      const cookie = await freshGuestCart();
      await addItem(cookie, variantId, 1);
      const staleZone = await place(cookie, `phase-b-stale-${stamp}-123456`, { shippingZoneCode: 'NOPE-UNKNOWN' });
      expect(staleZone.statusCode).toBe(409);
      const badMethod = await place(cookie, `phase-b-method-${stamp}-123456`, { deliveryMethodId: 'not-a-uuid' });
      expect(badMethod.statusCode).toBe(400);
      const missingZone = await place(cookie, `phase-b-nozone-${stamp}-123456`, { shippingZoneCode: undefined });
      expect(missingZone.statusCode).toBe(400);
      const badAddress = await place(cookie, `phase-b-addr-${stamp}-123456`, { address: { line1: '', city: '', country: 'KE' } });
      expect(badAddress.statusCode).toBe(400);
    });

    it('leaves cart and inventory intact after failed checkout', async () => {
      const cookie = await freshGuestCart();
      await addItem(cookie, variantId, 1);
      const before = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
      const reservationsBefore = await prisma.inventoryReservation.count({ where: { variantId } });
      const failed = await place(cookie, `phase-b-fail-${stamp}-123456`, { shippingZoneCode: 'NOPE-UNKNOWN' });
      expect(failed.statusCode).toBe(409);
      const cart = (await app.inject({ method: 'GET', url: '/api/v1/cart', headers: { cookie } })).json() as { data: { itemCount: number } };
      expect(cart.data.itemCount).toBe(1);
      const after = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(after.quantityReserved).toBe(before.quantityReserved);
      expect(await prisma.inventoryReservation.count({ where: { variantId } })).toBe(reservationsBefore);
    });
  });

  describe('order creation', () => {
    it('creates a transactional order with snapshots, delivery, history, and UNPAID payment', async () => {
      const cookie = await freshGuestCart();
      await addItem(cookie, variantId, 2);
      const reservedBefore = (await prisma.inventory.findUniqueOrThrow({ where: { variantId } })).quantityReserved;
      const response = await place(cookie, `phase-b-order-${stamp}-123456`);
      expect(response.statusCode).toBe(200);
      const data = (response.json() as { data: { order: { orderNumber: string; status: string; paymentStatus: string; grandTotal: number }; replayed: boolean; confirmationToken?: string } }).data;
      expect(data.replayed).toBe(false);
      expect(data.order.status).toBe('PENDING');
      expect(data.order.paymentStatus).toBe('UNPAID');
      expect(data.order.orderNumber).toMatch(/^ORD-\d{8}-[0-9A-F]+$/);
      expect(data.order.grandTotal).toBe(4000 + 250);
      expect(data.confirmationToken).toBeTruthy();
      const order = await trackOrder(data.order.orderNumber);

      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ productName: expect.any(String), sku: expect.any(String), quantity: 2, variantDescription: expect.any(String) });
      expect(Number(items[0].unitPrice)).toBe(2000);
      const delivery = await prisma.delivery.findFirstOrThrow({ where: { orderId: order.id } });
      expect(delivery.status).toBe('PENDING');
      const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
      expect(history.length).toBeGreaterThanOrEqual(1);
      const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } });
      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.quantity).toBe(2);
      const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
      expect(inventory.quantityReserved).toBe(reservedBefore + 2);

      // Cart is finalized only after success: the same guest cookie yields a fresh empty cart.
      const after = (await app.inject({ method: 'GET', url: '/api/v1/cart', headers: { cookie } })).json() as { data: { itemCount: number } };
      expect(after.data.itemCount).toBe(0);
    });

    it('is idempotent: replaying the same key returns the same order once', async () => {
      const cookie = await freshGuestCart();
      await addItem(cookie, variantId, 1);
      const { response: first, key } = await placeSettled(cookie, `phase-b-idem-${stamp}-123456`);
      expect(first.statusCode).toBe(200);
      const firstNumber = ((first.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber);
      await trackOrder(firstNumber);
      // The cart is now checked out; replay with the same key returns the original order.
      const replay = await place(cookie, key);
      expect(replay.statusCode).toBe(200);
      const replayBody = (replay.json() as { data: { order: { orderNumber: string }; replayed: boolean } }).data;
      expect(replayBody.replayed).toBe(true);
      expect(replayBody.order.orderNumber).toBe(firstNumber);
      expect(await prisma.order.count({ where: { orderNumber: firstNumber } })).toBe(1);
    });

    it('issues unique order numbers', async () => {
      const numbers = new Set<string>();
      for (const suffix of ['a', 'b']) {
        const cookie = await freshGuestCart();
        await addItem(cookie, variantId, 1);
        const response = await place(cookie, `phase-b-uniq-${stamp}-${suffix}12345`);
        expect(response.statusCode).toBe(200);
        const orderNumber = ((response.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber);
        numbers.add(orderNumber);
        await trackOrder(orderNumber);
      }
      expect(numbers.size).toBe(2);
    });
  });

  describe('inventory concurrency', () => {
    it('lets only one buyer take the last unit; stock never goes negative', async () => {
      const cookieA = await freshGuestCart();
      const cookieB = await freshGuestCart();
      await addItem(cookieA, lowStockVariantId, 1);
      await addItem(cookieB, lowStockVariantId, 1);
      const [resultA, resultB] = await Promise.all([
        place(cookieA, `phase-b-race-a-${stamp}-123456`),
        place(cookieB, `phase-b-race-b-${stamp}-123456`),
      ]);
      const codes = [resultA.statusCode, resultB.statusCode].sort();
      expect(codes).toEqual([200, 409]);
      const winner = resultA.statusCode === 200 ? resultA : resultB;
      await trackOrder(((winner.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber));
      const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId: lowStockVariantId } });
      expect(inventory.quantityReserved).toBe(1);
      expect(inventory.quantityOnHand - inventory.quantityReserved).toBeGreaterThanOrEqual(0);
      const reservations = await prisma.inventoryReservation.count({ where: { variantId: lowStockVariantId, status: 'ACTIVE' } });
      expect(reservations).toBe(1);
    });
  });

  describe('reservation sweep endpoint', () => {
    it('requires operations access and releases only stale unpaid reservations', async () => {
      const staleOrder = await prisma.order.create({
        data: { orderNumber: tag('STALE-ORD'), status: 'PENDING', paymentStatus: 'UNPAID', subtotal: 100, grandTotal: 100 },
      });
      created.orders.push(staleOrder.id);
      await prisma.inventoryReservation.create({
        data: { variantId, orderId: staleOrder.id, quantity: 1, status: 'ACTIVE', createdAt: new Date(Date.now() - 120 * 60 * 1000) },
      });
      const denied = await app.inject({ method: 'POST', url: '/api/v1/admin/inventory/reservations/release-stale' });
      expect(denied.statusCode).toBe(401);

      const staffRole = await prisma.role.upsert({ where: { slug: 'staff' }, update: {}, create: { name: 'Staff', slug: 'staff' } });
      const staff = await prisma.user.create({ data: { email: `phase-b-staff-${stamp}@example.com`, passwordHash: await hashPassword('password123'), firstName: 'Phase', lastName: 'Staff' } });
      created.users.push(staff.id);
      await prisma.userRole.create({ data: { userId: staff.id, roleId: staffRole.id } });
      const rawToken = crypto.randomUUID();
      await prisma.session.create({ data: { userId: staff.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
      const sweep = await app.inject({ method: 'POST', url: '/api/v1/admin/inventory/reservations/release-stale', headers: { cookie: `veyra_session=${rawToken}` } });
      expect(sweep.statusCode).toBe(200);
      expect(((sweep.json() as { data: { released: number } }).data.released)).toBeGreaterThanOrEqual(1);
      expect((await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: staleOrder.id } })).status).toBe('RELEASED');
    });
  });
});
