import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';

import { hashToken } from './auth.js';
import { calculateAvailableQuantity } from './catalog.js';
import { HttpError } from './errors.js';
import { prisma } from './prisma.js';
import { isValidCartQuantity, MAX_CART_ITEM_QUANTITY } from './shopping.js';

export type CheckoutAddress = {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

export type CheckoutInput = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryMethodId: string;
  shippingZoneCode?: string;
  address?: CheckoutAddress;
  addressId?: string;
  notes?: string;
  confirmPriceChanges?: boolean;
};

type CheckoutCart = Prisma.CartGetPayload<{
  include: {
    items: {
      orderBy: { createdAt: 'asc' };
      include: {
        variant: {
          include: {
            product: true;
            inventory: true;
            variantAttributeValues: { include: { attribute: true; attributeValue: true } };
          };
        };
      };
    };
  };
}>;
type DbClient = typeof prisma | Prisma.TransactionClient;

const checkoutCartInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          product: true,
          inventory: true,
          variantAttributeValues: { include: { attribute: true, attributeValue: true } },
        },
      },
    },
  },
};

function normalizePhone(value: string) {
  const compact = value.replace(/[\s()-]/g, '');
  if (/^07\d{8}$/.test(compact) || /^01\d{8}$/.test(compact)) return `+254${compact.slice(1)}`;
  if (/^254[17]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+254[17]\d{8}$/.test(compact)) return compact;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  throw new HttpError(400, 'CHECKOUT_INVALID_CUSTOMER', 'Enter a valid phone number.', { field: 'customerPhone' });
}

function currentPrice(item: CheckoutCart['items'][number]) {
  return new Prisma.Decimal(item.variant.priceOverride ?? item.variant.product.basePrice ?? 0);
}

function availableQuantity(item: CheckoutCart['items'][number]) {
  return calculateAvailableQuantity(item.variant.inventory?.quantityOnHand ?? 0, item.variant.inventory?.quantityReserved ?? 0);
}

function attributes(item: CheckoutCart['items'][number]) {
  return item.variant.variantAttributeValues.reduce<Record<string, string>>((result, entry) => {
    result[entry.attribute.name] = entry.attributeValue.value;
    return result;
  }, {});
}

function validateInput(input: CheckoutInput) {
  if (input.customerName.trim().length < 2 || input.customerName.trim().length > 120) {
    throw new HttpError(400, 'CHECKOUT_INVALID_CUSTOMER', 'Enter your full name.', { field: 'customerName' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerEmail.trim()) || input.customerEmail.length > 200) {
    throw new HttpError(400, 'CHECKOUT_INVALID_CUSTOMER', 'Enter a valid email address.', { field: 'customerEmail' });
  }
  normalizePhone(input.customerPhone);
  if (input.notes && input.notes.length > 500) throw new HttpError(400, 'CHECKOUT_INVALID_ADDRESS', 'Notes must be 500 characters or fewer.', { field: 'notes' });
  if (input.address) {
    for (const [field, value] of Object.entries(input.address)) {
      if (value && value.length > 180) throw new HttpError(400, 'CHECKOUT_INVALID_ADDRESS', 'Address details are too long.', { field });
    }
    if (!input.address.line1.trim() || !input.address.city.trim()) {
      throw new HttpError(400, 'CHECKOUT_INVALID_ADDRESS', 'Enter the required address details.');
    }
  }
}

async function loadCart(cartId: string, client: DbClient = prisma) {
  return client.cart.findUnique({ where: { id: cartId }, include: checkoutCartInclude });
}

function validateCartItems(cart: CheckoutCart, confirmPriceChanges = false) {
  if (!cart.items.length) throw new HttpError(409, 'CHECKOUT_CART_EMPTY', 'Your cart is empty.');
  const issues: Array<{ itemId: string; issue: string; currentPrice?: number; availableQuantity?: number }> = [];

  for (const item of cart.items) {
    const productActive = item.variant.product.status === 'ACTIVE' && item.variant.product.deletedAt === null;
    const variantActive = item.variant.status === 'ACTIVE' && item.variant.deletedAt === null;
    const price = currentPrice(item);
    const available = availableQuantity(item);
    if (!productActive || !variantActive) issues.push({ itemId: item.id, issue: 'UNAVAILABLE' });
    else if (!isValidCartQuantity(item.quantity) || item.quantity > MAX_CART_ITEM_QUANTITY) issues.push({ itemId: item.id, issue: 'INVALID_QUANTITY' });
    else if (available < item.quantity) issues.push({ itemId: item.id, issue: 'INSUFFICIENT_STOCK', availableQuantity: available });
    else if (!confirmPriceChanges && Number(item.unitPriceSnapshot) !== price.toNumber()) issues.push({ itemId: item.id, issue: 'PRICE_CHANGED', currentPrice: price.toNumber() });
  }

  if (issues.length) throw new HttpError(409, 'CHECKOUT_REQUIRES_UPDATE', 'Review the highlighted cart changes before placing your order.', { cartIssues: issues });
}

async function resolveShipping(input: CheckoutInput, subtotal: Prisma.Decimal, client: DbClient = prisma) {
  const method = await client.shippingMethod.findFirst({ where: { id: input.deliveryMethodId, status: 'ACTIVE' } });
  if (!method) throw new HttpError(409, 'CHECKOUT_SHIPPING_UNAVAILABLE', 'The selected delivery method is unavailable.');
  if (!input.shippingZoneCode) throw new HttpError(400, 'CHECKOUT_INVALID_ADDRESS', 'Select a delivery zone.');

  const zone = await client.shippingZone.findFirst({ where: { code: input.shippingZoneCode, status: 'ACTIVE', country: input.address?.country ?? 'KE' } });
  if (!zone) throw new HttpError(409, 'CHECKOUT_SHIPPING_UNAVAILABLE', 'The selected delivery zone is unavailable.');

  const rate = await client.shippingRate.findFirst({
    where: { zoneId: zone.id, methodId: method.id, status: 'ACTIVE', minOrderValue: { lte: subtotal } },
    orderBy: { minOrderValue: 'desc' },
  });
  if (!rate) throw new HttpError(409, 'CHECKOUT_SHIPPING_UNAVAILABLE', 'No shipping rate is configured for that method and zone.');

  return { method, zone, rate };
}

function totals(cart: CheckoutCart, shipping: Prisma.Decimal) {
  const subtotal = cart.items.reduce((sum, item) => sum.add(currentPrice(item).mul(item.quantity)), new Prisma.Decimal(0));
  const discountTotal = new Prisma.Decimal(0);
  const taxTotal = new Prisma.Decimal(0);
  return { subtotal, discountTotal, shippingTotal: shipping, taxTotal, grandTotal: subtotal.sub(discountTotal).add(shipping).add(taxTotal) };
}

function orderNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `ORD-${date}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function serializeOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    customerPhone: order.customerPhone,
    subtotal: Number(order.subtotal),
    shippingTotal: Number(order.shippingTotal),
    discountTotal: Number(order.discountTotal),
    taxTotal: Number(order.taxTotal),
    grandTotal: Number(order.grandTotal),
    currency: order.currency,
    delivery: order.deliveries[0] ? { method: order.deliveries[0].shippingMethodId, status: order.deliveries[0].status } : null,
    items: order.items.map((item: any) => ({
      id: item.id,
      productName: item.productName,
      sku: item.sku,
      variantDescription: item.variantDescription,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      subtotal: Number(item.subtotal),
      total: Number(item.total),
    })),
  };
}

const orderInclude = { items: true, deliveries: true };

export async function getCheckoutContext(cartId: string, input: CheckoutInput, confirmPriceChanges = false) {
  validateInput(input);
  const cart = await loadCart(cartId);
  if (!cart) throw new HttpError(404, 'CART_NOT_FOUND', 'Cart not found.');
  validateCartItems(cart, confirmPriceChanges);
  const subtotal = totals(cart, new Prisma.Decimal(0)).subtotal;
  const shipping = await resolveShipping(input, subtotal);
  return { cart, shipping, totals: totals(cart, shipping.rate.basePrice), phone: normalizePhone(input.customerPhone) };
}

export async function previewCheckout(cartId: string, input: CheckoutInput) {
  const context = await getCheckoutContext(cartId, input, true);
  const priceChangedItems = context.cart.items.filter((item) => Number(item.unitPriceSnapshot) !== currentPrice(item).toNumber()).map((item) => item.id);
  return {
    items: context.cart.items.map((item) => ({ id: item.id, productName: item.variant.product.name, variant: item.variant.name ?? item.variant.sku, quantity: item.quantity, unitPrice: currentPrice(item).toNumber(), subtotal: currentPrice(item).mul(item.quantity).toNumber() })),
    subtotal: context.totals.subtotal.toNumber(),
    discountTotal: 0,
    shippingTotal: context.totals.shippingTotal.toNumber(),
    taxTotal: 0,
    grandTotal: context.totals.grandTotal.toNumber(),
    currency: 'KES',
    shippingMethod: { id: context.shipping.method.id, name: context.shipping.method.name, type: context.shipping.method.type },
    shippingZone: { code: context.shipping.zone.code, name: context.shipping.zone.name },
    priceChangedItems,
    requiresPriceConfirmation: priceChangedItems.length > 0,
  };
}

export async function placeOrder(cartId: string, input: CheckoutInput, scope: string, idempotencyKey: string, userId?: string) {
  validateInput(input);
  const requestHash = hashToken(JSON.stringify({ cartId, input, scope }));
  const existing = await prisma.checkoutIdempotency.findUnique({ where: { key: idempotencyKey }, include: { order: { include: orderInclude } } });
  if (existing) {
    if (existing.scope !== scope || existing.requestHash !== requestHash) throw new HttpError(409, 'CHECKOUT_DUPLICATE_REQUEST', 'That idempotency key was already used for a different checkout.');
    if (existing.order) return { order: serializeOrder(existing.order), confirmationToken: undefined, replayed: true };
  }

  const confirmationToken = crypto.randomBytes(32).toString('hex');
  try {
    const order = await prisma.$transaction(async (transaction) => {
      await transaction.checkoutIdempotency.create({ data: { key: idempotencyKey, scope, requestHash, userId } });
      const cart = await loadCart(cartId, transaction);
      if (!cart) throw new HttpError(404, 'CART_NOT_FOUND', 'Cart not found.');
      validateCartItems(cart, input.confirmPriceChanges === true);
      const subtotal = totals(cart, new Prisma.Decimal(0)).subtotal;
      const shipping = await resolveShipping(input, subtotal, transaction);
      const calculated = totals(cart, shipping.rate.basePrice);
      const normalizedPhone = normalizePhone(input.customerPhone);
      const address = input.addressId && userId
        ? await transaction.address.findFirst({ where: { id: input.addressId, userId } })
        : null;
      if (input.addressId && !address) throw new HttpError(403, 'CHECKOUT_INVALID_ADDRESS', 'That saved address is not available.');
      if (!address && shipping.method.type !== 'PICKUP' && !input.address) throw new HttpError(400, 'CHECKOUT_INVALID_ADDRESS', 'Enter a delivery address.');

      const createdOrder = await transaction.order.create({
        data: {
          orderNumber: orderNumber(),
          userId: userId ?? null,
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail.trim().toLowerCase(),
          customerPhone: normalizedPhone,
          confirmationTokenHash: hashToken(confirmationToken),
          subtotal: calculated.subtotal,
          discountTotal: calculated.discountTotal,
          shippingTotal: calculated.shippingTotal,
          taxTotal: calculated.taxTotal,
          grandTotal: calculated.grandTotal,
          currency: 'KES',
          shippingAddressSnapshot: {
            ...(address ? { id: address.id, line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country } : input.address ?? {}),
            deliveryMethod: { id: shipping.method.id, name: shipping.method.name, type: shipping.method.type },
            shippingZone: { code: shipping.zone.code, name: shipping.zone.name },
          },
          notes: input.notes?.trim() || null,
        },
      });

      const sortedItems = [...cart.items].sort((left, right) => left.variantId.localeCompare(right.variantId));
      for (const item of sortedItems) {
        const price = currentPrice(item);
        const update = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          UPDATE "Inventory"
          SET "quantityReserved" = "quantityReserved" + ${item.quantity}, "updatedAt" = CURRENT_TIMESTAMP
          WHERE "variantId" = ${item.variantId}
            AND "quantityOnHand" - "quantityReserved" >= ${item.quantity}
          RETURNING "id"
        `);
        if (update.length !== 1) throw new HttpError(409, 'CHECKOUT_STOCK_UNAVAILABLE', 'Inventory changed. Please review your cart.');

        await transaction.orderItem.create({ data: { orderId: createdOrder.id, variantId: item.variantId, productName: item.variant.product.name, sku: item.variant.sku, variantDescription: JSON.stringify(attributes(item)), unitPrice: price, discountAmount: 0, subtotal: price.mul(item.quantity), total: price.mul(item.quantity), quantity: item.quantity } });
        await transaction.inventoryReservation.create({ data: { variantId: item.variantId, orderId: createdOrder.id, quantity: item.quantity, status: 'ACTIVE' } });
        await transaction.inventoryMovement.create({ data: { variantId: item.variantId, movementType: 'RESERVED', quantity: item.quantity, reason: 'ORDER_CREATED', referenceType: 'ORDER', referenceId: createdOrder.id } });
      }

      await transaction.delivery.create({
        data: {
          orderId: createdOrder.id,
          shippingMethodId: shipping.method.id,
          shippingZoneId: shipping.zone.id,
          status: 'PENDING',
          recipientName: input.customerName.trim(),
          recipientPhone: normalizedPhone,
          deliveryAddress: address ? {
            line1: address.line1,
            line2: address.line2,
            city: address.city,
            state: address.state,
            postalCode: address.postalCode,
            country: address.country,
          } : input.address ?? undefined,
          deliveryInstructions: input.notes?.trim() || null,
        },
      });
      await transaction.orderStatusHistory.create({ data: { orderId: createdOrder.id, status: 'PENDING', changedBy: userId ?? null, note: 'Order created during checkout.' } });
      await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
      await transaction.cart.update({ where: { id: cart.id }, data: { status: 'CHECKED_OUT', deletedAt: new Date() } });
      await transaction.checkoutIdempotency.update({ where: { key: idempotencyKey }, data: { orderId: createdOrder.id } });
      return transaction.order.findUniqueOrThrow({ where: { id: createdOrder.id }, include: orderInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { order: serializeOrder(order), confirmationToken, replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const retry = await prisma.checkoutIdempotency.findUnique({ where: { key: idempotencyKey }, include: { order: { include: orderInclude } } });
      if (retry?.requestHash === requestHash && retry.order) return { order: serializeOrder(retry.order), confirmationToken: undefined, replayed: true };
    }
    throw error;
  }
}

export async function getOrderForConfirmation(orderNumberValue: string, userId?: string, confirmationToken?: string) {
  const order = await prisma.order.findUnique({ where: { orderNumber: orderNumberValue }, include: orderInclude });
  if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  const authorized = userId ? order.userId === userId : confirmationToken ? order.confirmationTokenHash === hashToken(confirmationToken) : false;
  if (!authorized) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found.');
  return serializeOrder(order);
}
