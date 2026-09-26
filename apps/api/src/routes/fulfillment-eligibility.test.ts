import crypto from 'node:crypto';

import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Phase D eligibility gate + audit trail: the authoritative eligibility check
 * (read endpoint + start enforcement) and append-only audit coverage for
 * fulfillment transitions. Separate file from fulfillment.test.ts so each
 * suite stays inside the per-app rate-limit budget.
 */
describe('fulfillment eligibility + audit (Phase D)', () => {
  const stamp = Date.now().toString(36);
  const tag = (name: string) => `${name}-${stamp}`.toUpperCase().slice(0, 30);
  let app: FastifyInstance;
  let variantId = '';
  let courierMethodId = '';
  let zoneCode = '';
  let customerCookie = '';
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
      customerName: 'Phase D Eligibility',
      customerEmail: 'phase-d-elig@example.com',
      customerPhone: '+254712345678',
      deliveryMethodId: methodId,
      shippingZoneCode: zoneCode,
      address: { line1: '9 Eligibility Rd', city: 'Nairobi', country: 'KE' },
    };
  }

  function trackGuest(cookie: string) {
    const sessionId = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('veyra_guest_cart='))?.slice('veyra_guest_cart='.length);
    if (sessionId) created.guestSessions.push(decodeURIComponent(sessionId));
    return cookie;
  }

  async function placeCheckout(cookie: string, methodId: string) {
    for (let attempt = 0; ; attempt += 1) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/checkout', headers: { cookie, 'idempotency-key': `phase-d-elig-${stamp}-${crypto.randomUUID()}` }, payload: checkoutInput(methodId),
      });
      const conflict = response.statusCode === 409 && (response.json() as { error?: { code?: string } }).error?.code === 'CHECKOUT_CONFLICT';
      if (!conflict || attempt >= 2) return response;
    }
  }

  async function createPaidOrder() {
    const cartResponse = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    const cookie = trackGuest(cookies(cartResponse));
    await app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie }, payload: { variantId, quantity: 1 } });
    const placed = await placeCheckout(cookie, courierMethodId);
    expect(placed.statusCode).toBe(200);
    const data = (placed.json() as { data: { order: { orderNumber: string } } }).data;
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: data.order.orderNumber } });
    created.orders.push(order.id);
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', status: 'CONFIRMED' } });
    await prisma.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { status: 'CONVERTED', convertedAt: new Date() } });
    return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
  }

  async function createUnpaidOrder() {
    const cartResponse = await app.inject({ method: 'GET', url: '/api/v1/cart' });
    const cookie = trackGuest(cookies(cartResponse));
    await app.inject({ method: 'POST', url: '/api/v1/cart/items', headers: { cookie }, payload: { variantId, quantity: 1 } });
    const placed = await placeCheckout(cookie, courierMethodId);
    expect(placed.statusCode).toBe(200);
    const orderNumber = ((placed.json() as { data: { order: { orderNumber: string } } }).data.order.orderNumber);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    created.orders.push(order.id);
    return order;
  }

  async function staffMove(orderNumber: string, action: 'start' | 'pick' | 'pack') {
    return app.inject({ method: 'POST', url: `/api/v1/admin/fulfillments/${orderNumber}/${action}`, headers: { cookie: staffCookie }, payload: {} });
  }

  beforeAll(async () => {
    app = await buildApp();
    const category = await prisma.category.create({ data: { name: `Elig ${stamp}`, slug: `elig-${stamp}` } });
    ids.category = category.id;
    const product = await prisma.product.create({
      data: { name: `Elig Widget ${stamp}`, slug: `elig-widget-${stamp}`, description: 'Phase D eligibility fixture with sufficient description length.', status: 'ACTIVE', basePrice: 2500, categoryId: category.id },
    });
    ids.product = product.id;
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: tag('ELIGSKU'), status: 'ACTIVE', priceOverride: 2500, isDefault: true } });
    variantId = variant.id;
    await prisma.inventory.create({ data: { variantId, quantityOnHand: 20, quantityReserved: 0, lowStockThreshold: 2 } });
    const zone = await prisma.shippingZone.create({ data: { name: `Elig Zone ${stamp}`, code: tag('ELIGZONE'), country: 'KE', status: 'ACTIVE' } });
    ids.zone = zone.id;
    zoneCode = zone.code;
    const method = await prisma.shippingMethod.create({ data: { name: `Elig Courier ${stamp}`, code: tag('ELIGCOU'), type: 'COURIER', status: 'ACTIVE' } });
    ids.methods.push(method.id);
    courierMethodId = method.id;
    await prisma.shippingRate.create({ data: { zoneId: zone.id, methodId: method.id, basePrice: 200, minOrderValue: 0, status: 'ACTIVE' } });
    async function makeUser(email: string, roleSlug: 'customer' | 'staff') {
      const role = await prisma.role.upsert({ where: { slug: roleSlug }, update: {}, create: { name: roleSlug, slug: roleSlug } });
      const user = await prisma.user.create({ data: { email, passwordHash: await hashPassword('password123'), firstName: 'Phase', lastName: roleSlug } });
      created.users.push(user.id);
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const rawToken = crypto.randomUUID();
      await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
      return { user, cookie: `veyra_session=${rawToken}` };
    }
    ({ cookie: customerCookie } = await makeUser(`phase-d-elig-cust-${stamp}@example.com`, 'customer'));
    const staff = await makeUser(`phase-d-elig-staff-${stamp}@example.com`, 'staff');
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

  it('reports eligibility for paid, unpaid, and unknown orders', async () => {
    const order = await createPaidOrder();
    const eligible = await app.inject({ method: 'GET', url: `/api/v1/admin/fulfillments/${order.orderNumber}/eligibility`, headers: { cookie: staffCookie } });
    expect(eligible.statusCode).toBe(200);
    expect((eligible.json() as { data: { eligible: boolean; reasons: string[] } }).data).toMatchObject({ eligible: true, reasons: [] });

    const unpaid = await createUnpaidOrder();
    const blocked = await app.inject({ method: 'GET', url: `/api/v1/admin/fulfillments/${unpaid.orderNumber}/eligibility`, headers: { cookie: staffCookie } });
    expect(blocked.statusCode).toBe(200);
    const blockedBody = (blocked.json() as { data: { eligible: boolean; reasons: string[] } }).data;
    expect(blockedBody.eligible).toBe(false);
    expect(blockedBody.reasons.join(' ')).toMatch(/Payment is not confirmed/);

    const customer = await app.inject({ method: 'GET', url: `/api/v1/admin/fulfillments/${order.orderNumber}/eligibility`, headers: { cookie: customerCookie } });
    expect(customer.statusCode).toBe(403);
    const missing = await app.inject({ method: 'GET', url: '/api/v1/admin/fulfillments/ORD-DOES-NOT-EXIST/eligibility', headers: { cookie: staffCookie } });
    expect(missing.statusCode).toBe(404);
  });

  it('refuses to start fulfillment when reservations are not converted', async () => {
    const order = await createPaidOrder();
    await prisma.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { status: 'ACTIVE', convertedAt: null } });
    const response = await staffMove(order.orderNumber, 'start');
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('FULFILLMENT_INELIGIBLE');
    await prisma.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { status: 'CONVERTED', convertedAt: new Date() } });
    expect((await staffMove(order.orderNumber, 'start')).statusCode).toBe(200);
  });

  it('writes an audit log entry for every fulfillment transition', async () => {
    const order = await createPaidOrder();
    const detail = await app.inject({ method: 'GET', url: `/api/v1/admin/fulfillments/${order.orderNumber}`, headers: { cookie: staffCookie } });
    const deliveryId = ((detail.json() as { data: { id: string } }).data.id);
    await staffMove(order.orderNumber, 'start');
    await staffMove(order.orderNumber, 'pick');
    const entries = await prisma.auditLog.findMany({ where: { entity: 'Delivery', entityId: deliveryId }, orderBy: { createdAt: 'asc' } });
    expect(entries.length).toBe(2);
    expect(entries[0]).toMatchObject({ action: 'ORDER_UPDATED', actorId: staffId });
  });
});
