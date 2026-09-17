import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { generateSlug, validateCatalogProduct } from '../lib/catalog.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const productSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(12),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  slug: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
  isFeatured: z.boolean().default(false),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  seoKeywords: z.string().optional(),
});

const variantSchema = z.object({
  sku: z.string().min(3),
  name: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  barcode: z.string().optional(),
  weight: z.number().min(0).optional(),
  attributeValues: z.array(z.object({
    attributeId: z.string(),
    value: z.string(),
  })).default([]),
});

const inventorySchema = z.object({
  quantityOnHand: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
});

export async function catalogueRoutes(app: FastifyInstance) {
  app.get('/catalog/products', async () => {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      include: {
        category: true,
        variants: true,
        images: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: products,
    };
  });

  app.get('/catalog/products/:id', async (_request) => {
    const { id } = _request.params as { id: string };
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        variants: {
          include: {
            inventory: true,
            variantAttributeValues: {
              include: {
                attribute: true,
                attributeValue: true,
              },
            },
          },
        },
        images: true,
        collections: {
          include: { collection: true },
        },
      },
    });

    if (!product) {
      throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }

    return {
      success: true,
      data: product,
    };
  });

  app.post('/admin/products', async (request) => {
    const payload = productSchema.parse(request.body);
    const safeSlug = payload.slug ? payload.slug : generateSlug(payload.name);
    const product = await prisma.product.create({
      data: {
        name: payload.name,
        slug: safeSlug,
        description: payload.description,
        categoryId: payload.categoryId,
        status: payload.status,
      },
    });

    return {
      success: true,
      data: product,
    };
  });

  app.post('/admin/products/:productId/variants', async (request) => {
    const { productId } = request.params as { productId: string };
    const payload = variantSchema.parse(request.body);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }

    const validation = validateCatalogProduct({
      name: product.name,
      slug: product.slug,
      categoryId: product.categoryId ?? undefined,
      description: product.description ?? '',
      variants: [
        {
          sku: payload.sku,
          price: payload.price,
          status: payload.status,
          attributeValues: payload.attributeValues,
        },
      ],
      images: [],
    });

    if (!validation.ok) {
      throw new HttpError(400, 'PRODUCT_NOT_PUBLISHABLE', validation.errors.join('; '));
    }

    const variant = await prisma.productVariant.create({
      data: {
        productId,
        sku: payload.sku,
        name: payload.name ?? payload.sku,
        status: payload.status,
        priceOverride: payload.price,
        compareAtPrice: payload.compareAtPrice ?? null,
        isDefault: false,
      },
    });

    await prisma.inventory.create({
      data: {
        variantId: variant.id,
        quantityOnHand: 0,
        quantityReserved: 0,
        lowStockThreshold: 5,
      },
    });

    return {
      success: true,
      data: variant,
    };
  });

  app.get('/admin/inventory', async () => {
    const inventory = await prisma.inventory.findMany({
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });

    return {
      success: true,
      data: inventory,
    };
  });

  app.post('/admin/inventory/:variantId/restock', async (request) => {
    const { variantId } = request.params as { variantId: string };
    const payload = inventorySchema.parse(request.body);

    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    if (!inventory) {
      throw new HttpError(404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
    }

    const nextQuantity = inventory.quantityOnHand + payload.quantityOnHand;
    const updated = await prisma.inventory.update({
      where: { variantId },
      data: {
        quantityOnHand: nextQuantity,
        lowStockThreshold: payload.lowStockThreshold,
      },
    });

    await prisma.inventoryMovement.create({
      data: {
        variantId,
        movementType: 'IN',
        quantity: payload.quantityOnHand,
        reason: 'RESTOCK',
        note: 'Restocked via admin inventory action.',
      },
    });

    return {
      success: true,
      data: updated,
    };
  });

  app.post('/admin/inventory/:variantId/adjust', async (request) => {
    const { variantId } = request.params as { variantId: string };
    const payload = z.object({
      delta: z.number().int(),
      reason: z.string().min(3),
    }).parse(request.body);

    const inventory = await prisma.inventory.findUnique({ where: { variantId } });
    if (!inventory) {
      throw new HttpError(404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
    }

    const nextQuantity = inventory.quantityOnHand + payload.delta;
    if (nextQuantity < 0) {
      throw new HttpError(400, 'INVALID_INVENTORY_ADJUSTMENT', 'Inventory cannot be negative.');
    }

    const updated = await prisma.inventory.update({
      where: { variantId },
      data: { quantityOnHand: nextQuantity },
    });

    await prisma.inventoryMovement.create({
      data: {
        variantId,
        movementType: 'ADJUSTMENT',
        quantity: payload.delta,
        reason: payload.reason,
        note: 'Manual stock adjustment.',
      },
    });

    return {
      success: true,
      data: updated,
    };
  });

  app.post('/admin/categories', async (request) => {
    const payload = z.object({
      name: z.string().min(2),
      slug: z.string().min(2).optional(),
      description: z.string().optional(),
      parentId: z.string().optional(),
    }).parse(request.body);

    const category = await prisma.category.create({
      data: {
        name: payload.name,
        slug: payload.slug ?? generateSlug(payload.name),
        description: payload.description,
        parentId: payload.parentId ?? null,
      },
    });

    return { success: true, data: category };
  });

  app.post('/admin/collections', async (request) => {
    const payload = z.object({
      name: z.string().min(2),
      slug: z.string().min(2).optional(),
      description: z.string().optional(),
      status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
    }).parse(request.body);

    const collection = await prisma.collection.create({
      data: {
        name: payload.name,
        slug: payload.slug ?? generateSlug(payload.name),
        description: payload.description,
        status: payload.status,
      },
    });

    return { success: true, data: collection };
  });
}
