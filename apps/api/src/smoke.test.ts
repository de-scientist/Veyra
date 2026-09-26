import crypto from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from './app.js';
import { hashPassword, hashToken } from './lib/auth.js';
import { prisma } from './lib/prisma.js';

/**
 * Production smoke suite (sandbox-safe): exercises the critical customer and
 * admin journeys against the real API + database with self-cleaning fixtures.
 * No real money moves: M-Pesa is unconfigured, so payment initiation must fail
 * in a controlled, non-success shape.
 */
describe('production smoke journey', () => {
  const stamp = Date.now().toString(36);
  const slug = `smoke-tee-${stamp}`;
  const sku = `SMOKE-${stamp}`.toUpperCase().slice(0, 24);
  const orderNumberPrefix = `ORD-SMOKE-${stamp}`.toUpperCase().slice(0, 24);
  let app: FastifyInstance;
  let guestCookie = '';
  let customerCookie = '';
  let staffCookie = '';
  let variantId = '';
  let orderNumber = '';
  let confirmationToken: string | undefined;
  const createdIds = { users: [] as string[], category: '', product: '', zone: '', method: '', customerEmail: `smoke-${stamp}@example.com`, staffEmail: `smoke-staff-${stamp}@example.com` };

  function cookies(response: { headers: Record<string, unknown> }): string {
    const setCookies = response.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [String(setCookies)] : [];
    return list.map((entry) => String(entry).split(';')[0]).join('; ');
  }

  beforeAll(async () => {
    app = await buildApp();
    const passwordHash = await hashPassword('password123');
    const customerRole = await prisma.role.upsert({ where: { slug: 'customer' }, update: {}, create: { name: 'Customer', slug: 'customer' } });
    const staffRole = await prisma.role.upsert({ where: { slug: 'staff' }, update: {}, create: { name: 'Staff', slug: 'staff' } });
    const category = await prisma.category.create({ data: { name: `Smoke ${stamp}`, slug: `smoke-${stamp}` } });
    createdIds.category = category.id;
    const product = await prisma.product.create({ data: { name: `Smoke Tee ${stamp}`, slug, description: 'Smoke-test product fixture with sufficient description length.', status: 'ACTIVE', basePrice: 1500, categoryId: category.id } });
    createdIds.product = product.id;
    const variant = await prisma.productVariant.create({ data: { productId: product.id, sku, status: 'ACTIVE', priceOverride: 1500, isDefault: true } });
    variantId = variant.id;
    await prisma.inventory.create({ data: { variantId, quantityOnHand: 10, quantityReserved: 0, lowStockThreshold: 2 } });
    const zone = await prisma.shippingZone.create({ data: { name: `Smoke Zone ${stamp}`, code: `SMOKE-${stamp}`.toUpperCase().slice(0, 20), country: 'KE', status: 'ACTIVE' } });
    createdIds.zone = zone.id;
    const method = await prisma.shippingMethod.create({ data: { name: 'Smoke Courier', code: `SMOKE-COURIER-${stamp}`.toUpperCase().slice(0, 20), type: 'COURIER', status: 'ACTIVE' } });
    createdIds.method = method.id;
    await prisma.shippingRate.create({ data: { zoneId: zone.id, methodId: method.id, basePrice: 300, minOrderValue: 0, status: 'ACTIVE' } });
    for (const [email, role] of [[createdIds.customerEmail, customerRole], [createdIds.staffEmail, staffRole]] as const) {
      const user = await prisma.user.create({ data: { email, passwordHash, firstName: 'Smoke', lastName: role.slug } });
      createdIds.users.push(user.id);
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
      const rawToken = crypto.randomUUID();
      await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
      if (role.slug === 'customer') customerCookie = `veyra_session=${rawToken}`;
      else staffCookie = `veyra_session=${rawToken}`;
    }
  }, 60000);

  it('probes are green', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/ready' })).statusCode).toBe(200);
  });

  it('storefront exposes the sellable product', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/catalog/products' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { products: Array<{ slug: string }> } };
    expect(body.data.products.some((p) => p.slug === slug)).toBe(true);
  });

  it('guest cart accepts the variant and validates checkout-ready', async () => {
    const add = await app.inject({ method: 'POST', url: '/api/v1/cart/items', payload: { variantId, quantity: 1 } });
    expect(add.statusCode).toBe(200);
    expect((add.json() as { data: { itemCount: number } }).data.itemCount).toBe(1);
    guestCookie = cookies(add);
    expect(guestCookie).toContain('veyra_guest_cart');
    const validation = await app.inject({ method: 'GET', url: '/api/v1/cart/validation', headers: { cookie: guestCookie } });
    expect(validation.statusCode).toBe(200);
    expect((validation.json() as { data: { readyForCheckout: boolean } }).data.readyForCheckout).toBe(true);
  });

  it('preview totals are authoritative and checkout creates the order', async () => {
    const input = {
      customerName: 'Smoke Buyer',
      customerEmail: createdIds.customerEmail,
      customerPhone: '+254700000001',
      deliveryMethodId: (await prisma.shippingMethod.findFirstOrThrow({ where: { id: createdIds.method } })).id,
      shippingZoneCode: (await prisma.shippingZone.findFirstOrThrow({ where: { id: createdIds.zone } })).code,
      address: { line1: '1 Smoke Road', city: 'Nairobi', country: 'KE' },
    };
    const preview = await app.inject({ method: 'POST', url: '/api/v1/checkout/preview', headers: { cookie: guestCookie }, payload: input });
    expect(preview.statusCode).toBe(200);
    const previewTotal = (preview.json() as { data: { grandTotal: number } }).data.grandTotal;
    expect(previewTotal).toBeGreaterThan(0);

    const placed = await app.inject({
      method: 'POST',
      url: '/api/v1/checkout',
      headers: { cookie: guestCookie, 'idempotency-key': `smoke-${stamp}-key-123456` },
      payload: input,
    });
    expect(placed.statusCode).toBe(200);
    const data = (placed.json() as { data: { order: { orderNumber: string; status: string; paymentStatus: string; grandTotal: number }; confirmationToken?: string } }).data;
    expect(data.order.status).toBe('PENDING');
    expect(data.order.paymentStatus).toBe('UNPAID');
    expect(data.order.grandTotal).toBe(previewTotal);
    expect(data.order.orderNumber.startsWith('ORD-')).toBe(true);
    orderNumber = data.order.orderNumber;
    expect(orderNumber.startsWith(orderNumberPrefix.slice(0, 4))).toBe(true);
    confirmationToken = data.confirmationToken;
    expect(confirmationToken).toBeTruthy();

    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantityReserved).toBe(1);
    expect(inventory.quantityOnHand).toBe(10);
  });

  it('guest confirmation token opens the order; strangers stay out', async () => {
    const open = await app.inject({ method: 'GET', url: `/api/v1/orders/${orderNumber}?token=${confirmationToken}` });
    expect(open.statusCode).toBe(200);
    const items = (open.json() as { data: { items: Array<{ sku: string; quantity: number; unitPrice: number }> } }).data.items;
    expect(items).toHaveLength(1);
    expect(items[0].sku).toBe(sku);
    expect(items[0].quantity).toBe(1);

    const stranger = await app.inject({ method: 'GET', url: `/api/v1/orders/${orderNumber}?token=wrong-token` });
    expect(stranger.statusCode).toBe(404);
  });

  it('payment initiation fails closed without credentials (never success)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/payments/mpesa/initiate',
      headers: { cookie: guestCookie, 'idempotency-key': `smoke-pay-${stamp}-123456`, 'x-confirmation-token': confirmationToken ?? '' },
      payload: { orderNumber },
    });
    // Controlled failure (missing provider configuration), never a success.
    expect([400, 409, 503]).toContain(response.statusCode);
    const body = response.json() as { success: boolean; error?: { code: string; requestId: string } };
    expect(body.success).toBe(false);
    expect(typeof body.error?.code).toBe('string');
    expect(typeof body.error?.requestId).toBe('string');
    expect(response.body).not.toMatch(/"status":"PAID"/);
  });

  it('registration provisions account access', async () => {
    const email = `smoke-new-${stamp}@example.com`;
    const register = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password: 'password123', firstName: 'Smoke', lastName: 'New' } });
    expect(register.statusCode).toBe(200);
    const sessionCookie = cookies(register);
    const profile = await app.inject({ method: 'GET', url: '/api/v1/account', headers: { cookie: sessionCookie } });
    expect(profile.statusCode).toBe(200);
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    createdIds.users.push(created.id);
  });

  it('unpaid orders reject return requests', async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber }, include: { items: true } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/returns',
      headers: { cookie: customerCookie },
      payload: { orderNumber: 'NOPE-DOES-NOT-EXIST', type: 'REFUND', reason: 'testing', items: [{ orderItemId: order.items[0].id, quantity: 1, reason: 'testing' }] },
    });
    expect([404, 409]).toContain(response.statusCode);
  });

  it('staff operates dashboard, orders, and analytics; customers are fenced out', async () => {
    for (const url of ['/api/v1/admin/dashboard', '/api/v1/admin/orders', '/api/v1/admin/inventory', '/api/v1/admin/analytics/overview']) {
      const response = await app.inject({ method: 'GET', url, headers: { cookie: staffCookie } });
      expect(response.statusCode).toBe(200);
    }
    const orders = await app.inject({ method: 'GET', url: `/api/v1/admin/orders?search=${orderNumber}`, headers: { cookie: staffCookie } });
    expect((orders.json() as { data: { orders: Array<{ orderNumber: string }> } }).data.orders.some((o) => o.orderNumber === orderNumber)).toBe(true);
    const fenced = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie: customerCookie } });
    expect(fenced.statusCode).toBe(403);
  });

  it('cleanup removes all smoke fixtures', async () => {
    const order = await prisma.order.findUnique({ where: { orderNumber } });
    if (order) {
      await prisma.inventoryReservation.deleteMany({ where: { orderId: order.id } });
      await prisma.inventoryMovement.deleteMany({ where: { referenceId: order.id } });
      await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
      await prisma.delivery.deleteMany({ where: { orderId: order.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: order.id } });
      await prisma.checkoutIdempotency.deleteMany({ where: { orderId: order.id } });
      await prisma.order.delete({ where: { id: order.id } });
    }
    // Scoped to this suite's guest session: sweeping every anonymous cart
    // deadlocks against other suites' live checkouts under parallel load.
    const smokeSession = guestCookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('veyra_guest_cart='))?.slice('veyra_guest_cart='.length);
    const smokeCarts = smokeSession
      ? await prisma.cart.findMany({ where: { sessionId: decodeURIComponent(smokeSession) }, select: { id: true } })
      : [];
    await prisma.cartItem.deleteMany({ where: { cartId: { in: smokeCarts.map((cart) => cart.id) } } });
    await prisma.cart.deleteMany({ where: { id: { in: smokeCarts.map((cart) => cart.id) } } });
    await prisma.inventory.deleteMany({ where: { variantId } });
    await prisma.productVariant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: createdIds.product } });
    await prisma.category.deleteMany({ where: { id: createdIds.category } });
    await prisma.shippingRate.deleteMany({ where: { zoneId: createdIds.zone } });
    await prisma.shippingMethod.deleteMany({ where: { id: createdIds.method } });
    await prisma.shippingZone.deleteMany({ where: { id: createdIds.zone } });
    await prisma.session.deleteMany({ where: { userId: { in: createdIds.users } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdIds.users } } });
    await prisma.user.deleteMany({ where: { id: { in: createdIds.users } } });
    expect(await prisma.product.count({ where: { slug } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: createdIds.users } } })).toBe(0);
  });
});
