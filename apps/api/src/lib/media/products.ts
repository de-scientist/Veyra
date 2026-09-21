import { Prisma } from '@prisma/client';

import { HttpError } from '../errors.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { destroyMedia, getMediaConfig, normalizeUploadResult } from './cloudinary.js';

/**
 * Product-image domain service (Phase D). Application/database is the source
 * of truth for ownership, primary status, and ordering; Cloudinary stores
 * the bytes. All mutations are transactional where multi-row invariants
 * (single primary, dense ordering) are at stake.
 */

/** Operational safeguard (not a business rule): bounds admin UX + cost. */
export const MAX_PRODUCT_IMAGES = 20;

export const PRODUCT_IMAGE_SELECT = {
  id: true,
  productId: true,
  variantId: true,
  url: true,
  publicId: true,
  secureUrl: true,
  width: true,
  height: true,
  format: true,
  bytes: true,
  altText: true,
  isPrimary: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ProductImageDTO = {
  id: string;
  productId: string;
  variantId: string | null;
  /** Display URL: Cloudinary secure URL, falling back to legacy `url`. */
  url: string;
  publicId: string | null;
  secureUrl: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  bytes: number | null;
  altText: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type ImageRow = Prisma.ProductImageGetPayload<{ select: typeof PRODUCT_IMAGE_SELECT }>;

export function serializeProductImage(row: ImageRow): ProductImageDTO {
  return {
    id: row.id,
    productId: row.productId,
    variantId: row.variantId,
    url: row.secureUrl ?? row.url,
    publicId: row.publicId,
    secureUrl: row.secureUrl,
    width: row.width,
    height: row.height,
    format: row.format,
    bytes: row.bytes,
    altText: row.altText,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getEditableProduct(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  // DRAFT + ACTIVE are editable; ARCHIVED is read-only for media.
  if (product.status === 'ARCHIVED') {
    throw new HttpError(409, 'PRODUCT_ARCHIVED', 'Media is read-only for archived products.');
  }
  return product;
}

async function getOwnedImage(productId: string, imageId: string) {
  const image = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: PRODUCT_IMAGE_SELECT,
  });
  if (!image || image.productId !== productId) {
    // 404 (not 403) for cross-product IDs: reveals nothing about Product B.
    throw new HttpError(404, 'PRODUCT_IMAGE_NOT_FOUND', 'Product image not found.');
  }
  return image;
}

export function normalizeAltText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length > 200) {
    throw new HttpError(400, 'INVALID_ALT_TEXT', 'Alt text must be 200 characters or fewer.');
  }
  return trimmed;
}

export async function listProductImages(productId: string): Promise<ProductImageDTO[]> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const rows = await prisma.productImage.findMany({
    where: { productId },
    select: PRODUCT_IMAGE_SELECT,
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(serializeProductImage);
}

export type ValidatedProviderResult = {
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes?: number;
};

export type ProductImageResultInput = {
  publicId: unknown;
  secureUrl: unknown;
  width: unknown;
  height: unknown;
  format: unknown;
  bytes?: unknown;
};

function validateProviderResult(result: ProductImageResultInput): ValidatedProviderResult {
  const config = getMediaConfig();
  // The HTTP contract is camelCase; the provider normalizer speaks the
  // Cloudinary snake_case shape. resource_type is server-asserted 'image' —
  // never accepted from the client.
  return normalizeUploadResult(config.baseFolder, 'product', {
    public_id: result.publicId,
    secure_url: result.secureUrl,
    resource_type: 'image',
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  });
}

export async function createProductImage(input: {
  productId: string;
  actorId: string;
  result: ProductImageResultInput;
  altText?: unknown;
  variantId?: string | null;
}): Promise<ProductImageDTO> {
  await getEditableProduct(input.productId);
  const validated = validateProviderResult(input.result);

  if (input.variantId) {
    const variant = await prisma.productVariant.findUnique({ where: { id: input.variantId } });
    if (!variant || variant.productId !== input.productId) {
      throw new HttpError(404, 'PRODUCT_VARIANT_NOT_FOUND', 'Variant does not belong to this product.');
    }
  }

  const existing = await prisma.productImage.findMany({
    where: { productId: input.productId },
    select: { sortOrder: true },
    orderBy: { sortOrder: 'desc' },
    take: MAX_PRODUCT_IMAGES + 1,
  });
  if (existing.length >= MAX_PRODUCT_IMAGES) {
    throw new HttpError(409, 'PRODUCT_IMAGE_LIMIT', `A product may have at most ${MAX_PRODUCT_IMAGES} images.`);
  }

  // First image wins primary at position 0 (Pattern A: primary independent
  // of later ordering; reorder never changes isPrimary). Client-supplied
  // isPrimary/sortOrder are never trusted.
  const isFirst = existing.length === 0;
  const nextOrder = isFirst ? 0 : (existing[0]?.sortOrder ?? existing.length - 1) + 1;

  try {
    const created = await prisma.productImage.create({
      data: {
        productId: input.productId,
        variantId: input.variantId ?? null,
        // url mirrors secureUrl so legacy `url` readers keep working.
        url: validated.secureUrl,
        publicId: validated.publicId,
        secureUrl: validated.secureUrl,
        width: validated.width,
        height: validated.height,
        format: validated.format,
        bytes: validated.bytes ?? null,
        altText: normalizeAltText(input.altText),
        isPrimary: isFirst,
        sortOrder: nextOrder,
      },
      select: PRODUCT_IMAGE_SELECT,
    });
    return serializeProductImage(created);
  } catch (error) {
    // Upload succeeded but the DB insert failed: best-effort orphan cleanup
    // before surfacing the error (never silent, never blocking the report).
    try {
      await destroyMedia(validated.publicId);
    } catch (cleanupError) {
      logger.error(
        { err: cleanupError, publicId: validated.publicId, productId: input.productId },
        'media.orphan_cleanup_failed',
      );
    }
    throw error;
  }
}

export async function updateProductImageMeta(input: {
  productId: string;
  imageId: string;
  altText?: unknown;
}): Promise<ProductImageDTO> {
  await getEditableProduct(input.productId);
  await getOwnedImage(input.productId, input.imageId);
  const updated = await prisma.productImage.update({
    // Only application-level metadata is mutable here — never
    // productId/publicId/secureUrl/provider fields (see §62–64).
    where: { id: input.imageId },
    data: { altText: normalizeAltText(input.altText) },
    select: PRODUCT_IMAGE_SELECT,
  });
  return serializeProductImage(updated);
}

export async function setPrimaryProductImage(input: {
  productId: string;
  imageId: string;
}): Promise<ProductImageDTO[]> {
  await getEditableProduct(input.productId);
  await getOwnedImage(input.productId, input.imageId);
  // Unset-all + set in one transaction; the partial unique index
  // (productId WHERE isPrimary) is the final backstop.
  await prisma.$transaction([
    prisma.productImage.updateMany({ where: { productId: input.productId }, data: { isPrimary: false } }),
    prisma.productImage.update({ where: { id: input.imageId }, data: { isPrimary: true } }),
  ]);
  return listProductImages(input.productId);
}

export async function reorderProductImages(input: {
  productId: string;
  imageIds: string[];
}): Promise<ProductImageDTO[]> {
  await getEditableProduct(input.productId);
  const ids = input.imageIds;
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'INVALID_IMAGE_ORDER', 'Image order must list each image exactly once.');
  }
  // Validate the ENTIRE set before touching any row (no partial reorders).
  const owned = await prisma.productImage.findMany({
    where: { productId: input.productId },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((row) => row.id));
  if (owned.length !== ids.length || !ids.every((id) => ownedIds.has(id))) {
    throw new HttpError(400, 'INVALID_IMAGE_ORDER', 'Image order must contain exactly the product images.');
  }
  await prisma.$transaction(
    ids.map((id, index) => prisma.productImage.update({ where: { id }, data: { sortOrder: index } })),
  );
  return listProductImages(input.productId);
}

export async function replaceProductImage(input: {
  productId: string;
  imageId: string;
  result: ProductImageResultInput;
  altText?: unknown;
}): Promise<{ image: ProductImageDTO; providerCleanup: 'deleted' | 'failed' | 'skipped' }> {
  await getEditableProduct(input.productId);
  const current = await getOwnedImage(input.productId, input.imageId);
  const validated = validateProviderResult(input.result);

  const updated = await prisma.productImage.update({
    // Identity preserved: same row keeps isPrimary + sortOrder + variant
    // binding; only the provider asset + dimensions change.
    where: { id: input.imageId },
    data: {
      url: validated.secureUrl,
      publicId: validated.publicId,
      secureUrl: validated.secureUrl,
      width: validated.width,
      height: validated.height,
      format: validated.format,
      bytes: validated.bytes ?? null,
      ...(input.altText !== undefined ? { altText: normalizeAltText(input.altText) } : {}),
    },
    select: PRODUCT_IMAGE_SELECT,
  });

  // Old asset cleanup happens only after the DB row is safely updated.
  let providerCleanup: 'deleted' | 'failed' | 'skipped' = 'skipped';
  if (current.publicId && current.publicId !== validated.publicId) {
    try {
      await destroyMedia(current.publicId);
      providerCleanup = 'deleted';
    } catch (error) {
      logger.error(
        { err: error, publicId: current.publicId, productId: input.productId, imageId: input.imageId },
        'media.replace_cleanup_failed',
      );
      providerCleanup = 'failed';
    }
  }
  return { image: serializeProductImage(updated), providerCleanup };
}

export async function deleteProductImage(input: {
  productId: string;
  imageId: string;
}): Promise<{ images: ProductImageDTO[]; providerCleanup: 'deleted' | 'failed' | 'skipped' }> {
  await getEditableProduct(input.productId);
  const current = await getOwnedImage(input.productId, input.imageId);

  // DB first (reference removed), provider cleanup after. If cleanup fails
  // the database stays correct and the failure is reported, not hidden.
  const remaining = await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: input.imageId } });
    if (current.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId: input.productId },
        select: { id: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) {
        await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }
    return tx.productImage.findMany({
      where: { productId: input.productId },
      select: PRODUCT_IMAGE_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  });

  let providerCleanup: 'deleted' | 'failed' | 'skipped' = 'skipped';
  if (current.publicId) {
    try {
      await destroyMedia(current.publicId);
      providerCleanup = 'deleted';
    } catch (error) {
      logger.error(
        { err: error, publicId: current.publicId, productId: input.productId, imageId: input.imageId },
        'media.delete_cleanup_failed',
      );
      providerCleanup = 'failed';
    }
  }
  return { images: remaining.map(serializeProductImage), providerCleanup };
}
