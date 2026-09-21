import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import {
  DISCOVERY_MAX_PAGE_SIZE,
  DISCOVERY_PAGE_SIZE,
  discoverProducts,
  getPublicCategories,
  getPublicCollections,
  getPublicProduct,
  suggestCatalog,
  type DiscoveryParams,
} from '../lib/storefront.js';
import { requireOperationsAccess } from '../middleware/auth.js';

const KNOWN_DISCOVERY_KEYS = new Set(['q', 'category', 'collection', 'sort', 'page', 'pageSize', 'maxPrice', 'inStock']);

const discoveryQuerySchema = z.object({
  q: z.string().max(120).optional(),
  category: z.string().max(140).optional(),
  collection: z.string().max(140).optional(),
  sort: z.enum(['featured', 'price-asc', 'price-desc', 'name', 'newest']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional(),
  pageSize: z.coerce.number().int().min(1).max(DISCOVERY_MAX_PAGE_SIZE).optional(),
  maxPrice: z.coerce.number().min(0).max(100_000_000).optional(),
  inStock: z.string().max(5).optional(),
}).catchall(z.union([z.string().max(400), z.array(z.string().max(400)).max(20)]));

function toStringArray(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value : [value];
  return raw.flatMap((entry) => entry.split(',')).map((entry) => entry.trim()).filter(Boolean).slice(0, 20);
}

/**
 * Public storefront catalogue (Phase E). All responses contain ACTIVE,
 * non-deleted records only. Decimal prices serialize as numbers.
 */
export async function storefrontRoutes(app: FastifyInstance) {
  app.get('/catalog/categories', async () => {
    return { success: true, data: await getPublicCategories() };
  });

  app.get('/catalog/collections', async () => {
    return { success: true, data: await getPublicCollections() };
  });

  app.get('/catalog/products', async (request) => {
    const parsed = discoveryQuerySchema.parse(request.query);
    const attrs: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (KNOWN_DISCOVERY_KEYS.has(key) || value === undefined) continue;
      const values = toStringArray(value as string | string[]);
      if (values.length) attrs[key] = values;
    }
    const params: DiscoveryParams = {
      q: parsed.q,
      category: parsed.category,
      collection: parsed.collection,
      sort: parsed.sort,
      page: parsed.page,
      pageSize: parsed.pageSize,
      attrs: Object.keys(attrs).length ? attrs : undefined,
      maxPrice: parsed.maxPrice,
      inStockOnly: parsed.inStock === 'true' ? true : undefined,
    };
    const result = await discoverProducts(params);
    return { success: true, data: result };
  });

  app.get('/catalog/products/:idOrSlug', async (request) => {
    const { idOrSlug } = request.params as { idOrSlug: string };
    if (!idOrSlug || idOrSlug.length > 220) {
      throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    }
    return { success: true, data: await getPublicProduct(idOrSlug) };
  });

  app.get('/catalog/suggest', async (request) => {
    const query = z.object({ q: z.string().max(120).default('') }).parse(request.query);
    return { success: true, data: await suggestCatalog(query.q) };
  });

  // Admin product detail for the editor (operations). The public detail
  // route above is ACTIVE-only, so editors use this for DRAFT/ARCHIVED work.
  app.get('/admin/products/:id', { preHandler: requireOperationsAccess }, async (request) => {
    const { id } = request.params as { id: string };
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: {
          include: {
            inventory: true,
            variantAttributeValues: { include: { attribute: true, attributeValue: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        images: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        collections: { include: { collection: { select: { id: true, name: true, slug: true } } } },
      },
    });
    if (!product) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    return { success: true, data: product };
  });
}
