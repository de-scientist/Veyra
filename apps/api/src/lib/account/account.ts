import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';

import { hashPassword, verifyPassword } from '../auth.js';
import { calculateAvailableQuantity } from '../catalog.js';
import { HttpError } from '../errors.js';
import { prisma } from '../prisma.js';
import { AuditAction } from '@prisma/client';

const accountInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          product: { include: { images: { orderBy: { sortOrder: 'asc' as const } } } },
          inventory: true,
          variantAttributeValues: { include: { attribute: true, attributeValue: true } },
        },
      },
    },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
  deliveries: true,
};

export type AccountProfileDTO = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountOrderItemDTO = {
  id: string;
  productName: string;
  sku: string;
  variantDescription: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  subtotal: number;
  total: number;
  productImage: string | null;
};

export type AccountOrderDTO = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotal: number;
  shippingTotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  itemCount: number;
  items: AccountOrderItemDTO[];
  delivery: {
    id: string;
    status: string;
    trackingNumber: string | null;
    estimatedDeliveryAt: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    method: { name: string; type: string } | null;
    history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }>;
  } | null;
  payment: {
    id: string;
    status: string;
    amount: number;
    provider: string;
    providerReference: string | null;
    paidAt: Date | null;
  } | null;
};

export type AccountAddressDTO = {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountPaymentDTO = {
  id: string;
  orderNumber: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export type AccountReturnDTO = {
  id: string;
  returnNumber: string;
  orderNumber: string;
  type: string;
  status: string;
  reason: string;
  customerNote: string | null;
  requestedAt: Date;
  items: Array<{
    id: string;
    orderItemId: string;
    productName: string;
    sku: string;
    variantDescription: string | null;
    quantity: number;
    reason: string;
    condition: string;
    disposition: string | null;
    refundAmount: number;
  }>;
  refund: { refundNumber: string; amount: number; currency: string; status: string; providerReference: string | null } | null;
  exchange: { status: string; replacementVariantId: string; quantity: number } | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }>;
};

export type AccountRefundDTO = {
  id: string;
  refundNumber: string;
  orderNumber: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  providerReference: string | null;
  reason: string;
  requestedAt: Date;
  processedAt: Date | null;
};

export type OrderSummaryDTO = {
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  grandTotal: number;
  currency: string;
  itemCount: number;
};

export type DashboardDTO = {
  profile: AccountProfileDTO;
  orderSummary: { totalOrders: number; activeOrders: number; deliveredOrders: number; processingOrders: number };
  currentOrder: AccountOrderDTO | null;
  recentOrders: OrderSummaryDTO[];
  wishlist: { count: number; items: Array<{ productId: string; product: { name: string; slug: string; image: string | null; price: number; availability: string } }> } | null;
  activeReturns: { count: number; latest: AccountReturnDTO | null };
  recentRefunds: { count: number; latest: AccountRefundDTO | null };
};

export async function getAccountDashboard(userId: string): Promise<DashboardDTO> {
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true },
  });

  const [totalOrders, orderCounts, activeOrders, recentOrders, currentOrderResult, wishlist, activeReturns, recentRefundsResult] = await Promise.all([
    prisma.order.count({ where: { userId } }),
    prisma.order.groupBy({ by: ['status'], where: { userId }, _count: { id: true } }),
    prisma.order.count({ where: { userId, status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] as string[] } } }),
    prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' as const }, take: 5, select: { id: true, orderNumber: true, createdAt: true, status: true, paymentStatus: true, fulfillmentStatus: true, grandTotal: true, currency: true } }),
    prisma.order.findFirst({ where: { userId, status: { in: ['PENDING', 'CONFIRMED', 'PROCESSING'] as string[] } }, orderBy: { createdAt: 'desc' as const }, include: accountInclude }),
    prisma.wishlist.findUnique({ where: { userId }, include: { items: { take: 3, include: { product: { include: { images: { orderBy: { sortOrder: 'asc' as const } }, variants: { include: { inventory: true } } } } } } } }),
    prisma.returnRequest.aggregate({ where: { userId, status: { in: ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'RETURN_INITIATED', 'RECEIVED', 'INSPECTING', 'APPROVED_FOR_RESOLUTION'] as ReturnStatus[] } }, _count: { id: true } }),
    prisma.refund.findMany({ where: { order: { userId } }, orderBy: { createdAt: 'desc' as const }, take: 1, include: { order: { select: { orderNumber: true } } } }),
  ]);

  const recentOrdersSummaries: OrderSummaryDTO[] = recentOrders.map((o) => ({
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    grandTotal: Number(o.grandTotal),
    currency: o.currency,
    itemCount: o.items?.length ?? 0,
  }));

  const currentOrder = currentOrderResult ? serializeOrderDetail(currentOrderResult) : null;

  const wishlistSummary = wishlist ? {
    count: wishlist.items.length,
    items: wishlist.items.map((item) => {
      const variants = item.product.variants;
      const available = variants.filter((v) => {
        const inv = v.inventory;
        return item.product.status === 'ACTIVE' && v.status === 'ACTIVE' && !v.deletedAt && calculateAvailableQuantity(inv?.quantityOnHand ?? 0, inv?.quantityReserved ?? 0) > 0;
      });
      const priceVariant = variants.find((v) => v.isDefault) ?? variants[0];
      return { productId: item.productId, product: { name: item.product.name, slug: item.product.slug, image: item.product.images.find((i) => i.isPrimary)?.url ?? null, price: Number(priceVariant?.priceOverride ?? item.product.basePrice ?? 0), availability: item.product.status !== 'ACTIVE' ? 'UNAVAILABLE' : available.length ? 'AVAILABLE' : 'OUT_OF_STOCK' } };
    }),
  } : null;

  const totalOrdersMap = Object.fromEntries(orderCounts.map((c) => [c.status, c._count]));

  return {
    profile: serializeProfile(profile),
    orderSummary: { totalOrders, activeOrders, deliveredOrders: totalOrdersMap['COMPLETED'] ?? 0, processingOrders: totalOrdersMap['PROCESSING'] ?? 0 },
    currentOrder,
    recentOrders: recentOrdersSummaries,
    wishlist: wishlistSummary,
    activeReturns: { count: activeReturns._count, latest: null },
    recentRefunds: { count: recentRefundsResult.length, latest: recentRefundsResult[0] ? serializeRefund(recentRefundsResult[0]) : null },
  };
}

export async function getProfile(userId: string): Promise<AccountProfileDTO> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true } });
  return serializeProfile(user);
}

export async function updateProfile(userId: string, input: { firstName?: string; lastName?: string; phone?: string | null }) {
  const data: Record<string, unknown> = {};
  if (input.firstName !== undefined) {
    const trimmed = input.firstName.trim();
    if (trimmed.length < 1 || trimmed.length > 120) throw new HttpError(400, 'INVALID_PROFILE', 'First name must be between 1 and 120 characters.');
    data.firstName = trimmed;
  }
  if (input.lastName !== undefined) {
    const trimmed = input.lastName.trim();
    if (trimmed.length < 1 || trimmed.length > 120) throw new HttpError(400, 'INVALID_PROFILE', 'Last name must be between 1 and 120 characters.');
    data.lastName = trimmed;
  }
  if (input.phone !== undefined) {
    data.phone = input.phone && input.phone.length > 0 ? input.phone : null;
  }
  await prisma.user.update({ where: { id: userId }, data });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.PROFILE_UPDATED, entity: 'User', entityId: userId, before: null, after: data } });
  return getProfile(userId);
}

export async function getAddresses(userId: string): Promise<AccountAddressDTO[]> {
  const addresses = await prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' as const } });
  return addresses.map(serializeAddress);
}

export async function createAddress(userId: string, input: { label?: string; line1: string; line2?: string; city: string; state?: string; postalCode?: string; country?: string }) {
  if (!input.line1.trim() || !input.city.trim()) throw new HttpError(400, 'INVALID_ADDRESS', 'Address line 1 and city are required.');
  if (input.line1.length > 180 || input.city.length > 180) throw new HttpError(400, 'INVALID_ADDRESS', 'Address details are too long.');
  const label = input.label?.trim().slice(0, 60) ?? null;
  const address = await prisma.address.create({
    data: { userId, label, line1: input.line1.trim(), line2: input.line2?.trim().slice(0, 180) ?? null, city: input.city.trim(), state: input.state?.trim().slice(0, 60) ?? null, postalCode: input.postalCode?.trim().slice(0, 20) ?? null, country: input.country?.trim() ?? 'KE' },
  });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.ADDRESS_CREATED, entity: 'Address', entityId: address.id } });
  return serializeAddress(address);
}

export async function updateAddress(userId: string, addressId: string, input: { label?: string; line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string }) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  const data: Record<string, unknown> = {};
  if (input.label !== undefined) { const trimmed = input.label.trim().slice(0, 60); if (!trimmed) throw new HttpError(400, 'INVALID_ADDRESS', 'Label cannot be empty.'); data.label = trimmed; }
  if (input.line1 !== undefined) { const trimmed = input.line1.trim(); if (!trimmed) throw new HttpError(400, 'INVALID_ADDRESS', 'Address line 1 is required.'); if (trimmed.length > 180) throw new HttpError(400, 'INVALID_ADDRESS', 'Address line 1 too long.'); data.line1 = trimmed; }
  if (input.city !== undefined) { const trimmed = input.city.trim(); if (!trimmed) throw new HttpError(400, 'INVALID_ADDRESS', 'City is required.'); if (trimmed.length > 180) throw new HttpError(400, 'INVALID_ADDRESS', 'City too long.'); data.city = trimmed; }
  if (input.line2 !== undefined) data.line2 = input.line2?.trim().slice(0, 180) ?? null;
  if (input.state !== undefined) data.state = input.state?.trim().slice(0, 60) ?? null;
  if (input.postalCode !== undefined) data.postalCode = input.postalCode?.trim().slice(0, 20) ?? null;
  if (input.country !== undefined) data.country = input.country?.trim() ?? 'KE';
  await prisma.address.update({ where: { id: addressId }, data });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.ADDRESS_UPDATED, entity: 'Address', entityId: addressId } });
  return serializeAddress(await prisma.address.findUniqueOrThrow({ where: { id: addressId } }));
}

export async function deleteAddress(userId: string, addressId: string) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  await prisma.address.delete({ where: { id: addressId } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.ADDRESS_DELETED, entity: 'Address', entityId: addressId } });
  return { deleted: true };
}

export async function setDefaultAddress(userId: string, addressId: string, type: 'shipping' | 'billing') {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  await prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
  await prisma.address.update({ where: { id: addressId }, data: { isDefault: true } });
  return serializeAddress(await prisma.address.findUniqueOrThrow({ where: { id: addressId } }));
}

export async function getOrders(userId: string, params: { page?: number; pageSize?: number; status?: string; search?: string } = {}) {
  const { page = 1, pageSize = 10, status, search } = params;
  const skip = (page - 1) * pageSize;
  const where: Record<string, unknown> = { userId };
  if (status) where.status = status;
  if (search) where.orderNumber = { contains: search };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: 'desc' as const }, skip, take: pageSize, include: { items: { select: { id: true, productName: true, quantity: true, unitPrice: true, total: true } }, payments: { select: { id: true, status: true, amount: true, provider: true, providerReference: true, paidAt: true } }, deliveries: { select: { id: true, status: true, trackingNumber: true, estimatedDeliveryAt: true, shippedAt: true, deliveredAt: true, shippingMethod: { select: { name: true, type: true } } } } } }),
    prisma.order.count({ where }),
  ]);
  return { orders: orders.map(serializeOrderForList), pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function getOrderDetail(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({ where: { orderNumber, userId }, include: accountInclude });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return serializeOrderDetail(order);
}

export async function getOrderTracking(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({ where: { orderNumber, userId }, include: { items: true, deliveries: { include: { history: { orderBy: { createdAt: 'asc' as const } }, shippingMethod: true, shippingZone: true } } } });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const delivery = order.deliveries[0];
  return {
    orderNumber,
    status: delivery?.status ?? 'UNFULFILLED',
    fulfillmentStatus: order.fulfillmentStatus,
    trackingNumber: delivery?.trackingNumber ?? null,
    internalReference: delivery?.internalReference ?? null,
    courierProvider: delivery?.courierProvider ?? null,
    method: delivery?.shippingMethod ? { name: delivery.shippingMethod.name, type: delivery.shippingMethod.type } : null,
    zone: delivery?.shippingZone ? { code: delivery.shippingZone.code, name: delivery.shippingZone.name } : null,
    estimatedDeliveryAt: delivery?.estimatedDeliveryAt ?? null,
    shippedAt: delivery?.shippedAt ?? null,
    pickedUpAt: delivery?.pickedUpAt ?? null,
    deliveredAt: delivery?.deliveredAt ?? null,
    history: delivery?.history.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })) ?? [],
  };
}

export async function reorder(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({ where: { orderNumber, userId }, include: { items: { include: { variant: { include: { product: true, inventory: true } } } } } });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const results: Array<{ orderItemId: string; productName: string; sku: string; added: boolean; reason?: string; currentPrice?: number; currentStock?: number }> = [];
  for (const item of order.items) {
    const variant = item.variant;
    if (!variant || !variant.product) {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'Product variant information is unavailable.' });
      continue;
    }
    if (variant.product.deletedAt || variant.product.status !== 'ACTIVE') {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'This product is no longer available.' });
      continue;
    }
    if (!variant.inventory || variant.status !== 'ACTIVE' || variant.deletedAt) {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'This variant is currently unavailable.' });
      continue;
    }
    const available = calculateAvailableQuantity(variant.inventory.quantityOnHand, variant.inventory.quantityReserved);
    if (available < item.quantity) {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: `Only ${available} unit(s) currently available.` });
      continue;
    }
    const currentPrice = Number(variant.priceOverride ?? variant.product.basePrice ?? 0);
    try {
      const { addCartItem } = await import('../shopping.js');
      await addCartItem(order.items.length > 0 ? (await prisma.cart.findFirst({ where: { userId } }))?.id ?? '' : '', item.variantId, item.quantity);
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: true, currentPrice, currentStock: available });
    } catch {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'Could not add item to cart.' });
    }
  }
  return { orderNumber, results };
}

export async function getPayments(userId: string) {
  const payments = await prisma.payment.findMany({
    where: { order: { userId } },
    orderBy: { createdAt: 'desc' as const },
    include: { order: { select: { orderNumber: true } } },
  });
  return payments.map(serializePaymentDTO);
}

export async function getReturns(userId: string) {
  const returns = await prisma.returnRequest.findMany({ where: { userId }, orderBy: { createdAt: 'desc' as const }, include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: true } }, refund: true, exchange: true } });
  return returns.map(serializeReturnDTO);
}

export async function getRefunds(userId: string) {
  const refunds = await prisma.refund.findMany({
    where: { order: { userId } },
    orderBy: { createdAt: 'desc' as const },
    include: { order: { select: { orderNumber: true } } },
  });
  return refunds.map(serializeRefundDTO);
}

export async function changePassword(userId: string, input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
  if (input.newPassword.length < 8) throw new HttpError(400, 'WEAK_PASSWORD', 'New password must be at least 8 characters.');
  if (input.newPassword !== input.confirmPassword) throw new HttpError(400, 'PASSWORD_MISMATCH', 'New passwords do not match.');
  const newHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });
  await prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.PASSWORD_CHANGED, entity: 'User', entityId: userId } });
  return { changed: true };
}

export async function getSessions(userId: string) {
  const sessions = await prisma.session.findMany({ where: { userId }, orderBy: { createdAt: 'desc' as const }, select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true } });
  return sessions.map((s) => ({ id: s.id, device: s.userAgent ?? 'Unknown device', ipAddress: s.ipAddress, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt ?? s.createdAt, expiresAt: s.expiresAt, revokedAt: s.revokedAt, isCurrent: false }));
}

export async function revokeSession(userId: string, sessionId: string) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.SESSION_REVOKED, entity: 'Session', entityId: sessionId } });
  return { revoked: true };
}

export async function revokeOtherSessions(userId: string) {
  await prisma.session.updateMany({ where: { userId, id: { not: getCurrentSessionId() } }, revokedAt: new Date() });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.SESSIONS_REVOKED, entity: 'Session', entityId: 'all' } });
  return { revoked: 'others' };
}

export async function getPreferences(userId: string) {
  const pref = await prisma.userPreference.upsert({
    where: { userId },
    update: {},
    create: { userId },
    select: { id: true, userId: true, emailOrderUpdates: true, emailDelivery: true, emailReturns: true, emailMarketing: true, updatedAt: true },
  });
  return pref;
}

export async function updatePreferences(userId: string, input: { emailOrderUpdates?: boolean; emailDelivery?: boolean; emailReturns?: boolean; emailMarketing?: boolean }) {
  const data: Record<string, boolean> = {};
  if (input.emailOrderUpdates !== undefined) data.emailOrderUpdates = input.emailOrderUpdates;
  if (input.emailDelivery !== undefined) data.emailDelivery = input.emailDelivery;
  if (input.emailReturns !== undefined) data.emailReturns = input.emailReturns;
  if (input.emailMarketing !== undefined) data.emailMarketing = input.emailMarketing;
  await prisma.userPreference.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.PREFERENCES_UPDATED, entity: 'UserPreference', entityId: userId } });
  return getPreferences(userId);
}

export async function claimGuestOrder(userId: string, orderNumber: string, token: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (order.userId !== null) throw new HttpError(400, 'ORDER_NOT_GUEST', 'This order is already associated with an account.');
  const valid = order.confirmationTokenHash === crypto.createHash('sha256').update(`${process.env.AUTH_SECRET}:${token}`).digest('hex');
  if (!valid) throw new HttpError(403, 'INVALID_TOKEN', 'Invalid confirmation token.');
  await prisma.order.update({ where: { id: order.id }, data: { userId, confirmationTokenHash: null } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.GUEST_ORDER_CLAIMED, entity: 'Order', entityId: order.id } });
  return { orderNumber, claimed: true };
}

export function buildOrderTimeline(order: any) {
  const events: Array<{ label: string; date: Date; note?: string; status?: string }> = [];
  for (const h of (order.statusHistory ?? [])) {
    events.push({ label: `Order ${h.status.toLowerCase().replace('_', ' ')}`, date: h.createdAt, note: h.note ?? undefined, status: h.status });
  }
  for (const p of (order.payments ?? [])) {
    events.push({ label: `Payment ${p.status.toLowerCase()}`, date: p.createdAt, note: p.provider ?? undefined, status: p.status });
  }
  for (const d of (order.deliveries ?? [])) {
    for (const h of (d.history ?? [])) {
      events.push({ label: `Delivery ${h.toStatus.toLowerCase().replace('_', ' ')}`, date: h.createdAt, note: h.note ?? undefined });
    }
  }
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}

function serializeProfile(user: { id: string; email: string; firstName: string; lastName: string; phone: string | null; avatarUrl: string | null; status: string; emailVerifiedAt: Date | null; lastLoginAt: Date | null; createdAt: Date; updatedAt: Date }): AccountProfileDTO {
  return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, phone: user.phone, avatarUrl: user.avatarUrl, status: user.status, emailVerifiedAt: user.emailVerifiedAt, lastLoginAt: user.lastLoginAt, createdAt: user.createdAt, updatedAt: user.updatedAt };
}

function serializeAddress(address: { id: string; label: string | null; line1: string; line2: string | null; city: string; state: string | null; postalCode: string | null; country: string; isDefault: boolean; createdAt: Date; updatedAt: Date }): AccountAddressDTO {
  return { id: address.id, label: address.label, line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country, isDefault: address.isDefault, createdAt: address.createdAt, updatedAt: address.updatedAt };
}

function serializeOrderForList(order: any): OrderSummaryDTO {
  return { orderNumber: order.orderNumber, createdAt: order.createdAt, status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, grandTotal: Number(order.grandTotal), currency: order.currency, itemCount: order.items?.length ?? 0 };
}

function serializeOrderDetail(order: any): AccountOrderDTO {
  return {
    id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, status: order.status, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus,
    subtotal: Number(order.subtotal), shippingTotal: Number(order.shippingTotal), discountTotal: Number(order.discountTotal), taxTotal: Number(order.taxTotal), grandTotal: Number(order.grandTotal), currency: order.currency,
    itemCount: order.items?.length ?? 0,
    items: (order.items ?? []).map((item: any) => ({
      id: item.id, productName: item.productName, sku: item.sku, variantDescription: item.variantDescription, quantity: item.quantity, unitPrice: Number(item.unitPrice), discountAmount: Number(item.discountAmount), subtotal: Number(item.subtotal), total: Number(item.total),
      productImage: item.variant?.product?.images?.[0]?.url ?? null,
    })),
    delivery: order.deliveries?.[0] ? {
      id: order.deliveries[0].id, status: order.deliveries[0].status, trackingNumber: order.deliveries[0].trackingNumber, estimatedDeliveryAt: order.deliveries[0].estimatedDeliveryAt, shippedAt: order.deliveries[0].shippedAt, deliveredAt: order.deliveries[0].deliveredAt,
      method: order.deliveries[0].shippingMethod ? { name: order.deliveries[0].shippingMethod.name, type: order.deliveries[0].shippingMethod.type } : null,
      history: order.deliveries[0].history?.map((h: any) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })) ?? [],
    } : null,
    payment: order.payments?.[0] ? { id: order.payments[0].id, status: order.payments[0].status, amount: Number(order.payments[0].amount), provider: order.payments[0].provider, providerReference: order.payments[0].providerReference, paidAt: order.payments[0].paidAt } : null,
  };
}

function serializePaymentDTO(payment: any): AccountPaymentDTO {
  return { id: payment.id, orderNumber: payment.order.orderNumber, provider: payment.provider, status: payment.status, amount: Number(payment.amount), currency: payment.currency, providerReference: payment.providerReference, paidAt: payment.paidAt, createdAt: payment.createdAt };
}

function serializeReturnDTO(returnReq: any): AccountReturnDTO {
  return {
    id: returnReq.id, returnNumber: returnReq.returnNumber, orderNumber: returnReq.order.orderNumber, type: returnReq.type, status: returnReq.status, reason: returnReq.reason, customerNote: returnReq.customerNote, requestedAt: returnReq.requestedAt,
    items: returnReq.items.map((item: any) => ({ id: item.id, orderItemId: item.orderItemId, productName: item.orderItem.productName, sku: item.orderItem.sku, variantDescription: item.orderItem.variantDescription, quantity: item.quantity, reason: item.reason, condition: item.condition, disposition: item.disposition, refundAmount: Number(item.refundAmount) })),
    refund: returnReq.refund ? { refundNumber: returnReq.refund.refundNumber, amount: Number(returnReq.refund.amount), currency: returnReq.refund.currency, status: returnReq.refund.status, providerReference: returnReq.refund.providerReference } : null,
    exchange: returnReq.exchange ? { status: returnReq.exchange.status, replacementVariantId: returnReq.exchange.replacementVariantId, quantity: returnReq.exchange.quantity } : null,
    history: returnReq.history.map((h: any) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })),
  };
}

function serializeRefundDTO(refund: any): AccountRefundDTO {
  return { id: refund.id, refundNumber: refund.refundNumber, orderNumber: refund.order.orderNumber, amount: Number(refund.amount), currency: refund.currency, status: refund.status, provider: refund.provider, providerReference: refund.providerReference, reason: refund.reason, requestedAt: refund.requestedAt, processedAt: refund.processedAt };
}

function getCurrentSessionId(): string {
  return '';
}
