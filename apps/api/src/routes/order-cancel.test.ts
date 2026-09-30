import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { handleMpesaCallback } from '../lib/payments/service.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `cancel-${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
let variantId = '';

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Cancel', lastName: roleSlug, status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.upsert({ where: { slug: roleSlug }, update: {}, create: { name: roleSlug, slug: roleSlug } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

let orderCounter = 0;
async function buildOrder(options?: { paymentStatus?: 'UNPAID' | 'PAID'; fulfillmentStatus?: 'UNFULFILLED' | 'SHIPPED'; reserved?: number; onHand?: number }) {
  orderCounter += 1;
  const reserved = options?.reserved ?? 2;
  const onHand = options?.onHand ?? 10;
  const order = await prisma.order.create({
    data: {
      orderNumber: `CXL-${stamp}-${orderCounter}`.toUpperCase(),
      status: 'PENDING',
      paymentStatus: options?.paymentStatus ?? 'UNPAID',
      fulfillmentStatus: options?.fulfillmentStatus ?? 'UNFULFILLED',
      subtotal: 5000,
      grandTotal: 5000,
      currency: 'KES',
    },
  });
  createdOrderIds.push(order.id);
  await prisma.inventory.update({ where: { variantId }, data: { quantityOnHand: onHand, quantityReserved: reserved } });
  await prisma.inventoryReservation.create({ data: { variantId, orderId: order.id, quantity: reserved, status: 'ACTIVE' } });
  return order;
}

beforeAll(async () => {
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.staff, 'staff');
  const product = await prisma.product.create({
    data: { name: `Cancel Widget ${stamp}`, slug: `cancel-widget-${stamp}`, description: 'Cancellation fixture product.', status: 'ACTIVE', basePrice: 2500 },
  });
  createdProductIds.push(product.id);
  const variant = await prisma.productVariant.create({ data: { productId: product.id, sku: `CXL-${stamp}`.toUpperCase().slice(0, 32), status: 'ACTIVE', priceOverride: 2500 } });
  variantId = variant.id;
  await prisma.inventory.create({ data: { variantId, quantityOnHand: 10, quantityReserved: 0, lowStockThreshold: 2 } });
}, 60000);

afterAll(async () => {
  await prisma.inventoryReservation.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.inventoryMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } });
  const payments = await prisma.payment.findMany({ where: { orderId: { in: createdOrderIds } }, select: { id: true } });
  await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: payments.map((p) => p.id) } } });
  await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.inventory.deleteMany({ where: { variantId } });
  await prisma.productVariant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('order cancellation with inventory release', () => {
  it('denies customers and requires a reason', async () => {
    const order = await buildOrder();
    expect((await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.customer, { reason: 'Changed mind' })).statusCode).toBe(403);
    expect((await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.staff, {})).statusCode).toBe(400);
    expect((await call('POST', '/api/v1/admin/orders/ORD-NOPE/cancel', emails.staff, { reason: 'Changed mind' })).statusCode).toBe(404);
  });

  it('cancels an unpaid order and releases its reservation exactly once', async () => {
    const order = await buildOrder();
    const response = await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.staff, { reason: 'Customer changed mind' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ success: true, data: { status: 'CANCELLED', releasedReservations: 1, alreadyCancelled: false } });

    const inventory = await prisma.inventory.findUniqueOrThrow({ where: { variantId } });
    expect(inventory.quantityReserved).toBe(0);
    expect(inventory.quantityOnHand).toBe(10);
    const reservation = await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } });
    expect(reservation.status).toBe('RELEASED');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'RELEASED', reason: 'ORDER_CANCELLED' } })).toBe(1);
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, status: 'CANCELLED' } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entity: 'Order', entityId: order.id, action: 'ORDER_CANCELLED' } })).toBe(1);

    // Idempotent re-cancel: no second release, no duplicate movement.
    const rerun = await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.staff, { reason: 'Customer changed mind' });
    expect((rerun.json() as { data: { alreadyCancelled: boolean; releasedReservations: number } }).data).toMatchObject({ alreadyCancelled: true, releasedReservations: 0 });
    expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'RELEASED' } })).toBe(1);
  });

  it('skips already-released reservations without double release', async () => {
    const order = await buildOrder();
    await prisma.inventoryReservation.updateMany({ where: { orderId: order.id }, data: { status: 'RELEASED', releasedAt: new Date() } });
    await prisma.inventory.update({ where: { variantId }, data: { quantityReserved: 0 } });
    const response = await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.staff, { reason: 'Duplicate request path' });
    expect((response.json() as { data: { releasedReservations: number } }).data.releasedReservations).toBe(0);
    expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'RELEASED' } })).toBe(0);
  });

  it('refuses paid and fulfilled orders with actionable codes', async () => {
    const paid = await buildOrder({ paymentStatus: 'PAID' });
    const paidResponse = await call('POST', `/api/v1/admin/orders/${paid.orderNumber}/cancel`, emails.staff, { reason: 'Should use returns' });
    expect(paidResponse.statusCode).toBe(409);
    expect((paidResponse.json() as { error: { code: string } }).error.code).toBe('ORDER_PAID_USE_RETURNS');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: paid.id } })).status).toBe('PENDING');

    const shipped = await buildOrder({ fulfillmentStatus: 'SHIPPED' });
    const shippedResponse = await call('POST', `/api/v1/admin/orders/${shipped.orderNumber}/cancel`, emails.staff, { reason: 'Too late' });
    expect(shippedResponse.statusCode).toBe(409);
    expect((shippedResponse.json() as { error: { code: string } }).error.code).toBe('ORDER_FULFILLED');
  });

  it('rolls back when a reservation cannot be released (no partial cancel)', async () => {
    // Reservation claims 5 but only 2 are reserved: data anomaly simulation.
    const order = await buildOrder({ reserved: 5, onHand: 10 });
    await prisma.inventory.update({ where: { variantId }, data: { quantityReserved: 2 } });
    const response = await call('POST', `/api/v1/admin/orders/${order.orderNumber}/cancel`, emails.staff, { reason: 'Anomaly path' });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('ORDER_INVENTORY_SYNC_FAILED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('PENDING');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'RELEASED' } })).toBe(0);
  });

  it('confirms payment without rolling back on inventory mismatch (reconciliation flagged)', async () => {
    const order = await buildOrder({ reserved: 2, onHand: 10 });
    // Simulate a swept reservation ledger: reservation ACTIVE but nothing reserved.
    await prisma.inventory.update({ where: { variantId }, data: { quantityReserved: 0 } });
    const payment = await prisma.payment.create({ data: { orderId: order.id, provider: 'MPESA', status: 'PENDING', amount: 5000, currency: 'KES' } });
    const checkoutRequestId = `ws_CO_${stamp}_reconcile`;
    await prisma.paymentTransaction.create({
      data: { paymentId: payment.id, provider: 'MPESA', providerRequestId: checkoutRequestId, amount: 5000, currency: 'KES', status: 'PENDING' },
    });
    const result = await handleMpesaCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'm_mock',
          CheckoutRequestID: checkoutRequestId,
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 5000 },
              { Name: 'MpesaReceiptNumber', Value: `RCPT-${stamp}` },
              { Name: 'PhoneNumber', Value: 254712345678 },
            ],
          },
        },
      },
    });
    expect(result).toMatchObject({ acknowledged: true, processed: true, successful: true, reconciliationRequired: true });
    // Money truth wins: payment confirmed even though stock needs attention.
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe('PAID');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).paymentStatus).toBe('PAID');
    expect((await prisma.inventoryReservation.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe('ACTIVE');
    expect(await prisma.inventoryMovement.count({ where: { referenceId: order.id, movementType: 'OUT' } })).toBe(0);
  });
});
