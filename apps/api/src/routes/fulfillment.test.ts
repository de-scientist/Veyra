import crypto from 'node:crypto';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Phase D fulfillment matrix: payment gate, delivery lifecycles (courier /
 * local / pickup), transition legality, concurrency collapse, staff details
 * management, snapshot immutability, inventory neutrality, notifications, and
 * RBAC — against the real API + database with self-cleaning fixtures.
 */
describe('fulfillment + delivery (Phase D)', () => {
  const stamp = Date.now().toString(36);
  const tag = (name: string) => `${name}-${stamp}`.toUpperCase().slice(0, 30);
  let app: FastifyInstance;
  let variantId = '';
  let courierMethodId = '';
  let pickupMethodId = '';
  let localMethodId = '';
  let zoneCode = '';
  let customerCookie = '';
  let otherCookie = '';
  let staffCookie = '';
  let staffId = '';
  const created = { users: [] as string[], orders: [] as string[], guestSessions: [] as string[] };
  const ids = { category: '', product: '', zone: '', methods: [] as string[] };

  function cookies(response: { headers: Record<string, unknown> }): string {
    const setCookies = response.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [String(setCookies)] : [];
    return list.map((entry) => String(entry).split(';')[0]).join('; ');
  }

  function checkoutInput(methodId: string) {
    return {
      customerName: 'Phase D Buyer',
      customerEmail: 'phase-d-buyer@example.com',
      customerPhone: '+254712345678',
      deliveryMethodId: methodId,
      shippingZoneCode: zoneCode,
      address: { line1: '4 Fulfillment Ave', city: 'Nairobi', country: 'KE' },
    };
  }

  /** Guest cookie with its session tracked so cleanup stays scoped to this file. */
  function trackGuest(cookie: string) {
    const sessionId = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('veyra_guest_cart='))?.slice('veyra_guest_cart='.length);
    if (sessionId) created.guestSessions.push(decodeURIComponent(sessionId));
    return cookie;
  }

  /**
   * Checkout placement with contractual retry: a transient CHECKOUT_CONFLICT
   * under parallel-suite load is retried with a fresh key (the losing
   * transaction rolled back, so retry is safe).
   */
  async function placeCheckout(cookie: string, methodId: string) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/checkout', headers: { cookie, 'idempotency-key': `phase-d-${stamp}-${crypto.randomUUID()}` }, payload: checkoutInput(methodId),
      });
      const conflict = response.statusCode === 409 && (response.json() as { error?: { code?: string } }).error?.code === 'CHECKOUT_CONFLICT';
      if (!conflict || attempt >= 2) return response;
    }
  }

  /** Guest order placed through real checkout, then marked PAID like a confirmed payment would. */
  async function createPaidOrder(methodId: string, quantity = 1) {
    const cartResponse = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    const cookie = trackGuest(cookies(cartResponse));
    await app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie }, payload: { variantId, quantity } });
    const placed = await placeCheckout(cookie, methodId);
    expect(placed.statusCode).toBe(200);
    const data = (placed.json() as { data: { order: { orderNumber: string }; confirmationToken?: string } }).data;
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: data.order.orderNumber } });
    created.orders.push(order.id);
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: 'CONFIRMED' } });
    await prisma.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { status: 'CONVERTED', convertedAt: new Date() } });
    return { order: await prisma.order.findUniqueOrThrow({ where: { id: order.id } }), token: data.confirmationToken as string };
  }

  async function createUnpaidOrder() {
    const cartResponse = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    const cookie = trackGuest(cookies(cartResponse));
    await app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie }, payload: { variantId, quantity: 1 } });
    const placed = await placeCheckout(cookie, courierMethodId);
    const orderNumber = ((placed.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    created.orders.push(order.id);
    return order;
  }

  async function deliveryIdFor(orderNumber: string) {
    const detail = await app.inject({ method: 'GET', url: `/api/v1/admin/fulfillments/${orderNumber}`, headers: { cookie: staffCookie } });
    expect(detail.statusCode).toBe(200);
    return ((detail.json() as { data: { id: string } }).data.id);
  }

  async function staffMove(orderNumber: string, action: 'start' | 'pick' | 'pack') {
    return app.inject({ method: 'POST', url: `/api/v1/admin/fulfillments/${orderNumber}/${action}`, headers: { cookie: staffCookie }, payload: {} });
  }

  async function staffStatus(deliveryId: string, status: string) {
    return app.inject({ method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/status`, headers: { cookie: staffCookie }, payload: { status } });
  }

  beforeAll(async () => {
    app = await buildApp();
    const category = await prisma.category.create({ data: { name: `Fulfill ${stamp}`, slug: `fulfill-${stamp}` } });
    ids.category = category.id;
    const product = await prisma.product.create({
      data: { name: `Fulfill Widget ${stamp}`, slug: `fulfill-widget-${stamp}`, description: 'Phase D fixture product with sufficient description length.', status: 'ACTIVE', basePrice: 3000, categoryId: category.id },
    });
    ids.product = product.id;
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: tag('FULSKU'), status: 'ACTIVE', priceOverride: 3000, isDefault: true } });
    variantId = variant.id;
    await prisma.inventory.create({ data: { variantId, quantityOnHand: 40, quantityReserved: 0, lowStockThreshold: 2 } });
    const zone = await prisma.shippingZone.create({ data: { name: `Fulfill Zone ${stamp}`, code: tag('FULZONE'), country: 'KE', status: 'ACTIVE' } });
    ids.zone = zone.id;
    zoneCode = zone.code;
    for (const [name, code, type] of [['Fulfill Courier', tag('FULCOU'), 'COURIER'], ['Fulfill Pickup', tag('FULPKU'), 'PICKUP'], ['Fulfill Local', tag('FULLOC'), 'LOCAL_DELIVERY']] as const) {
      const method = await prisma.shippingMethod.create({ data: { name: `${name} ${stamp}`, code, type, status: 'ACTIVE' } });
      ids.methods.push(method.id);
      await prisma.shippingRate.create({ data: { zoneId: zone.id, methodId: method.id, basePrice: 200, minOrderValue: 0, status: 'ACTIVE' } });
      if (type === 'COURIER') courierMethodId = method.id;
      if (type === 'PICKUP') pickupMethodId = method.id;
      if (type === 'LOCAL_DELIVERY') localMethodId = method.id;
    }
    async function makeUser(email: string, roleSlug: 'customer' | 'staff') {
      const role = await prisma.role.upsert({ where: { slug: roleSlug }, update: {}, create: { name: roleSlug, slug: roleSlug } });
      const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword('password123'), firstName: 'Phase', lastName: roleSlug } });
      created.users.push(user.id);
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const rawToken = crypto.randomUUID();
      await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
      return { user, cookie: `veyra_session=${rawToken}` };
    }
    ({ cookie: customerCookie } = await makeUser(`phase-d-cust-${stamp}@example.com`, 'customer'));
    ({ cookie: otherCookie } = await makeUser(`phase-d-other-${stamp}@example.com`, 'customer'));
    const staff = await makeUser(`phase-d-staff-${stamp}@example.com`, 'staff');
    staffCookie = staff.cookie;
    staffId = staff.user.id;
  }, 60000);

  afterAll(async () => {
    for (const orderId of created.orders) {
      await prisma.inventoryReservation.deleteMany({ where: { orderId } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      const deliveries = await prisma.delivery.findMany({ where: { orderId }, select: { id: true } });
      await prisma.deliveryStatusHistory.deleteMany({ where: { deliveryId: { in: deliveries.map((d) => d.id) } } });
      await prisma.auditLog.deleteMany({ where: { entity: 'Delivery', entityId: { in: deliveries.map((d) => d.id) } } });
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
    await prisma.shippingMethod.deleteMany({ where: { id: { in: ids.methods } } });
    await prisma.shippingZone.deleteMany({ where: { id: ids.zone } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
  }, 60000);

  describe('payment gate + authorization', () => {
    it('blocks UNPAID orders from fulfillment', async () => {
      const order = await createUnpaidOrder();
      const response = await staffMove(order.orderNumber, 'start');
      expect(response.statusCode).toBe(409);
      expect((response.json() as { error: { code: string } }).error.code).toBe('ORDER_NOT_PAID');
    });

    it('fences fulfillment to operations staff', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const customer = await app.inject({ method: 'POST', url: `/api/v1/admin/fulfillments/${order.orderNumber}/start`, headers: { cookie: customerCookie }, payload: {} });
      expect(customer.statusCode).toBe(403);
      const anonymous = await app.inject({ method: 'POST', url: `/api/v1/admin/fulfillments/${order.orderNumber}/start`, payload: {} });
      expect(anonymous.statusCode).toBe(401);
    });

    it('rejects illegal jumps and terminal reversals', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      expect((await staffStatus(deliveryId, 'DELIVERED')).statusCode).toBe(409);
      await staffMove(order.orderNumber, 'start');
      await staffMove(order.orderNumber, 'pick');
      await staffMove(order.orderNumber, 'pack');
      expect(((await staffStatus(deliveryId, 'IN_TRANSIT')).statusCode)).toBe(200);
      expect((await staffStatus(deliveryId, 'OUT_FOR_DELIVERY')).statusCode).toBe(200);
      expect((await staffStatus(deliveryId, 'DELIVERED')).statusCode).toBe(200);
      expect((await staffStatus(deliveryId, 'OUT_FOR_DELIVERY')).statusCode).toBe(409);
    });
  });

  describe('courier lifecycle', () => {
    it('runs PENDING → DELIVERED with order mirroring, tracking, and timestamps', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      await staffMove(order.orderNumber, 'start');
      let state = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(state).toMatchObject({ status: 'PROCESSING', fulfillmentStatus: 'UNFULFILLED' });
      await staffMove(order.orderNumber, 'pick');
      state = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(state.fulfillmentStatus).toBe('PROCESSING');
      await staffMove(order.orderNumber, 'pack');
      state = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(state.fulfillmentStatus).toBe('PACKED');
      const shipped = await staffStatus(deliveryId, 'IN_TRANSIT');
      expect(shipped.statusCode).toBe(200);
      const shippedBody = (shipped.json() as { data: { trackingNumber: string | null } }).data;
      expect(shippedBody.trackingNumber).toMatch(/^VYR-\d{8}-[0-9A-F]+$/);
      await staffStatus(deliveryId, 'OUT_FOR_DELIVERY');
      await staffStatus(deliveryId, 'DELIVERED');
      state = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(state).toMatchObject({ status: 'COMPLETED', fulfillmentStatus: 'DELIVERED', paymentStatus: 'PAID' });
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery.shippedAt).not.toBeNull();
      expect(delivery.deliveredAt).not.toBeNull();
      expect(await prisma.deliveryStatusHistory.count({ where: { deliveryId } })).toBe(6);
      expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id } })).toBeGreaterThanOrEqual(3);
    });

    it('collapses concurrent duplicate transitions to one winner', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      const [first, second] = await Promise.all([staffMove(order.orderNumber, 'start'), staffMove(order.orderNumber, 'start')]);
      expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
      expect(await prisma.deliveryStatusHistory.count({ where: { deliveryId, toStatus: 'PREPARING' } })).toBe(1);
    });
  });

  describe('pickup lifecycle', () => {
    it('completes without transit and records pickup time', async () => {
      const { order } = await createPaidOrder(pickupMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      await staffMove(order.orderNumber, 'start');
      await staffMove(order.orderNumber, 'pick');
      await staffMove(order.orderNumber, 'pack');
      expect((await staffStatus(deliveryId, 'IN_TRANSIT')).statusCode).toBe(409);
      expect((await staffStatus(deliveryId, 'READY_FOR_PICKUP')).statusCode).toBe(200);
      expect((await staffStatus(deliveryId, 'PICKED_UP')).statusCode).toBe(200);
      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(delivery.pickedUpAt).not.toBeNull();
      expect(delivery.trackingNumber).toBeNull();
      const state = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(state).toMatchObject({ status: 'COMPLETED', fulfillmentStatus: 'DELIVERED' });
    });

    it('refuses pickup transitions for courier orders', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      await staffMove(order.orderNumber, 'start');
      await staffMove(order.orderNumber, 'pick');
      await staffMove(order.orderNumber, 'pack');
      expect((await staffStatus(deliveryId, 'READY_FOR_PICKUP')).statusCode).toBe(409);
    });
  });

  describe('local delivery assignment', () => {
    it('requires assignment before shipping and validates assignees', async () => {
      const { order } = await createPaidOrder(localMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      await staffMove(order.orderNumber, 'start');
      await staffMove(order.orderNumber, 'pick');
      await staffMove(order.orderNumber, 'pack');
      expect((await staffStatus(deliveryId, 'IN_TRANSIT')).statusCode).toBe(409);
      const badAssignee = await app.inject({ method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/assign`, headers: { cookie: staffCookie }, payload: { assigneeId: crypto.randomUUID() } });
      expect(badAssignee.statusCode).toBe(400);
      const assigned = await app.inject({ method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/assign`, headers: { cookie: staffCookie }, payload: { assigneeId: staffId } });
      expect(assigned.statusCode).toBe(200);
      expect(((assigned.json() as { data: { status: string } }).data.status)).toBe('ASSIGNED');
      expect((await staffStatus(deliveryId, 'IN_TRANSIT')).statusCode).toBe(200);
    });
  });

  describe('delivery details', () => {
    it('lets staff set courier + ETA with history, fenced from customers', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      const updated = await app.inject({
        method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/details`,
        headers: { cookie: staffCookie }, payload: { courierProvider: 'Fargo Couriers', estimatedDeliveryAt: '2026-10-05T09:00:00.000Z' },
      });
      expect(updated.statusCode).toBe(200);
      const body = (updated.json() as { data: { provider: string; estimatedDeliveryAt: string; status: string } }).data;
      expect(body.provider).toBe('Fargo Couriers');
      expect(body.status).toBe('PENDING');
      const history = await prisma.deliveryStatusHistory.findFirstOrThrow({ where: { deliveryId }, orderBy: { createdAt: 'desc' } });
      expect(history.note).toMatch(/Delivery details updated/);
      const detailAudit = await prisma.auditLog.findFirst({ where: { entity: 'Delivery', entityId: deliveryId }, orderBy: { createdAt: 'desc' } });
      expect(detailAudit).toMatchObject({ action: 'ORDER_UPDATED', actorId: staffId });
      const customer = await app.inject({ method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/details`, headers: { cookie: customerCookie }, payload: { courierProvider: 'Evil' } });
      expect(customer.statusCode).toBe(403);
      const badEta = await app.inject({ method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/details`, headers: { cookie: staffCookie }, payload: { estimatedDeliveryAt: 'not-a-date' } });
      expect(badEta.statusCode).toBe(400);
      const empty = await app.inject({ method: 'POST', url: `/api/v1/admin/deliveries/${deliveryId}/details`, headers: { cookie: staffCookie }, payload: {} });
      expect(empty.statusCode).toBe(400);
    });

    it('hides internal identifiers from customer tracking', async () => {
      const { order, token } = await createPaidOrder(courierMethodId);
      const tracking = await app.inject({ method: 'GET', url: `/api/v1/orders/${order.orderNumber}/delivery?token=${token}` });
      expect(tracking.statusCode).toBe(200);
      const body = tracking.json() as Record<string, unknown>;
      expect('internalReference' in body).toBe(false);
      expect('providerShipmentId' in body).toBe(false);
      expect('recipient' in body).toBe(false);
      expect('assignee' in body).toBe(false);
      expect(body.trackingNumber ?? null).toBeNull();
    });
  });

  describe('order access + snapshots', () => {
    it('scopes customer order reads to owners', async () => {
      // Authenticated checkout binds the order to the customer.
      await app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie: customerCookie }, payload: { variantId, quantity: 1 } });
      const placed = await placeCheckout(customerCookie, courierMethodId);
      expect(placed.statusCode).toBe(200);
      const orderNumber = ((placed.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber);
      created.orders.push((await prisma.order.findUniqueOrThrow({ where: { orderNumber } })).id);
      const own = await app.inject({ method: 'GET', url: `/api/v1/account/orders/${orderNumber}`, headers: { cookie: customerCookie } });
      expect(own.statusCode).toBe(200);
      const stranger = await app.inject({ method: 'GET', url: `/api/v1/account/orders/${orderNumber}`, headers: { cookie: otherCookie } });
      expect(stranger.statusCode).toBe(404);
      const deliveryStranger = await app.inject({ method: 'GET', url: `/api/v1/orders/${orderNumber}/delivery`, headers: { cookie: otherCookie } });
      expect(deliveryStranger.statusCode).toBe(404);
    });

    it('preserves committed snapshots when configuration changes', async () => {
      const { order } = await createPaidOrder(courierMethodId, 2);
      const before = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, deliveries: true } });
      const beforeTotals = { subtotal: Number(before.subtotal), shippingTotal: Number(before.shippingTotal), grandTotal: Number(before.grandTotal) };
      // Mutate live configuration + product + address after confirmation.
      await prisma.shippingRate.updateMany({ where: { zoneId: ids.zone }, data: { basePrice: 9999 } });
      await prisma.shippingZone.update({ where: { id: ids.zone }, data: { name: 'Renamed Zone' } });
      await prisma.product.update({ where: { id: ids.product }, data: { basePrice: 99999 } });
      try {
        const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true, deliveries: true } });
        expect(Number(after.subtotal)).toBe(beforeTotals.subtotal);
        expect(Number(after.shippingTotal)).toBe(beforeTotals.shippingTotal);
        expect(Number(after.grandTotal)).toBe(beforeTotals.grandTotal);
        expect(after.items[0].unitPrice.toString()).toBe(before.items[0].unitPrice.toString());
        expect(after.deliveries[0].deliveryAddress).toEqual(before.deliveries[0].deliveryAddress);
      } finally {
        await prisma.shippingRate.updateMany({ where: { zoneId: ids.zone }, data: { basePrice: 200 } });
        await prisma.shippingZone.update({ where: { id: ids.zone }, data: { name: `Fulfill Zone ${stamp}` } });
        await prisma.product.update({ where: { id: ids.product }, data: { basePrice: 3000 } });
      }
    });
  });

  describe('inventory neutrality + notifications', () => {
    it('never re-deducts stock during fulfillment', async () => {
      const { order } = await createPaidOrder(courierMethodId, 2);
      // Baseline after the order's own checkout reservation: fulfillment must not move stock at all.
      const stockBefore = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
      const deliveryId = await deliveryIdFor(order.orderNumber);
      await staffMove(order.orderNumber, 'start');
      await staffMove(order.orderNumber, 'pick');
      await staffMove(order.orderNumber, 'pack');
      await staffStatus(deliveryId, 'IN_TRANSIT');
      await staffStatus(deliveryId, 'OUT_FOR_DELIVERY');
      await staffStatus(deliveryId, 'DELIVERED');
      const stockAfter = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
      // Fulfillment converts nothing new: reservations were CONVERTED at payment;
      // only the payment-time OUT movement exists for this order.
      expect(stockAfter.quantityReserved).toBe(stockBefore.quantityReserved);
      expect(stockAfter.quantityOnHand).toBeLessThanOrEqual(stockBefore.quantityOnHand);
      expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'OUT' } })).toBe(0);
      expect((await prisma.inventoryReservation.findMany({ where: { orderId: order.id } })).every((r) => r.status === 'CONVERTED')).toBe(true);
    });

    it('emits each fulfillment event exactly once', async () => {
      const { order } = await createPaidOrder(courierMethodId);
      const deliveryId = await deliveryIdFor(order.orderNumber);
      await staffMove(order.orderNumber, 'start');
      await staffMove(order.orderNumber, 'pick');
      await staffMove(order.orderNumber, 'pack');
      await staffStatus(deliveryId, 'IN_TRANSIT');
      await staffStatus(deliveryId, 'OUT_FOR_DELIVERY');
      await staffStatus(deliveryId, 'DELIVERED');
      for (const eventType of ['ORDER_SHIPPED', 'ORDER_OUT_FOR_DELIVERY', 'ORDER_DELIVERED']) {
        expect(await prisma.notificationOutbox.count({ where: { aggregateId: deliveryId, eventType } })).toBe(1);
      }
    });
  });
});
