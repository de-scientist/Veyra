import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { requireAuth } from '../middleware/auth.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  addCartItem,
  getOrCreateCart,
  serializeCart,
  updateCartItem,
  validateCart,
} from '../lib/shopping.js';

const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const quantitySchema = z.object({ quantity: z.number().int().min(1) });

function userId(request: FastifyRequest) {
  const user = (request as FastifyRequest & { user?: { id: string } }).user;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return user.id;
}

function serializeWishlist(wishlist: Awaited<ReturnType<typeof getWishlistForUser>>) {
  return {
    id: wishlist.id,
    items: wishlist.items.map((item) => {
      const variants = item.product.variants;
      const availableVariants = variants.filter((variant) => {
        const available = (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0);
        return item.product.status === 'ACTIVE' && variant.status === 'ACTIVE' && !variant.deletedAt && available > 0;
      });
      const priceVariant = variants.find((variant) => variant.isDefault) ?? variants[0];
      return {
        id: item.id,
        productId: item.productId,
        product: {
          id: item.product.id,
          slug: item.product.slug,
          name: item.product.name,
          description: item.product.description,
          image: item.product.images.find((image) => image.isPrimary)?.url ?? item.product.images[0]?.url ?? null,
          price: Number(priceVariant?.priceOverride ?? item.product.basePrice ?? 0),
          availability: item.product.status !== 'ACTIVE' ? 'UNAVAILABLE' : availableVariants.length ? 'AVAILABLE' : 'OUT_OF_STOCK',
          hasVariantSelection: availableVariants.length > 1,
        },
      };
    }),
  };
}

async function getWishlistForUser(id: string) {
  return prisma.wishlist.upsert({
    where: { userId: id },
    update: {},
    create: { userId: id },
    include: {
      items: {
        orderBy: { createdAt: 'asc' },
        include: {
          product: {
            include: {
              images: { orderBy: { sortOrder: 'asc' } },
              variants: { include: { inventory: true } },
            },
          },
        },
      },
    },
  });
}

export async function shoppingRoutes(app: FastifyInstance) {
  app.get('/cart', async (request, reply) => {
    const cart = await getOrCreateCart(request, reply);
    return { success: true, data: serializeCart(cart) };
  });

  app.post('/cart/items', async (request, reply) => {
    const payload = cartItemSchema.parse(request.body);
    const cart = await getOrCreateCart(request, reply);
    await addCartItem(cart.id, payload.variantId, payload.quantity);
    const updatedCart = await getOrCreateCart(request, reply);
    return { success: true, data: serializeCart(updatedCart) };
  });

  app.patch('/cart/items/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const payload = quantitySchema.parse(request.body);
    const cart = await getOrCreateCart(request, reply);
    await updateCartItem(cart.id, itemId, payload.quantity);
    const updatedCart = await getOrCreateCart(request, reply);
    return { success: true, data: serializeCart(updatedCart) };
  });

  app.delete('/cart/items/:itemId', async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const cart = await getOrCreateCart(request, reply);
    await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    const updatedCart = await getOrCreateCart(request, reply);
    return { success: true, data: serializeCart(updatedCart) };
  });

  app.delete('/cart', async (request, reply) => {
    const cart = await getOrCreateCart(request, reply);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    const updatedCart = await getOrCreateCart(request, reply);
    return { success: true, data: serializeCart(updatedCart) };
  });

  app.get('/cart/validation', async (request, reply) => {
    const cart = await getOrCreateCart(request, reply);
    return { success: true, data: await validateCart(cart.id) };
  });

  app.get('/wishlist', { preHandler: requireAuth }, async (request) => {
    const wishlist = await getWishlistForUser(userId(request));
    return { success: true, data: serializeWishlist(wishlist) };
  });

  app.post('/wishlist/items', { preHandler: requireAuth }, async (request) => {
    const payload = z.object({ productId: z.string().uuid() }).parse(request.body);
    const product = await prisma.product.findUnique({ where: { id: payload.productId } });
    if (!product || product.deletedAt) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');

    const wishlist = await getWishlistForUser(userId(request));
    await prisma.wishlistItem.upsert({
      where: { wishlistId_productId: { wishlistId: wishlist.id, productId: payload.productId } },
      update: {},
      create: { wishlistId: wishlist.id, productId: payload.productId },
    });

    return { success: true, data: serializeWishlist(await getWishlistForUser(userId(request))) };
  });

  app.delete('/wishlist/items/:itemId', { preHandler: requireAuth }, async (request) => {
    const { itemId } = request.params as { itemId: string };
    const wishlist = await getWishlistForUser(userId(request));
    await prisma.wishlistItem.deleteMany({ where: { id: itemId, wishlistId: wishlist.id } });
    return { success: true, data: serializeWishlist(await getWishlistForUser(userId(request))) };
  });
}
