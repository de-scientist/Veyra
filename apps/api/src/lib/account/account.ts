import { OrderStatus, Prisma, ReturnStatus, AuditAction } from '@prisma/client';

import { hashPassword, hashToken, verifyPassword } from '../auth.js';
import { calculateAvailableQuantity } from '../catalog.js';
import { HttpError } from '../errors.js';
import { prisma } from '../prisma.js';
import { addCartItem } from '../shopping.js';

const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];
const ACTIVE_RETURN_STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'RETURN_INITIATED',
  'RECEIVED',
  'INSPECTING',
  'APPROVED_FOR_RESOLUTION',
];

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
  deliveries: {
    include: {
      shippingMethod: true,
      history: { orderBy: { createdAt: 'asc' as const } },
    },
  },
} satisfies Prisma.OrderInclude;

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

export function validateProfileInput(input: { firstName?: string; lastName?: string; phone?: string | null }): Record<string, string | null> {
  const data: Record<string, string | null> = {};
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
    if (input.phone === null || input.phone.trim().length === 0) {
      data.phone = null;
    } else {
      const trimmed = input.phone.trim().slice(0, 32);
      if (!/^[+\d][\d\s\-()]{5,30}$/.test(trimmed)) throw new HttpError(400, 'INVALID_PHONE', 'Phone number format is invalid.');
      data.phone = trimmed;
    }
  }
  return data;
}

export async function getAccountDashboard(userId: string): Promise<DashboardDTO> {
  const profile = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true },
  });

  const [totalOrders, orderCounts, activeOrders, recentOrders, currentOrderResult, wishlist, activeReturnCount, latestActiveReturn, recentRefundsResult] =
    await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.order.groupBy({ by: ['status'], where: { userId }, _count: { id: true } }),
      prisma.order.count({ where: { userId, status: { in: ACTIVE_ORDER_STATUSES } } }),
      prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { items: { select: { id: true } } },
      }),
      prisma.order.findFirst({ where: { userId, status: { in: ACTIVE_ORDER_STATUSES } }, orderBy: { createdAt: 'desc' }, include: accountInclude }),
      prisma.wishlist.findUnique({
        where: { userId },
        include: { items: { take: 4, include: { product: { include: { images: { orderBy: { sortOrder: 'asc' } }, variants: { include: { inventory: true } } } } } } },
      }),
      prisma.returnRequest.count({ where: { userId, status: { in: ACTIVE_RETURN_STATUSES } } }),
      prisma.returnRequest.findFirst({
        where: { userId, status: { in: ACTIVE_RETURN_STATUSES } },
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: true } }, refund: true, exchange: true, history: { orderBy: { createdAt: 'asc' } } },
      }),
      prisma.refund.findMany({ where: { order: { userId } }, orderBy: { createdAt: 'desc' }, take: 1, include: { order: { select: { orderNumber: true } } } }),
    ]);

  const recentOrdersSummaries: OrderSummaryDTO[] = recentOrders.map((o) => ({
    orderNumber: o.orderNumber,
    createdAt: o.createdAt,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentStatus: o.fulfillmentStatus,
    grandTotal: Number(o.grandTotal),
    currency: o.currency,
    itemCount: o.items.length,
  }));

  const currentOrder = currentOrderResult ? serializeOrderDetail(currentOrderResult) : null;

  const wishlistSummary = wishlist
    ? {
        count: wishlist.items.length,
        items: wishlist.items.map((item) => {
          const variants = item.product.variants;
          const available = variants.filter((v) => {
            const inv = v.inventory;
            return item.product.status === 'ACTIVE' && v.status === 'ACTIVE' && !v.deletedAt && calculateAvailableQuantity(inv?.quantityOnHand ?? 0, inv?.quantityReserved ?? 0) > 0;
          });
          const priceVariant = variants.find((v) => v.isDefault) ?? variants[0];
          return {
            productId: item.productId,
            product: {
              name: item.product.name,
              slug: item.product.slug,
              image: item.product.images.find((i) => i.isPrimary)?.url ?? item.product.images[0]?.url ?? null,
              price: Number(priceVariant?.priceOverride ?? item.product.basePrice ?? 0),
              availability: item.product.status !== 'ACTIVE' ? 'UNAVAILABLE' : available.length ? 'AVAILABLE' : 'OUT_OF_STOCK',
            },
          };
        }),
      }
    : { count: 0, items: [] };

  const countsByStatus: Record<string, number> = {};
  for (const c of orderCounts) countsByStatus[c.status] = c._count.id;

  return {
    profile: serializeProfile(profile),
    orderSummary: {
      totalOrders,
      activeOrders,
      deliveredOrders: countsByStatus['COMPLETED'] ?? 0,
      processingOrders: countsByStatus['PROCESSING'] ?? 0,
    },
    currentOrder,
    recentOrders: recentOrdersSummaries,
    wishlist: wishlistSummary,
    activeReturns: { count: activeReturnCount, latest: latestActiveReturn ? serializeReturnDTO(latestActiveReturn) : null },
    recentRefunds: { count: recentRefundsResult.length, latest: recentRefundsResult[0] ? serializeRefundDTO(recentRefundsResult[0]) : null },
  };
}

export async function getProfile(userId: string): Promise<AccountProfileDTO> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, avatarUrl: true, status: true, emailVerifiedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true },
  });
  return serializeProfile(user);
}

export async function updateProfile(userId: string, input: { firstName?: string; lastName?: string; phone?: string | null }) {
  const data = validateProfileInput(input);
  if (Object.keys(data).length === 0) return getProfile(userId);
  await prisma.user.update({ where: { id: userId }, data });
  await prisma.auditLog.create({
    data: { actorId: userId, action: AuditAction.PROFILE_UPDATED, entity: 'User', entityId: userId, after: data as Prisma.InputJsonValue },
  });
  return getProfile(userId);
}

export async function getAddresses(userId: string): Promise<AccountAddressDTO[]> {
  const addresses = await prisma.address.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  return addresses.map(serializeAddress);
}

export async function createAddress(userId: string, input: { label?: string; line1: string; line2?: string; city: string; state?: string; postalCode?: string; country?: string }) {
  if (!input.line1.trim() || !input.city.trim()) throw new HttpError(400, 'INVALID_ADDRESS', 'Address line 1 and city are required.');
  if (input.line1.length > 180 || input.city.length > 180) throw new HttpError(400, 'INVALID_ADDRESS', 'Address details are too long.');
  const address = await prisma.address.create({
    data: {
      userId,
      label: input.label?.trim().slice(0, 60) || null,
      line1: input.line1.trim(),
      line2: input.line2?.trim().slice(0, 180) || null,
      city: input.city.trim(),
      state: input.state?.trim().slice(0, 60) || null,
      postalCode: input.postalCode?.trim().slice(0, 20) || null,
      country: input.country?.trim() || 'KE',
    },
  });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.ADDRESS_CREATED, entity: 'Address', entityId: address.id } });
  return serializeAddress(address);
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: { label?: string; line1?: string; line2?: string; city?: string; state?: string; postalCode?: string; country?: string },
) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  const data: Prisma.AddressUpdateInput = {};
  if (input.label !== undefined) {
    const trimmed = input.label.trim().slice(0, 60);
    data.label = trimmed || null;
  }
  if (input.line1 !== undefined) {
    const trimmed = input.line1.trim();
    if (!trimmed) throw new HttpError(400, 'INVALID_ADDRESS', 'Address line 1 is required.');
    if (trimmed.length > 180) throw new HttpError(400, 'INVALID_ADDRESS', 'Address line 1 too long.');
    data.line1 = trimmed;
  }
  if (input.city !== undefined) {
    const trimmed = input.city.trim();
    if (!trimmed) throw new HttpError(400, 'INVALID_ADDRESS', 'City is required.');
    if (trimmed.length > 180) throw new HttpError(400, 'INVALID_ADDRESS', 'City too long.');
    data.city = trimmed;
  }
  if (input.line2 !== undefined) data.line2 = input.line2?.trim().slice(0, 180) || null;
  if (input.state !== undefined) data.state = input.state?.trim().slice(0, 60) || null;
  if (input.postalCode !== undefined) data.postalCode = input.postalCode?.trim().slice(0, 20) || null;
  if (input.country !== undefined) data.country = input.country?.trim() || 'KE';
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

export async function setDefaultAddress(userId: string, addressId: string) {
  const address = await prisma.address.findFirst({ where: { id: addressId, userId } });
  if (!address) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found.');
  await prisma.$transaction([
    prisma.address.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } }),
    prisma.address.update({ where: { id: addressId }, data: { isDefault: true } }),
  ]);
  return serializeAddress(await prisma.address.findUniqueOrThrow({ where: { id: addressId } }));
}

const ORDER_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'];

export async function getOrders(userId: string, params: { page?: number; pageSize?: number; status?: string; search?: string } = {}) {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(params.pageSize ?? 10)));
  const skip = (page - 1) * pageSize;
  const where: Prisma.OrderWhereInput = { userId };
  if (params.status) {
    if (!(ORDER_STATUSES as string[]).includes(params.status)) throw new HttpError(400, 'INVALID_STATUS', 'Unknown order status filter.');
    where.status = params.status as OrderStatus;
  }
  if (params.search) where.orderNumber = { contains: params.search.slice(0, 40), mode: 'insensitive' };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      include: {
        items: { select: { id: true } },
        payments: { select: { id: true, status: true } },
        deliveries: {
          select: {
            id: true,
            status: true,
            trackingNumber: true,
            estimatedDeliveryAt: true,
            shippedAt: true,
            deliveredAt: true,
            shippingMethod: { select: { name: true, type: true } },
          },
        },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    orders: orders.map((o) => ({
      orderNumber: o.orderNumber,
      createdAt: o.createdAt,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      grandTotal: Number(o.grandTotal),
      currency: o.currency,
      itemCount: o.items.length,
    })) as OrderSummaryDTO[],
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export async function getOrderDetail(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({ where: { orderNumber, userId }, include: accountInclude });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return serializeOrderDetail(order);
}

export async function getReturnDetail(userId: string, returnIdOrNumber: string) {
  const ret = await prisma.returnRequest.findFirst({
    where: { userId, OR: [{ id: returnIdOrNumber }, { returnNumber: returnIdOrNumber }] },
    include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: true } }, refund: true, exchange: true, history: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ret) throw new HttpError(404, 'RETURN_NOT_FOUND', 'Return request not found.');
  return serializeReturnDTO(ret);
}

export async function getOrderTracking(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId },
    include: {
      deliveries: {
        include: {
          history: { orderBy: { createdAt: 'asc' } },
          shippingMethod: true,
          shippingZone: true,
        },
      },
      statusHistory: { orderBy: { createdAt: 'asc' } },
      payments: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const delivery = order.deliveries[0] ?? null;
  return {
    orderNumber,
    orderStatus: order.status,
    status: delivery?.status ?? order.fulfillmentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    trackingNumber: delivery?.trackingNumber ?? null,
    internalReference: delivery?.internalReference ?? null,
    courierProvider: delivery?.courierProvider ?? null,
    method: delivery?.shippingMethod ? { name: delivery.shippingMethod.name, type: delivery.shippingMethod.type } : null,
    zone: delivery?.shippingZone ? { code: delivery.shippingZone.code, name: delivery.shippingZone.name } : null,
    estimatedDeliveryAt: delivery?.estimatedDeliveryAt ?? null,
    shippedAt: delivery?.shippedAt ?? null,
    pickedUpAt: delivery?.pickedUpAt ?? null,
    deliveredAt: delivery?.deliveredAt ?? null,
    timeline: buildOrderTimeline(order),
    history: delivery?.history.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })) ?? [],
  };
}

export async function reorder(userId: string, orderNumber: string) {
  const order = await prisma.order.findFirst({
    where: { orderNumber, userId },
    include: { items: { include: { variant: { include: { product: true, inventory: true } } } } },
  });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  let cart = await prisma.cart.findFirst({ where: { userId } });
  if (!cart) cart = await prisma.cart.create({ data: { userId } });
  const results: Array<{ orderItemId: string; productName: string; sku: string; added: boolean; reason?: string; currentPrice?: number; currentStock?: number }> = [];
  for (const item of order.items) {
    const variant = item.variant;
    if (!variant || !item.variantId) {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'This item is no longer available.' });
      continue;
    }
    if (variant.product.deletedAt || variant.product.status !== 'ACTIVE') {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'This item is no longer available.' });
      continue;
    }
    if (!variant.inventory || variant.status !== 'ACTIVE' || variant.deletedAt) {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: 'This variant is currently unavailable.' });
      continue;
    }
    const available = calculateAvailableQuantity(variant.inventory.quantityOnHand, variant.inventory.quantityReserved);
    if (available < 1 || available < item.quantity) {
      results.push({ orderItemId: item.id, productName: item.productName, sku: item.sku ?? '', added: false, reason: available < 1 ? 'This item is out of stock.' : `Only ${available} unit(s) currently available.` });
      continue;
    }
    const currentPrice = Number(variant.priceOverride ?? variant.product.basePrice ?? 0);
    try {
      await addCartItem(cart.id, item.variantId, item.quantity);
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
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { orderNumber: true } } },
  });
  return payments.map(serializePaymentDTO);
}

export async function getReturns(userId: string) {
  const returns = await prisma.returnRequest.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      order: { select: { orderNumber: true } },
      items: { include: { orderItem: true } },
      refund: true,
      exchange: true,
      history: { orderBy: { createdAt: 'asc' } },
    },
  });
  return returns.map(serializeReturnDTO);
}

export async function getRefunds(userId: string) {
  const refunds = await prisma.refund.findMany({
    where: { order: { userId } },
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { orderNumber: true } } },
  });
  return refunds.map(serializeRefundDTO);
}

export async function getWishlistSummary(userId: string) {
  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    include: { items: { include: { product: { include: { images: { orderBy: { sortOrder: 'asc' } } } } } } },
  });
  if (!wishlist) return { count: 0, items: [] };
  return {
    count: wishlist.items.length,
    items: wishlist.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      product: { name: i.product.name, slug: i.product.slug, image: i.product.images.find((img) => img.isPrimary)?.url ?? i.product.images[0]?.url ?? null },
    })),
  };
}

export async function changePassword(userId: string, currentSessionId: string | undefined, input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  const valid = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!valid) throw new HttpError(400, 'INVALID_PASSWORD', 'Current password is incorrect.');
  if (input.newPassword.length < 8 || input.newPassword.length > 128) throw new HttpError(400, 'WEAK_PASSWORD', 'New password must be between 8 and 128 characters.');
  if (input.newPassword !== input.confirmPassword) throw new HttpError(400, 'PASSWORD_MISMATCH', 'New passwords do not match.');
  const newHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } }),
    currentSessionId
      ? prisma.session.updateMany({ where: { userId, revokedAt: null, NOT: { id: currentSessionId } }, data: { revokedAt: new Date() } })
      : prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.PASSWORD_CHANGED, entity: 'User', entityId: userId } });
  return { changed: true };
}

export async function getSessions(userId: string, currentSessionId?: string) {
  const sessions = await prisma.session.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true },
  });
  return sessions.map((s) => ({
    id: s.id,
    device: s.userAgent ?? 'Unknown device',
    ipAddress: s.ipAddress,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt ?? s.createdAt,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt,
    isCurrent: currentSessionId ? s.id === currentSessionId : false,
  }));
}

export async function revokeSession(userId: string, sessionId: string, currentSessionId?: string) {
  const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
  if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', 'Session not found.');
  if (currentSessionId && sessionId === currentSessionId) throw new HttpError(400, 'CANNOT_REVOKE_CURRENT', 'Use sign-out to end your current session.');
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.SESSION_REVOKED, entity: 'Session', entityId: sessionId } });
  return { revoked: true };
}

export async function revokeOtherSessions(userId: string, currentSessionId: string | undefined) {
  if (!currentSessionId) throw new HttpError(400, 'NO_CURRENT_SESSION', 'Current session could not be determined.');
  await prisma.session.updateMany({ where: { userId, revokedAt: null, NOT: { id: currentSessionId } }, data: { revokedAt: new Date() } });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.SESSIONS_REVOKED, entity: 'Session', entityId: 'all-others' } });
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
  const data: Prisma.UserPreferenceUpdateInput = {};
  if (input.emailOrderUpdates !== undefined) data.emailOrderUpdates = input.emailOrderUpdates;
  if (input.emailDelivery !== undefined) data.emailDelivery = input.emailDelivery;
  if (input.emailReturns !== undefined) data.emailReturns = input.emailReturns;
  if (input.emailMarketing !== undefined) data.emailMarketing = input.emailMarketing;
  await prisma.userPreference.upsert({
    where: { userId },
    update: data,
    create: {
      userId,
      emailOrderUpdates: input.emailOrderUpdates ?? true,
      emailDelivery: input.emailDelivery ?? true,
      emailReturns: input.emailReturns ?? true,
      emailMarketing: input.emailMarketing ?? false,
    },
  });
  await prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.PREFERENCES_UPDATED, entity: 'UserPreference', entityId: userId } });
  return getPreferences(userId);
}

export async function claimGuestOrder(userId: string, orderNumber: string, token: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber } });
  if (!order || order.userId !== null) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  if (!order.confirmationTokenHash) throw new HttpError(403, 'INVALID_TOKEN', 'This order cannot be claimed.');
  if (order.confirmationTokenHash !== hashToken(token)) throw new HttpError(403, 'INVALID_TOKEN', 'Invalid confirmation token.');
  await prisma.$transaction([
    prisma.order.update({ where: { id: order.id }, data: { userId, confirmationTokenHash: null } }),
    prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.GUEST_ORDER_CLAIMED, entity: 'Order', entityId: order.id } }),
  ]);
  return { orderNumber, claimed: true };
}

export async function deactivateAccount(userId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: 'INACTIVE' } }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.ACCOUNT_DEACTIVATED, entity: 'User', entityId: userId } }),
  ]);
  return { deactivated: true };
}

export async function requestAccountDeletion(userId: string) {
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { status: 'DELETED', deletedAt: new Date() } }),
    prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorId: userId, action: AuditAction.ACCOUNT_DELETION_REQUESTED, entity: 'User', entityId: userId } }),
  ]);
  return { deleted: true };
}

export function buildOrderTimeline(order: {
  statusHistory?: Array<{ status: string; createdAt: Date; note?: string | null }>;
  payments?: Array<{ status: string; createdAt: Date; provider?: string }>;
  deliveries?: Array<{ history?: Array<{ toStatus: string; createdAt: Date; note?: string | null }> }>;
}) {
  const events: Array<{ label: string; date: Date; note?: string; status?: string }> = [];
  for (const h of order.statusHistory ?? []) {
    events.push({ label: `Order ${h.status.toLowerCase().replace(/_/g, ' ')}`, date: h.createdAt, note: h.note ?? undefined, status: h.status });
  }
  for (const p of order.payments ?? []) {
    events.push({ label: `Payment ${p.status.toLowerCase().replace(/_/g, ' ')}`, date: p.createdAt, note: p.provider ?? undefined, status: p.status });
  }
  for (const d of order.deliveries ?? []) {
    for (const h of d.history ?? []) {
      events.push({ label: `Delivery ${h.toStatus.toLowerCase().replace(/_/g, ' ')}`, date: h.createdAt, note: h.note ?? undefined, status: h.toStatus });
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

function serializeOrderDetail(order: {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotal: unknown;
  shippingTotal: unknown;
  discountTotal: unknown;
  taxTotal: unknown;
  grandTotal: unknown;
  currency: string;
  items: Array<{ id: string; productName: string; sku: string; variantDescription: string | null; quantity: number; unitPrice: unknown; discountAmount: unknown; subtotal: unknown; total: unknown; variant?: { product?: { images?: Array<{ url: string }> } } | null }>;
  deliveries: Array<{
    id: string;
    status: string;
    trackingNumber: string | null;
    estimatedDeliveryAt: Date | null;
    shippedAt: Date | null;
    deliveredAt: Date | null;
    shippingMethod?: { name: string; type: string } | null;
    history?: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }>;
  }>;
  payments: Array<{ id: string; status: string; amount: unknown; provider: string; providerReference: string | null; paidAt: Date | null }>;
}): AccountOrderDTO {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    subtotal: Number(order.subtotal),
    shippingTotal: Number(order.shippingTotal),
    discountTotal: Number(order.discountTotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    currency: order.currency,
    itemCount: order.items?.length ?? 0,
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      variantDescription: item.variantDescription,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      discountAmount: Number(item.discountAmount),
      subtotal: Number(item.subtotal),
      total: Number(item.total),
      productImage: item.variant?.product?.images?.[0]?.url ?? null,
    })),
    delivery: order.deliveries?.[0]
      ? {
          id: order.deliveries[0].id,
          status: order.deliveries[0].status,
          trackingNumber: order.deliveries[0].trackingNumber,
          estimatedDeliveryAt: order.deliveries[0].estimatedDeliveryAt,
          shippedAt: order.deliveries[0].shippedAt,
          deliveredAt: order.deliveries[0].deliveredAt,
          method: order.deliveries[0].shippingMethod ? { name: order.deliveries[0].shippingMethod.name, type: order.deliveries[0].shippingMethod.type } : null,
          history: order.deliveries[0].history?.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })) ?? [],
        }
      : null,
    payment: order.payments?.[0]
      ? { id: order.payments[0].id, status: order.payments[0].status, amount: Number(order.payments[0].amount), provider: order.payments[0].provider, providerReference: order.payments[0].providerReference, paidAt: order.payments[0].paidAt }
      : null,
  };
}

function serializePaymentDTO(payment: { id: string; order: { orderNumber: string }; provider: string; status: string; amount: unknown; currency: string; providerReference: string | null; paidAt: Date | null; createdAt: Date }): AccountPaymentDTO {
  return { id: payment.id, orderNumber: payment.order.orderNumber, provider: payment.provider, status: payment.status, amount: Number(payment.amount), currency: payment.currency, providerReference: payment.providerReference, paidAt: payment.paidAt, createdAt: payment.createdAt };
}

function serializeReturnDTO(returnReq: {
  id: string;
  returnNumber: string;
  order: { orderNumber: string };
  type: string;
  status: string;
  reason: string;
  customerNote: string | null;
  requestedAt: Date;
  items: Array<{ id: string; orderItemId: string; orderItem: { productName: string; sku: string; variantDescription: string | null }; quantity: number; reason: string; condition: string; disposition: string | null; refundAmount: unknown }>;
  refund: { refundNumber: string; amount: unknown; currency: string; status: string; providerReference: string | null } | null;
  exchange: { status: string; replacementVariantId: string; quantity: number } | null;
  history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: Date }>;
}): AccountReturnDTO {
  return {
    id: returnReq.id,
    returnNumber: returnReq.returnNumber,
    orderNumber: returnReq.order.orderNumber,
    type: returnReq.type,
    status: returnReq.status,
    reason: returnReq.reason,
    customerNote: returnReq.customerNote,
    requestedAt: returnReq.requestedAt,
    items: returnReq.items.map((item) => ({
      id: item.id,
      orderItemId: item.orderItemId,
      productName: item.orderItem.productName,
      sku: item.orderItem.sku,
      variantDescription: item.orderItem.variantDescription,
      quantity: item.quantity,
      reason: item.reason,
      condition: item.condition,
      disposition: item.disposition,
      refundAmount: Number(item.refundAmount),
    })),
    refund: returnReq.refund ? { refundNumber: returnReq.refund.refundNumber, amount: Number(returnReq.refund.amount), currency: returnReq.refund.currency, status: returnReq.refund.status, providerReference: returnReq.refund.providerReference } : null,
    exchange: returnReq.exchange ? { status: returnReq.exchange.status, replacementVariantId: returnReq.exchange.replacementVariantId, quantity: returnReq.exchange.quantity } : null,
    history: returnReq.history.map((h) => ({ fromStatus: h.fromStatus, toStatus: h.toStatus, note: h.note, createdAt: h.createdAt })),
  };
}

function serializeRefundDTO(refund: { id: string; refundNumber: string; order: { orderNumber: string }; amount: unknown; currency: string; status: string; provider: string; providerReference: string | null; reason: string; requestedAt: Date; processedAt: Date | null }): AccountRefundDTO {
  return { id: refund.id, refundNumber: refund.refundNumber, orderNumber: refund.order.orderNumber, amount: Number(refund.amount), currency: refund.currency, status: refund.status, provider: refund.provider, providerReference: refund.providerReference, reason: refund.reason, requestedAt: refund.requestedAt, processedAt: refund.processedAt };
}
