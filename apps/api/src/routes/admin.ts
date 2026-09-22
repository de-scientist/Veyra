import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  requireAdminAccess,
  requireOperationsAccess,
  requireSuperAdmin,
} from '../middleware/operations.js';

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  search: z.string().trim().max(120).optional(),
});

type AuthedRequest = FastifyRequest & { user?: { id: string } };

function actorId(request: FastifyRequest): string {
  const user = (request as AuthedRequest).user;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return user.id;
}

function auditMeta(request: FastifyRequest) {
  return { ipAddress: request.ip, userAgent: request.headers['user-agent']?.slice(0, 300) };
}

function paginate(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function conflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'ALREADY_EXISTS', 'A record with these unique details already exists.');
  }
  throw error;
}

const orderListSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED']).optional(),
  paymentStatus: z.enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
  fulfillmentStatus: z.enum(['UNFULFILLED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { createdAt: 'desc' as const }, include: { transactions: { select: { id: true, status: true, amount: true, currency: true, providerReference: true, failureReason: true, createdAt: true } } } },
  deliveries: { include: { shippingMethod: true, shippingZone: true, history: { orderBy: { createdAt: 'asc' as const } } } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  returnRequests: { include: { items: true, refund: { select: { refundNumber: true, amount: true, status: true } } } },
  refunds: { orderBy: { createdAt: 'desc' as const }, select: { id: true, refundNumber: true, amount: true, currency: true, status: true, providerReference: true, reason: true, requestedAt: true, processedAt: true } },
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } },
} satisfies Prisma.OrderInclude;

function serializeAdminOrder(order: Prisma.OrderGetPayload<{ include: typeof orderInclude }>) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    customer: {
      name: order.customerName,
      email: order.customerEmail,
      phone: order.customerPhone,
      account: order.user ? { id: order.user.id, email: order.user.email, name: `${order.user.firstName} ${order.user.lastName}`, status: order.user.status } : null,
      guest: order.userId === null,
    },
    totals: {
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      shippingTotal: Number(order.shippingTotal),
      taxTotal: Number(order.taxTotal),
      grandTotal: Number(order.grandTotal),
      currency: order.currency,
    },
    items: order.items.map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      variantDescription: item.variantDescription,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
      subtotal: Number(item.subtotal),
      total: Number(item.total),
    })),
    payments: order.payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      status: payment.status,
      amount: Number(payment.amount),
      currency: payment.currency,
      providerReference: payment.providerReference,
      failureReason: payment.failureReason,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      transactions: payment.transactions,
    })),
    deliveries: order.deliveries.map((delivery) => ({
      id: delivery.id,
      status: delivery.status,
      trackingNumber: delivery.trackingNumber,
      courierProvider: delivery.courierProvider,
      method: delivery.shippingMethod ? { name: delivery.shippingMethod.name, type: delivery.shippingMethod.type } : null,
      zone: delivery.shippingZone ? { code: delivery.shippingZone.code, name: delivery.shippingZone.name } : null,
      recipientName: delivery.recipientName,
      recipientPhone: delivery.recipientPhone,
      deliveryAddress: delivery.deliveryAddress,
      estimatedDeliveryAt: delivery.estimatedDeliveryAt,
      shippedAt: delivery.shippedAt,
      deliveredAt: delivery.deliveredAt,
      history: delivery.history,
    })),
    statusHistory: order.statusHistory,
    returns: order.returnRequests.map((ret) => ({ id: ret.id, returnNumber: ret.returnNumber, type: ret.type, status: ret.status, reason: ret.reason, requestedAt: ret.requestedAt, items: ret.items, refund: ret.refund })),
    refunds: order.refunds,
    notes: order.notes,
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function adminRoutes(app: FastifyInstance) {
  // ---- Operations dashboard ----
  app.get('/admin/dashboard', { preHandler: requireOperationsAccess }, async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const [
      ordersToday, ordersWeek, paidOrders, unpaidOrders, cancelledOrders,
      unfulfilledPaid, failedDeliveries, pendingReturns, pendingRefunds,
      activeProducts, activeVariants, outOfStock, activeReservations,
      customers, guestOrders, failedPayments,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.order.count({ where: { paymentStatus: 'PAID', status: { not: 'CANCELLED' } } }),
      prisma.order.count({ where: { paymentStatus: { in: ['UNPAID', 'PENDING'] }, status: { not: 'CANCELLED' } } }),
      prisma.order.count({ where: { status: 'CANCELLED' } }),
      prisma.order.count({ where: { paymentStatus: 'PAID', status: { not: 'CANCELLED' }, fulfillmentStatus: { in: ['UNFULFILLED', 'PROCESSING', 'PACKED'] } } }),
      prisma.delivery.count({ where: { status: { in: ['FAILED', 'DELIVERY_ATTEMPTED'] } } }),
      prisma.returnRequest.count({ where: { status: { in: ['REQUESTED', 'UNDER_REVIEW'] } } }),
      prisma.refund.count({ where: { status: { in: ['REQUESTED', 'PENDING', 'PROCESSING'] } } }),
      prisma.product.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.productVariant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.inventory.count({ where: { quantityOnHand: { lte: 0 } } }),
      prisma.inventoryReservation.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'ACTIVE', roles: { some: { role: { slug: 'customer' } } } } }),
      prisma.order.count({ where: { userId: null } }),
      prisma.payment.count({ where: { status: 'FAILED' } }),
    ]);
    const paidValue = await prisma.order.aggregate({ where: { paymentStatus: 'PAID', status: { not: 'CANCELLED' } }, _sum: { grandTotal: true } });
    // Low stock needs available-vs-threshold comparison (not expressible in one
    // indexed where clause); bounded scan keeps it honest without fake metrics.
    const inventorySample = await prisma.inventory.findMany({ select: { quantityOnHand: true, quantityReserved: true, lowStockThreshold: true }, take: 2000 });
    const lowStockCount = inventorySample.filter((row) => {
      const available = row.quantityOnHand - row.quantityReserved;
      return available > 0 && available <= row.lowStockThreshold;
    }).length;
    return {
      success: true,
      data: {
        commerce: { ordersToday, ordersWeek, paidOrders, unpaidOrders, cancelledOrders, paidOrderValue: Number(paidValue._sum.grandTotal ?? 0), currency: 'KES' },
        operations: { unfulfilledPaidOrders: unfulfilledPaid, failedDeliveries, pendingReturns, pendingRefunds, failedPayments },
        inventory: { activeProducts, activeVariants, lowStockVariants: lowStockCount, outOfStockVariants: outOfStock, activeReservations },
        customers: { registeredCustomers: customers, guestOrders },
        needsAttention: {
          pendingPayments: unpaidOrders,
          unfulfilledPaidOrders: unfulfilledPaid,
          failedDeliveries,
          returnsAwaitingReview: pendingReturns,
          refundsAwaitingAction: pendingRefunds,
          lowStockVariants: lowStockCount,
        },
      },
    };
  });

  // ---- Order operations ----
  app.get('/admin/orders', { preHandler: requireOperationsAccess }, async (request) => {
    const query = orderListSchema.parse(request.query);
    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.paymentStatus) where.paymentStatus = query.paymentStatus;
    if (query.fulfillmentStatus) where.fulfillmentStatus = query.fulfillmentStatus;
    if (query.from || query.to) where.createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
    if (query.search) {
      where.OR = [
        { orderNumber: { contains: query.search, mode: 'insensitive' } },
        { customerEmail: { contains: query.search, mode: 'insensitive' } },
        { customerPhone: { contains: query.search } },
        { customerName: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: { id: true, orderNumber: true, status: true, paymentStatus: true, fulfillmentStatus: true, grandTotal: true, currency: true, customerName: true, customerEmail: true, userId: true, createdAt: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.order.count({ where }),
    ]);
    return { success: true, data: { orders: orders.map((o) => ({ ...o, grandTotal: Number(o.grandTotal), itemCount: o._count.items })), pagination: paginate(query.page, query.pageSize, total) } };
  });

  app.get('/admin/orders/:orderNumber', { preHandler: requireOperationsAccess }, async (request) => {
    const { orderNumber } = request.params as { orderNumber: string };
    const order = await prisma.order.findUnique({ where: { orderNumber }, include: orderInclude });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
    return { success: true, data: serializeAdminOrder(order) };
  });

  // ---- Payment visibility (read-only; mutations stay in Phase 7/9 services) ----
  app.get('/admin/payments', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      status: z.enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']).optional(),
    }).parse(request.query);
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [{ providerReference: { contains: query.search } }, { order: { orderNumber: { contains: query.search, mode: 'insensitive' } } }];
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        select: { id: true, provider: true, status: true, amount: true, currency: true, providerReference: true, failureReason: true, paidAt: true, createdAt: true, order: { select: { orderNumber: true, userId: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.payment.count({ where }),
    ]);
    return { success: true, data: { payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })), pagination: paginate(query.page, query.pageSize, total) } };
  });

  // ---- Customer directory (data-minimized; no secrets) ----
  app.get('/admin/customers', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED']).optional(),
    }).parse(request.query);
    const where: Prisma.UserWhereInput = { roles: { some: { role: { slug: 'customer' } } } };
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [{ email: { contains: query.search, mode: 'insensitive' } }, { firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }];
    const [customers, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return { success: true, data: { customers: customers.map((c) => ({ ...c, orderCount: c._count.orders })), pagination: paginate(query.page, query.pageSize, total) } };
  });

  app.get('/admin/customers/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const customer = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, firstName: true, lastName: true, phone: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true,
        addresses: { orderBy: { createdAt: 'desc' } },
        orders: { select: { id: true, orderNumber: true, status: true, paymentStatus: true, fulfillmentStatus: true, grandTotal: true, currency: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 },
        returnRequests: { select: { id: true, returnNumber: true, status: true, type: true, requestedAt: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!customer) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    return { success: true, data: { ...customer, orders: customer.orders.map((o) => ({ ...o, grandTotal: Number(o.grandTotal) })) } };
  });

  app.patch('/admin/customers/:id', { preHandler: requireOperationsAccess }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const payload = z.object({ firstName: z.string().min(1).max(120).optional(), lastName: z.string().min(1).max(120).optional(), phone: z.string().max(32).nullable().optional(), status: z.enum(['ACTIVE', 'SUSPENDED']).optional() }).parse(request.body);
    // Suspend/reinstate is user-lifecycle management: administrators only.
    // Name/phone edits remain available to operations staff.
    if (payload.status !== undefined) {
      await requireAdminAccess(request, reply);
    }
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    const customer = await prisma.user.update({ where: { id }, data: { firstName: payload.firstName?.trim(), lastName: payload.lastName?.trim(), phone: payload.phone, status: payload.status }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true } });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'CUSTOMER_UPDATED', entity: 'User', entityId: id, before: { status: existing.status } as Prisma.InputJsonValue, after: { status: customer.status } as Prisma.InputJsonValue, ...auditMeta(request) } });
    return { success: true, data: customer };
  });

  // ---- Audit log viewer ----
  app.get('/admin/audit-logs', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      action: z.string().max(60).optional(),
      entity: z.string().max(60).optional(),
      actorId: z.string().optional(),
    }).parse(request.query);
    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action as Prisma.EnumAuditActionFilter['equals'];
    if (query.entity) where.entity = query.entity;
    if (query.actorId) where.actorId = query.actorId;
    if (query.search) where.OR = [{ entityId: { contains: query.search } }, { entity: { contains: query.search, mode: 'insensitive' } }];
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.auditLog.count({ where }),
    ]);
    return { success: true, data: { logs, pagination: paginate(query.page, query.pageSize, total) } };
  });

  // ---- Review moderation (existing Review model) ----
  app.get('/admin/reviews', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({ status: z.string().max(20).optional() }).parse(request.query);
    const where: Prisma.ReviewWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [{ title: { contains: query.search, mode: 'insensitive' } }, { body: { contains: query.search, mode: 'insensitive' } }];
    const [reviews, total] = await Promise.all([
      prisma.review.findMany({ where, include: { product: { select: { id: true, name: true, slug: true } }, user: { select: { id: true, email: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.review.count({ where }),
    ]);
    return { success: true, data: { reviews, pagination: paginate(query.page, query.pageSize, total) } };
  });

  app.post('/admin/reviews/:id/moderate', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PENDING']), reason: z.string().max(300).optional() }).parse(request.body);
    const existing = await prisma.review.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'REVIEW_NOT_FOUND', 'Review not found.');
    const review = await prisma.review.update({ where: { id }, data: { status: payload.status } });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'REVIEW_MODERATED', entity: 'Review', entityId: id, before: { status: existing.status } as Prisma.InputJsonValue, after: { status: payload.status, reason: payload.reason ?? null } as Prisma.InputJsonValue, ...auditMeta(request) } });
    return { success: true, data: review };
  });

  // ---- Coupon administration (existing Coupon model; no new promotion engine) ----
  app.get('/admin/coupons', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({ status: z.string().max(20).optional() }).parse(request.query);
    const where: Prisma.CouponWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.code = { contains: query.search, mode: 'insensitive' };
    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({ where, include: { _count: { select: { usages: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.coupon.count({ where }),
    ]);
    return { success: true, data: { coupons: coupons.map((c) => ({ ...c, value: Number(c.value), usageCount: c._count.usages })), pagination: paginate(query.page, query.pageSize, total) } };
  });

  app.post('/admin/coupons', { preHandler: requireOperationsAccess }, async (request) => {
    const payload = z.object({
      code: z.string().min(3).max(40),
      discountType: z.string().min(3).max(20).default('PERCENTAGE'),
      value: z.number().min(0),
      status: z.string().min(3).max(20).default('ACTIVE'),
      validFrom: z.string().datetime().optional(),
      validUntil: z.string().datetime().optional(),
      maxUses: z.number().int().positive().optional(),
    }).parse(request.body);
    try {
      const coupon = await prisma.coupon.create({
        data: { code: payload.code.trim().toUpperCase(), discountType: payload.discountType, value: payload.value, status: payload.status, validFrom: payload.validFrom ? new Date(payload.validFrom) : null, validUntil: payload.validUntil ? new Date(payload.validUntil) : null, maxUses: payload.maxUses ?? null },
      });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'COUPON_CREATED', entity: 'Coupon', entityId: coupon.id, ...auditMeta(request) } });
      return { success: true, data: { ...coupon, value: Number(coupon.value) } };
    } catch (error) {
      conflict(error);
    }
  });

  app.patch('/admin/coupons/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = z.object({ status: z.string().min(3).max(20).optional(), maxUses: z.number().int().positive().nullable().optional(), validUntil: z.string().datetime().nullable().optional() }).parse(request.body);
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'COUPON_NOT_FOUND', 'Coupon not found.');
    const coupon = await prisma.coupon.update({ where: { id }, data: { status: payload.status, maxUses: payload.maxUses === null ? null : payload.maxUses, validUntil: payload.validUntil === null ? null : payload.validUntil ? new Date(payload.validUntil) : undefined } });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'COUPON_UPDATED', entity: 'Coupon', entityId: id, before: { status: existing.status } as Prisma.InputJsonValue, after: { status: coupon.status } as Prisma.InputJsonValue, ...auditMeta(request) } });
    return { success: true, data: { ...coupon, value: Number(coupon.value) } };
  });

  // ---- User directory for role administration (super-admin only) ----
  // Data-minimized like the customer directory: no secrets, roles included
  // so super-admins can find accounts for role assignment. There is no
  // self-registration path to elevated roles; assignment stays on the
  // POST /admin/users/:id/roles endpoint below with its self-lockout guard.
  app.get('/admin/users', { preHandler: requireSuperAdmin }, async (request) => {
    const query = paginationSchema.extend({
      status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED']).optional(),
      role: z.string().trim().max(60).optional(),
    }).parse(request.query);
    const where: Prisma.UserWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.role) where.roles = { some: { role: { slug: query.role.toLowerCase() } } };
    if (query.search) where.OR = [{ email: { contains: query.search, mode: 'insensitive' } }, { firstName: { contains: query.search, mode: 'insensitive' } }, { lastName: { contains: query.search, mode: 'insensitive' } }];
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, firstName: true, lastName: true, status: true, createdAt: true, roles: { select: { role: { select: { slug: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return { success: true, data: { users: users.map((u) => ({ ...u, roles: u.roles.map((entry) => entry.role.slug) })), pagination: paginate(query.page, query.pageSize, total) } };
  });

  app.get('/admin/users/:id', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, roles: { select: { role: { select: { id: true, name: true, slug: true } } } } },
    });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
    return { success: true, data: { ...user, roles: user.roles.map((entry) => entry.role) } };
  });

  // ---- Role & permission administration (super-admin only) ----
  // There is intentionally no public registration path to these endpoints:
  // roles can only be listed/changed by an already-authenticated super-admin.
  // The first super-admin is promoted directly in the database; see docs.
  app.get('/admin/roles', { preHandler: requireSuperAdmin }, async () => {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { slug: 'asc' },
    });
    return {
      success: true,
      data: {
        roles: roles.map((role) => ({
          id: role.id,
          name: role.name,
          slug: role.slug,
          memberCount: role._count.users,
          permissions: role.permissions.map((entry) => entry.permission.slug),
        })),
      },
    };
  });

  app.post('/admin/users/:id/roles', { preHandler: requireSuperAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = z.object({ role: z.string().trim().min(1).max(60), action: z.enum(['assign', 'revoke']) }).parse(request.body);
    const roleSlug = payload.role.toLowerCase();

    const [target, role] = await Promise.all([
      prisma.user.findUnique({ where: { id }, include: { roles: { include: { role: true } } } }),
      prisma.role.findUnique({ where: { slug: roleSlug } }),
    ]);
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found.');
    if (!role) throw new HttpError(404, 'ROLE_NOT_FOUND', 'Role not found.');
    if (target.status === 'DELETED') {
      throw new HttpError(409, 'USER_DELETED', 'Roles cannot be changed on deleted accounts.');
    }

    const actor = actorId(request);
    const alreadyHas = target.roles.some((entry) => entry.role.slug.toLowerCase() === roleSlug);

    // Self-lockout guard: a super-admin cannot strip their own super-admin role.
    if (actor === id && payload.action === 'revoke' && (roleSlug === 'super_admin' || roleSlug === 'super-admin')) {
      throw new HttpError(403, 'SELF_LOCKOUT_DENIED', 'You cannot remove your own super-administrator role.');
    }

    if (payload.action === 'assign') {
      if (alreadyHas) throw new HttpError(409, 'ROLE_ALREADY_ASSIGNED', 'The user already has this role.');
      await prisma.userRole.create({ data: { userId: id, roleId: role.id } });
    } else {
      if (!alreadyHas) throw new HttpError(404, 'ROLE_NOT_ASSIGNED', 'The user does not have this role.');
      await prisma.userRole.deleteMany({ where: { userId: id, roleId: role.id } });
    }

    await prisma.auditLog.create({
      data: {
        actorId: actor,
        action: 'USER_ROLE_CHANGED',
        entity: 'User',
        entityId: id,
        before: { roles: target.roles.map((entry) => entry.role.slug) } as Prisma.InputJsonValue,
        after: { roles: payload.action === 'assign'
          ? [...target.roles.map((entry) => entry.role.slug), role.slug]
          : target.roles.map((entry) => entry.role.slug).filter((slug) => slug.toLowerCase() !== roleSlug),
        } as Prisma.InputJsonValue,
        ...auditMeta(request),
      },
    });

    const updated = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, status: true, roles: { select: { role: { select: { slug: true } } } } },
    });
    return { success: true, data: { ...updated, roles: updated?.roles.map((entry) => entry.role.slug) } };
  });

  // ---- Operational settings (safe subset; secrets stay in environment) ----
  app.get('/admin/settings', { preHandler: requireOperationsAccess }, async () => {
    const [zones, methods, rates] = await Promise.all([
      prisma.shippingZone.findMany({ orderBy: { name: 'asc' } }),
      prisma.shippingMethod.findMany({ orderBy: { name: 'asc' } }),
      prisma.shippingRate.findMany({ include: { zone: { select: { code: true, name: true } }, method: { select: { code: true, name: true } } } }),
    ]);
    return {
      success: true,
      data: {
        currency: 'KES',
        shipping: { zones, methods, rates: rates.map((r) => ({ ...r, basePrice: Number(r.basePrice), minOrderValue: Number(r.minOrderValue) })) },
      },
    };
  });
}
