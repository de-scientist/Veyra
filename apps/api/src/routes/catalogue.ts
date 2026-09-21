import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

import { generateSlug, validateCatalogProduct } from '../lib/catalog.js';
import { validateAuditReason, validateInventoryAdjustment, validateRestockQuantity } from '../lib/admin.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { requireOperationsAccess } from '../middleware/operations.js';

const productSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().min(12).max(10000),
  categoryId: z.string().optional(),
  slug: z.string().min(2).max(220).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

const productUpdateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  description: z.string().min(12).max(10000).optional(),
  categoryId: z.string().nullable().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

const variantSchema = z.object({
  sku: z.string().min(3).max(64),
  name: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).default('ACTIVE'),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).optional(),
  barcode: z.string().max(64).optional(),
  weight: z.number().min(0).optional(),
  attributeValues: z.array(z.object({
    attributeId: z.string(),
    value: z.string().min(1).max(120),
  })).default([]),
});

const variantUpdateSchema = z.object({
  name: z.string().max(200).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  price: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).nullable().optional(),
});

const restockSchema = z.object({
  quantity: z.number().int().min(1).max(100000),
  lowStockThreshold: z.number().int().min(0).max(100000).optional(),
  reason: z.string().min(3).max(200).default('RESTOCK'),
});

const adjustSchema = z.object({
  delta: z.number().int().min(-100000).max(100000).refine((v) => v !== 0, 'Adjustment delta cannot be zero.'),
  reason: z.string().min(3).max(200),
});

const categorySchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140).optional(),
  description: z.string().max(2000).optional(),
  parentId: z.string().nullable().optional(),
});

const collectionSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(140).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

const attributeSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.string().min(2).max(40).default('STRING'),
});

const attributeValueSchema = z.object({
  value: z.string().min(1).max(120),
});

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

function conflict(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new HttpError(409, 'ALREADY_EXISTS', 'A record with these unique details already exists.');
  }
  throw error;
}

export async function catalogueRoutes(app: FastifyInstance) {
  // Public storefront catalogue lives in routes/storefront.ts (Phase E).
  // This module owns admin catalogue management + inventory operations.

  // ---- Admin product management (operations staff only) ----

  app.get('/admin/products', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
      categoryId: z.string().optional(),
    }).parse(request.query);
    const where: Prisma.ProductWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.search) where.OR = [{ name: { contains: query.search, mode: 'insensitive' } }, { slug: { contains: query.search, mode: 'insensitive' } }];
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true, slug: true } }, variants: { select: { id: true, sku: true, status: true, priceOverride: true } }, _count: { select: { variants: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    return { success: true, data: { products, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } } };
  });

  app.post('/admin/products', { preHandler: requireOperationsAccess }, async (request) => {
    const payload = productSchema.parse(request.body);
    const safeSlug = payload.slug ? generateSlug(payload.slug) : generateSlug(payload.name);
    try {
      const product = await prisma.product.create({
        data: {
          name: payload.name.trim(),
          slug: safeSlug,
          description: payload.description.trim(),
          categoryId: payload.categoryId,
          status: payload.status,
        },
      });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'PRODUCT_CREATED', entity: 'Product', entityId: product.id, ...auditMeta(request) } });
      return { success: true, data: product };
    } catch (error) {
      conflict(error);
    }
  });

  app.patch('/admin/products/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = productUpdateSchema.parse(request.body);
    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    try {
      const product = await prisma.product.update({
        where: { id },
        data: {
          name: payload.name?.trim(),
          description: payload.description?.trim(),
          categoryId: payload.categoryId === null ? null : payload.categoryId,
          status: payload.status,
        },
      });
      await prisma.auditLog.create({
        data: {
          actorId: actorId(request),
          action: payload.status === 'ARCHIVED' && existing.status !== 'ARCHIVED' ? 'PRODUCT_ARCHIVED' : 'PRODUCT_UPDATED',
          entity: 'Product',
          entityId: id,
          before: { status: existing.status } as Prisma.InputJsonValue,
          after: { status: product.status } as Prisma.InputJsonValue,
          ...auditMeta(request),
        },
      });
      return { success: true, data: product };
    } catch (error) {
      conflict(error);
    }
  });

  app.post('/admin/products/:productId/variants', { preHandler: requireOperationsAccess }, async (request) => {
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

    try {
      const variant = await prisma.$transaction(async (client) => {
        const created = await client.productVariant.create({
          data: {
            productId,
            sku: payload.sku.trim(),
            name: payload.name?.trim() ?? payload.sku.trim(),
            status: payload.status,
            priceOverride: payload.price,
            compareAtPrice: payload.compareAtPrice ?? null,
            isDefault: false,
          },
        });
        await client.inventory.create({ data: { variantId: created.id, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: 5 } });
        return created;
      });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'VARIANT_UPDATED', entity: 'ProductVariant', entityId: variant.id, after: { sku: variant.sku } as Prisma.InputJsonValue, ...auditMeta(request) } });
      return { success: true, data: variant };
    } catch (error) {
      conflict(error);
    }
  });

  app.patch('/admin/products/:productId/variants/:variantId', { preHandler: requireOperationsAccess }, async (request) => {
    const { productId, variantId } = request.params as { productId: string; variantId: string };
    const payload = variantUpdateSchema.parse(request.body);
    const existing = await prisma.productVariant.findFirst({ where: { id: variantId, productId } });
    if (!existing) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Product variant not found.');
    const priceChanged = payload.price !== undefined && Number(existing.priceOverride ?? 0) !== payload.price;
    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: { name: payload.name?.trim(), status: payload.status, priceOverride: payload.price, compareAtPrice: payload.compareAtPrice === null ? null : payload.compareAtPrice },
    });
    await prisma.auditLog.create({
      data: {
        actorId: actorId(request),
        action: priceChanged ? 'PRICE_CHANGED' : 'VARIANT_UPDATED',
        entity: 'ProductVariant',
        entityId: variantId,
        before: { price: Number(existing.priceOverride ?? 0), status: existing.status } as Prisma.InputJsonValue,
        after: { price: Number(variant.priceOverride ?? 0), status: variant.status } as Prisma.InputJsonValue,
        ...auditMeta(request),
      },
    });
    return { success: true, data: variant };
  });

  // ---- Admin inventory operations (operations staff only) ----

  app.get('/admin/inventory', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      lowStock: z.coerce.boolean().optional(),
      outOfStock: z.coerce.boolean().optional(),
    }).parse(request.query);
    const where: Prisma.InventoryWhereInput = {};
    if (query.search) where.variant = { OR: [{ sku: { contains: query.search, mode: 'insensitive' } }, { product: { name: { contains: query.search, mode: 'insensitive' } } }] };
    const rows = await prisma.inventory.findMany({
      where,
      include: { variant: { include: { product: { select: { id: true, name: true, slug: true, status: true } } } } },
      orderBy: { updatedAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.lowStock || query.outOfStock ? 200 : query.pageSize,
    });
    const withAvailability = rows.map((row) => ({ ...row, availableQuantity: row.quantityOnHand - row.quantityReserved }));
    const filtered = withAvailability.filter((row) => {
      if (query.outOfStock) return row.availableQuantity <= 0;
      if (query.lowStock) return row.availableQuantity > 0 && row.availableQuantity <= row.lowStockThreshold;
      return true;
    });
    return { success: true, data: { inventory: filtered, pagination: { page: query.page, pageSize: query.pageSize, total: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / query.pageSize)) } } };
  });

  app.get('/admin/inventory/movements', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      movementType: z.string().max(20).optional(),
      variantId: z.string().optional(),
    }).parse(request.query);
    const where: Prisma.InventoryMovementWhereInput = {};
    if (query.movementType) where.movementType = query.movementType as Prisma.EnumInventoryMovementTypeFilter['equals'];
    if (query.variantId) where.variantId = query.variantId;
    if (query.search) where.OR = [{ reason: { contains: query.search, mode: 'insensitive' } }, { referenceId: { contains: query.search } }];
    const [movements, total] = await Promise.all([
      prisma.inventoryMovement.findMany({ where, include: { variant: { select: { id: true, sku: true, product: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.inventoryMovement.count({ where }),
    ]);
    return { success: true, data: { movements, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } } };
  });

  app.get('/admin/inventory/reservations', { preHandler: requireOperationsAccess }, async (request) => {
    const query = paginationSchema.extend({
      status: z.enum(['ACTIVE', 'CONVERTED', 'RELEASED', 'EXPIRED']).optional(),
    }).parse(request.query);
    const where: Prisma.InventoryReservationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.OR = [{ orderId: { contains: query.search } }, { variant: { sku: { contains: query.search, mode: 'insensitive' } } }];
    const [reservations, total] = await Promise.all([
      prisma.inventoryReservation.findMany({ where, include: { variant: { select: { id: true, sku: true } }, order: { select: { id: true, orderNumber: true } } }, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.inventoryReservation.count({ where }),
    ]);
    return { success: true, data: { reservations, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) } } };
  });

  app.post('/admin/inventory/:variantId/restock', { preHandler: requireOperationsAccess }, async (request) => {
    const { variantId } = request.params as { variantId: string };
    const payload = restockSchema.parse(request.body);
    validateRestockQuantity(payload.quantity);
    const reason = validateAuditReason(payload.reason);
    const actor = actorId(request);
    const updated = await prisma.$transaction(async (client) => {
      const inventory = await client.inventory.findUnique({ where: { variantId } });
      if (!inventory) throw new HttpError(404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
      const result = await client.inventory.update({
        where: { variantId },
        data: {
          quantityOnHand: { increment: payload.quantity },
          lowStockThreshold: payload.lowStockThreshold ?? inventory.lowStockThreshold,
        },
      });
      await client.inventoryMovement.create({
        data: { variantId, movementType: 'IN', quantity: payload.quantity, reason: reason.slice(0, 120), note: 'Restocked via admin inventory action.', actorId: actor },
      });
      return result;
    });
    await prisma.auditLog.create({ data: { actorId: actor, action: 'INVENTORY_ADJUSTED', entity: 'Inventory', entityId: variantId, after: { operation: 'RESTOCK', quantity: payload.quantity } as Prisma.InputJsonValue, ...auditMeta(request) } });
    return { success: true, data: updated };
  });

  app.post('/admin/inventory/:variantId/adjust', { preHandler: requireOperationsAccess }, async (request) => {
    const { variantId } = request.params as { variantId: string };
    const payload = adjustSchema.parse(request.body);
    const actor = actorId(request);
    const updated = await prisma.$transaction(async (client) => {
      const inventory = await client.inventory.findUnique({ where: { variantId } });
      if (!inventory) throw new HttpError(404, 'INVENTORY_NOT_FOUND', 'Inventory record not found.');
      const nextQuantity = validateInventoryAdjustment(inventory.quantityOnHand, inventory.quantityReserved, payload.delta);
      const reason = validateAuditReason(payload.reason);
      const result = await client.inventory.update({ where: { variantId }, data: { quantityOnHand: nextQuantity } });
      await client.inventoryMovement.create({
        data: { variantId, movementType: 'ADJUSTMENT', quantity: payload.delta, reason: reason.slice(0, 120), note: 'Manual stock adjustment.', actorId: actor },
      });
      return result;
    });
    await prisma.auditLog.create({ data: { actorId: actor, action: 'INVENTORY_ADJUSTED', entity: 'Inventory', entityId: variantId, after: { operation: 'ADJUST', delta: payload.delta, reason: payload.reason } as Prisma.InputJsonValue, ...auditMeta(request) } });
    return { success: true, data: updated };
  });

  // ---- Categories / collections / attributes (operations staff only) ----

  app.get('/admin/categories', { preHandler: requireOperationsAccess }, async () => {
    const categories = await prisma.category.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    return { success: true, data: categories };
  });

  app.post('/admin/categories', { preHandler: requireOperationsAccess }, async (request) => {
    const payload = categorySchema.parse(request.body);
    if (payload.parentId) {
      const parent = await prisma.category.findUnique({ where: { id: payload.parentId } });
      if (!parent) throw new HttpError(404, 'PARENT_CATEGORY_NOT_FOUND', 'Parent category not found.');
    }
    try {
      const category = await prisma.category.create({
        data: { name: payload.name.trim(), slug: generateSlug(payload.slug ?? payload.name), description: payload.description?.trim(), parentId: payload.parentId ?? null },
      });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'CATEGORY_CREATED', entity: 'Category', entityId: category.id, ...auditMeta(request) } });
      return { success: true, data: category };
    } catch (error) {
      conflict(error);
    }
  });

  app.patch('/admin/categories/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = categorySchema.partial().parse(request.body);
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
    if (payload.parentId) {
      if (payload.parentId === id) throw new HttpError(400, 'INVALID_HIERARCHY', 'A category cannot be its own parent.');
      const parent = await prisma.category.findUnique({ where: { id: payload.parentId } });
      if (!parent) throw new HttpError(404, 'PARENT_CATEGORY_NOT_FOUND', 'Parent category not found.');
    }
    try {
      const category = await prisma.category.update({ where: { id }, data: { name: payload.name?.trim(), slug: payload.slug ? generateSlug(payload.slug) : undefined, description: payload.description?.trim(), parentId: payload.parentId === null ? null : payload.parentId } });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'CATEGORY_UPDATED', entity: 'Category', entityId: id, ...auditMeta(request) } });
      return { success: true, data: category };
    } catch (error) {
      conflict(error);
    }
  });

  app.get('/admin/collections', { preHandler: requireOperationsAccess }, async () => {
    const collections = await prisma.collection.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: 'asc' } });
    return { success: true, data: collections };
  });

  app.post('/admin/collections', { preHandler: requireOperationsAccess }, async (request) => {
    const payload = collectionSchema.parse(request.body);
    try {
      const collection = await prisma.collection.create({
        data: { name: payload.name.trim(), slug: generateSlug(payload.slug ?? payload.name), description: payload.description?.trim(), status: payload.status },
      });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'COLLECTION_CREATED', entity: 'Collection', entityId: collection.id, ...auditMeta(request) } });
      return { success: true, data: collection };
    } catch (error) {
      conflict(error);
    }
  });

  app.patch('/admin/collections/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = collectionSchema.partial().parse(request.body);
    const existing = await prisma.collection.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'COLLECTION_NOT_FOUND', 'Collection not found.');
    try {
      const collection = await prisma.collection.update({ where: { id }, data: { name: payload.name?.trim(), slug: payload.slug ? generateSlug(payload.slug) : undefined, description: payload.description?.trim(), status: payload.status } });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'COLLECTION_UPDATED', entity: 'Collection', entityId: id, ...auditMeta(request) } });
      return { success: true, data: collection };
    } catch (error) {
      conflict(error);
    }
  });

  app.get('/admin/attributes', { preHandler: requireOperationsAccess }, async () => {
    const attributes = await prisma.attribute.findMany({ include: { values: { orderBy: { value: 'asc' } } }, orderBy: { name: 'asc' } });
    return { success: true, data: attributes };
  });

  app.post('/admin/attributes', { preHandler: requireOperationsAccess }, async (request) => {
    const payload = attributeSchema.parse(request.body);
    try {
      const attribute = await prisma.attribute.create({ data: { name: payload.name.trim(), slug: generateSlug(payload.name), type: payload.type.trim().toUpperCase() } });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'ATTRIBUTE_CREATED', entity: 'Attribute', entityId: attribute.id, ...auditMeta(request) } });
      return { success: true, data: attribute };
    } catch (error) {
      conflict(error);
    }
  });

  app.post('/admin/attributes/:id/values', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = attributeValueSchema.parse(request.body);
    const attribute = await prisma.attribute.findUnique({ where: { id } });
    if (!attribute) throw new HttpError(404, 'ATTRIBUTE_NOT_FOUND', 'Attribute not found.');
    try {
      const value = await prisma.attributeValue.create({ data: { attributeId: id, value: payload.value.trim() } });
      await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'ATTRIBUTE_CREATED', entity: 'Attribute', entityId: value.id, ...auditMeta(request) } });
      return { success: true, data: value };
    } catch (error) {
      conflict(error);
    }
  });

  app.patch('/admin/attributes/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const payload = z.object({ name: z.string().min(2).max(120).optional(), type: z.string().min(2).max(40).optional() }).parse(request.body);
    const existing = await prisma.attribute.findUnique({ where: { id } });
    if (!existing) throw new HttpError(404, 'ATTRIBUTE_NOT_FOUND', 'Attribute not found.');
    // Slug is immutable: it anchors variant mappings and public facet keys.
    const attribute = await prisma.attribute.update({
      where: { id },
      data: { name: payload.name?.trim(), type: payload.type?.trim().toUpperCase() },
      include: { values: { orderBy: { value: 'asc' } } },
    });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'ATTRIBUTE_UPDATED', entity: 'Attribute', entityId: id, ...auditMeta(request) } });
    return { success: true, data: attribute };
  });

  app.delete('/admin/attributes/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.attribute.findUnique({ where: { id }, include: { _count: { select: { values: true } } } });
    if (!existing) throw new HttpError(404, 'ATTRIBUTE_NOT_FOUND', 'Attribute not found.');
    const inUse = await prisma.variantAttributeValue.count({ where: { attributeId: id } });
    if (inUse > 0) {
      throw new HttpError(409, 'ATTRIBUTE_IN_USE', 'This attribute is used by product variants and cannot be deleted.');
    }
    await prisma.attribute.delete({ where: { id } });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'ATTRIBUTE_DELETED', entity: 'Attribute', entityId: id, ...auditMeta(request) } });
    return { success: true, data: { deleted: true } };
  });

  app.delete('/admin/attributes/values/:valueId', { preHandler: requireOperationsAccess }, async (request) => {
    const { valueId } = request.params as { valueId: string };
    const existing = await prisma.attributeValue.findUnique({ where: { id: valueId } });
    if (!existing) throw new HttpError(404, 'ATTRIBUTE_VALUE_NOT_FOUND', 'Attribute value not found.');
    const inUse = await prisma.variantAttributeValue.count({ where: { attributeValueId: valueId } });
    if (inUse > 0) {
      throw new HttpError(409, 'ATTRIBUTE_VALUE_IN_USE', 'This value is used by product variants and cannot be deleted.');
    }
    await prisma.attributeValue.delete({ where: { id: valueId } });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'ATTRIBUTE_DELETED', entity: 'AttributeValue', entityId: valueId, ...auditMeta(request) } });
    return { success: true, data: { deleted: true } };
  });

  app.delete('/admin/categories/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { products: true } } },
    });
    if (!existing || existing.deletedAt) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
    if (existing._count.products > 0) {
      throw new HttpError(409, 'CATEGORY_IN_USE', 'This category still has products and cannot be archived.');
    }
    // Archived children do not block their parent.
    const liveChildren = await prisma.category.count({ where: { parentId: id, deletedAt: null } });
    if (liveChildren > 0) {
      throw new HttpError(409, 'CATEGORY_HAS_CHILDREN', 'Move or archive child categories first.');
    }
    const category = await prisma.category.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } });
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'CATEGORY_ARCHIVED', entity: 'Category', entityId: id, ...auditMeta(request) } });
    return { success: true, data: category };
  });

  app.delete('/admin/collections/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.collection.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new HttpError(404, 'COLLECTION_NOT_FOUND', 'Collection not found.');
    await prisma.$transaction([
      prisma.productCollection.deleteMany({ where: { collectionId: id } }),
      prisma.collection.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } }),
    ]);
    await prisma.auditLog.create({ data: { actorId: actorId(request), action: 'COLLECTION_ARCHIVED', entity: 'Collection', entityId: id, ...auditMeta(request) } });
    return { success: true, data: { deleted: true } };
  });
}
