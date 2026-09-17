import crypto from 'node:crypto';

import type { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

import { env } from './env.js';
import { HttpError } from './errors.js';
import { prisma } from './prisma.js';
import { hashToken } from './auth.js';
import { calculateAvailableQuantity } from './catalog.js';

export const MAX_CART_ITEM_QUANTITY = 20;
export const GUEST_CART_COOKIE = 'veyra_guest_cart';
const GUEST_CART_RETENTION_DAYS = 30;

const cartInclude = {
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      variant: {
        include: {
          product: { include: { images: { orderBy: { sortOrder: 'asc' as const } } } },
          inventory: true,
          images: { orderBy: { sortOrder: 'asc' as const } },
          variantAttributeValues: {
            include: { attribute: true, attributeValue: true },
          },
        },
      },
    },
  },
};

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
type RequestWithPrincipal = FastifyRequest & { user?: { id: string } };

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_CART_RETENTION_DAYS * 24 * 60 * 60,
  };
}

function readCookie(request: FastifyRequest, name: string) {
  return request.headers.cookie
    ?.split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function getSessionUserId(request: FastifyRequest) {
  const sessionToken = readCookie(request, 'veyra_session');
  if (!sessionToken) return undefined;

  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashToken(decodeURIComponent(sessionToken)),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { userId: true },
  });

  return session?.userId;
}

function getGuestSessionId(request: FastifyRequest) {
  const value = readCookie(request, GUEST_CART_COOKIE);
  return value ? decodeURIComponent(value) : undefined;
}

function assertQuantity(quantity: number) {
  if (!isValidCartQuantity(quantity)) {
    throw new HttpError(400, 'INVALID_QUANTITY', `Quantity must be an integer between 1 and ${MAX_CART_ITEM_QUANTITY}.`);
  }
}

export function isValidCartQuantity(quantity: number) {
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_CART_ITEM_QUANTITY;
}

function availableQuantity(inventory: { quantityOnHand: number; quantityReserved: number } | null) {
  return calculateAvailableQuantity(inventory?.quantityOnHand ?? 0, inventory?.quantityReserved ?? 0);
}

function currentPrice(variant: CartWithItems['items'][number]['variant']) {
  return Number(variant.priceOverride ?? variant.product.basePrice ?? 0);
}

function productImage(variant: CartWithItems['items'][number]['variant']) {
  return variant.images.find((image) => image.isPrimary)?.url ?? variant.images[0]?.url ?? variant.product.images?.[0]?.url ?? null;
}

function isPurchasable(variant: CartWithItems['items'][number]['variant']) {
  return variant.product.status === 'ACTIVE'
    && variant.product.deletedAt === null
    && variant.status === 'ACTIVE'
    && variant.deletedAt === null;
}

function serializeCart(cart: CartWithItems) {
  const items = cart.items.map((item) => {
    const price = currentPrice(item.variant);
    const available = availableQuantity(item.variant.inventory);
    const purchasable = isPurchasable(item.variant);
    const availability = !purchasable ? 'UNAVAILABLE' : available < item.quantity ? 'LIMITED' : available > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK';

    return {
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice: Number(item.unitPriceSnapshot),
      currentPrice: price,
      priceChanged: Number(item.unitPriceSnapshot) !== price,
      subtotal: Number(item.unitPriceSnapshot) * item.quantity,
      availability,
      availableQuantity: available,
      product: {
        id: item.variant.product.id,
        slug: item.variant.product.slug,
        name: item.variant.product.name,
        image: productImage(item.variant),
      },
      variant: {
        id: item.variant.id,
        name: item.variant.name ?? item.variant.sku,
        sku: item.variant.sku,
        attributes: item.variant.variantAttributeValues.reduce<Record<string, string>>((result, entry) => {
          result[entry.attribute.name] = entry.attributeValue.value;
          return result;
        }, {}),
      },
    };
  });

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.subtotal, 0),
  };
}

async function loadCart(where: Prisma.CartWhereUniqueInput) {
  return prisma.cart.findUnique({ where, include: cartInclude });
}

async function createGuestCart(sessionId: string) {
  return prisma.cart.create({
    data: {
      sessionId,
      expiresAt: new Date(Date.now() + GUEST_CART_RETENTION_DAYS * 24 * 60 * 60 * 1000),
    },
    include: cartInclude,
  });
}

async function mergeCarts(userCart: CartWithItems, guestCart: CartWithItems) {
  return prisma.$transaction(async (transaction) => {
    for (const guestItem of guestCart.items) {
      const existing = await transaction.cartItem.findUnique({
        where: { cartId_variantId: { cartId: userCart.id, variantId: guestItem.variantId } },
      });
      const requestedQuantity = (existing?.quantity ?? 0) + guestItem.quantity;
      const available = availableQuantity(guestItem.variant.inventory);
      const quantity = Math.min(requestedQuantity, MAX_CART_ITEM_QUANTITY, available);

      if (quantity < 1) continue;

      await transaction.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCart.id, variantId: guestItem.variantId } },
        update: { quantity, unitPriceSnapshot: guestItem.unitPriceSnapshot },
        create: {
          cartId: userCart.id,
          variantId: guestItem.variantId,
          quantity,
          unitPriceSnapshot: guestItem.unitPriceSnapshot,
        },
      });
    }

    await transaction.cart.update({ where: { id: guestCart.id }, data: { status: 'MERGED', deletedAt: new Date() } });
    return transaction.cart.findUniqueOrThrow({ where: { id: userCart.id }, include: cartInclude });
  });
}

export async function getOrCreateCart(request: RequestWithPrincipal, reply: FastifyReply) {
  const userId = request.user?.id ?? await getSessionUserId(request);
  const guestSessionId = getGuestSessionId(request);

  if (userId) {
    let userCart = await loadCart({ userId });
    if (!userCart) {
      userCart = await prisma.cart.create({ data: { userId }, include: cartInclude });
    } else if (userCart.status !== 'ACTIVE' || userCart.deletedAt) {
      userCart = await prisma.cart.update({
        where: { id: userCart.id },
        data: { status: 'ACTIVE', deletedAt: null },
        include: cartInclude,
      });
    }

    if (guestSessionId) {
      const guestCart = await loadCart({ sessionId: guestSessionId });
      if (guestCart && guestCart.status === 'ACTIVE') {
        userCart = await mergeCarts(userCart, guestCart);
        reply.clearCookie(GUEST_CART_COOKIE, { path: '/' });
      }
    }

    return userCart;
  }

  const sessionId = guestSessionId ?? crypto.randomUUID();
  let cart = await loadCart({ sessionId });
  if (!cart || cart.status !== 'ACTIVE' || (cart.expiresAt && cart.expiresAt <= new Date())) {
    cart = cart
      ? await prisma.cart.update({
        where: { id: cart.id },
        data: {
          status: 'ACTIVE',
          deletedAt: null,
          expiresAt: new Date(Date.now() + GUEST_CART_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
        include: cartInclude,
      })
      : await createGuestCart(sessionId);
  }

  if (!guestSessionId) reply.setCookie(GUEST_CART_COOKIE, sessionId, cookieOptions());
  return cart;
}

async function loadPurchasableVariant(variantId: string) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: true, inventory: true },
  });

  if (!variant || !isPurchasable(variant as CartWithItems['items'][number]['variant'])) {
    throw new HttpError(409, 'VARIANT_UNAVAILABLE', 'This product variant is no longer available.');
  }

  return variant;
}

export async function addCartItem(cartId: string, variantId: string, quantity: number) {
  assertQuantity(quantity);
  const variant = await loadPurchasableVariant(variantId);
  const available = availableQuantity(variant.inventory);
  if (available < quantity) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${available} item(s) are currently available.`);

  try {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > MAX_CART_ITEM_QUANTITY) throw new HttpError(400, 'QUANTITY_LIMIT_EXCEEDED', `A maximum of ${MAX_CART_ITEM_QUANTITY} units is allowed.`);
      if (nextQuantity > available) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${available} item(s) are currently available.`);

      await transaction.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId } },
        update: { quantity: nextQuantity, unitPriceSnapshot: variant.priceOverride ?? variant.product.basePrice ?? 0 },
        create: { cartId, variantId, quantity, unitPriceSnapshot: variant.priceOverride ?? variant.product.basePrice ?? 0 },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'CART_CONFLICT', 'The cart changed while this item was being added. Please try again.');
    }
    throw error;
  }
}

export async function updateCartItem(cartId: string, itemId: string, quantity: number) {
  assertQuantity(quantity);
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: { include: { product: true, inventory: true } } } });
  if (!item) throw new HttpError(404, 'CART_ITEM_NOT_FOUND', 'Cart item not found.');
  if (!isPurchasable(item.variant as CartWithItems['items'][number]['variant'])) throw new HttpError(409, 'VARIANT_UNAVAILABLE', 'This product variant is no longer available.');
  const available = availableQuantity(item.variant.inventory);
  if (quantity > available) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${available} item(s) are currently available.`);

  await prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
}

export async function validateCart(cartId: string) {
  const cart = await loadCart({ id: cartId });
  if (!cart) throw new HttpError(404, 'CART_NOT_FOUND', 'Cart not found.');
  const serialized = serializeCart(cart);
  return {
    ...serialized,
    readyForCheckout: serialized.items.every((item) => item.availability === 'AVAILABLE' && !item.priceChanged),
    invalidItems: serialized.items.filter((item) => item.availability !== 'AVAILABLE' || item.priceChanged).map((item) => item.id),
  };
}

export { getSessionUserId, getGuestSessionId, serializeCart };
