import { z } from 'zod';
import type { AuditAction } from '@prisma/client';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { HttpError } from '../lib/errors.js';
import {
  createProductImage,
  deleteProductImage,
  listProductImages,
  reorderProductImages,
  replaceProductImage,
  setPrimaryProductImage,
  updateProductImageMeta,
} from '../lib/media/products.js';
import { prisma } from '../lib/prisma.js';
import { requireOperationsAccess } from '../middleware/auth.js';

type AuthedRequest = FastifyRequest & { user?: { id: string } };

function actorId(request: FastifyRequest): string {
  const user = (request as AuthedRequest).user;
  if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return user.id;
}

function auditMeta(request: FastifyRequest) {
  return { ipAddress: request.ip, userAgent: request.headers['user-agent']?.slice(0, 300) };
}

async function audit(action: AuditAction, request: FastifyRequest, entityId: string, after?: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { actorId: actorId(request), action, entity: 'ProductImage', entityId, ...(after ? { after: after as never } : {}), ...auditMeta(request) },
  });
}

const providerResultSchema = z.object({
  publicId: z.string().min(1).max(220),
  secureUrl: z.string().url().max(2000),
  width: z.number(),
  height: z.number(),
  format: z.string().min(1).max(20),
  bytes: z.number().optional(),
});

const createImageSchema = providerResultSchema.extend({
  altText: z.string().max(200).optional(),
  variantId: z.string().min(1).max(64).optional(),
});

const updateMetaSchema = z.object({
  altText: z.string().max(200).nullable().optional(),
});

const reorderSchema = z.object({
  imageIds: z.array(z.string().min(1).max(64)).min(1).max(20),
});

const replaceImageSchema = providerResultSchema.extend({
  altText: z.string().max(200).optional(),
});

/**
 * Product-image lifecycle (Phase D). All routes require operations access
 * (staff+); customers and guests are rejected by the guard. Every mutation
 * re-verifies the product→image relationship — image IDs alone never
 * authorize anything (IDOR/BOLA).
 */
export async function productMediaRoutes(app: FastifyInstance) {
  app.get('/admin/products/:productId/images', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId } = request.params as { productId: string };
    return { success: true, data: await listProductImages(productId) };
  });

  app.post('/admin/products/:productId/images', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId } = request.params as { productId: string };
    const payload = createImageSchema.parse(request.body);
    const image = await createProductImage({
      productId,
      actorId: actorId(request),
      result: payload,
      altText: payload.altText,
      variantId: payload.variantId ?? null,
    });
    await audit('PRODUCT_IMAGE_CREATED', request, image.id, { productId });
    return { success: true, data: image };
  });

  // Static reorder path must win over `:imageId` — registered before it.
  app.patch('/admin/products/:productId/images/reorder', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId } = request.params as { productId: string };
    const payload = reorderSchema.parse(request.body);
    const images = await reorderProductImages({ productId, imageIds: payload.imageIds });
    await audit('PRODUCT_IMAGE_REORDERED', request, productId, { productId });
    return { success: true, data: images };
  });

  app.patch('/admin/products/:productId/images/:imageId', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId, imageId } = request.params as { productId: string; imageId: string };
    const payload = updateMetaSchema.parse(request.body);
    const image = await updateProductImageMeta({ productId, imageId, altText: payload.altText });
    await audit('PRODUCT_IMAGE_UPDATED', request, image.id, { productId });
    return { success: true, data: image };
  });

  app.post('/admin/products/:productId/images/:imageId/primary', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId, imageId } = request.params as { productId: string; imageId: string };
    const images = await setPrimaryProductImage({ productId, imageId });
    await audit('PRODUCT_PRIMARY_IMAGE_CHANGED', request, imageId, { productId });
    return { success: true, data: images };
  });

  app.post('/admin/products/:productId/images/:imageId/replace', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId, imageId } = request.params as { productId: string; imageId: string };
    const payload = replaceImageSchema.parse(request.body);
    const { image, providerCleanup } = await replaceProductImage({
      productId,
      imageId,
      result: payload,
      altText: payload.altText,
    });
    await audit('PRODUCT_IMAGE_REPLACED', request, image.id, { productId, providerCleanup });
    return { success: true, data: { ...image, providerCleanup } };
  });

  app.delete(
    '/admin/products/:productId/images/:imageId',
    { preHandler: requireOperationsAccess },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { productId, imageId } = request.params as { productId: string; imageId: string };
      const { images, providerCleanup } = await deleteProductImage({ productId, imageId });
      await audit('PRODUCT_IMAGE_DELETED', request, imageId, { productId, providerCleanup });
      reply.status(200);
      return { success: true, data: { images, providerCleanup } };
    },
  );
}
