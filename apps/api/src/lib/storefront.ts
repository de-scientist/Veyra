import { Prisma } from '@prisma/client';

import { HttpError } from './errors.js';
import { prisma } from './prisma.js';

/**
 * Public storefront catalogue service (Phase E). Only ACTIVE, non-deleted
 * records are ever exposed here. Pricing derives from variant overrides
 * (fallback: basePrice); availability from inventory (onHand − reserved).
 */

export const DISCOVERY_PAGE_SIZE = 12;
export const DISCOVERY_MAX_PAGE_SIZE = 48;
export const NEW_ARRIVAL_DAYS = 30;
export const FEATURED_COLLECTION_SLUG = 'featured';

export type StorefrontCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  productCount: number;
  children: StorefrontCategory[];
};

export type StorefrontCollection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount: number;
  coverImage: string | null;
};

export type StorefrontVariant = {
  id: string;
  sku: string;
  name: string | null;
  price: number;
  compareAtPrice: number | null;
  attributes: Record<string, string>;
  availableQuantity: number;
  inStock: boolean;
};

export type StorefrontProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string | null;
  brand: string | null;
  category: { id: string; name: string; slug: string; parentId: string | null } | null;
  /** Top-level ancestor slug (department pillar) or own slug when top-level. */
  department: string | null;
  featured: boolean;
  /** Derived: created within NEW_ARRIVAL_DAYS. Documented, not a stored flag. */
  newArrival: boolean;
  price: number;
  compareAtPrice: number | null;
  images: Array<{ url: string; altText: string | null }>;
  variants: StorefrontVariant[];
  rating: { average: number | null; count: number };
  createdAt: Date;
};

export type DiscoveryFacet = {
  attribute: string;
  values: Array<{ value: string; count: number }>;
};

export type PriceBucket = { label: string; min: number; max: number | null };

type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const productInclude = {
  category: true,
  variants: {
    where: { status: 'ACTIVE' as const },
    include: {
      inventory: true,
      variantAttributeValues: { include: { attribute: true, attributeValue: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
  collections: { include: { collection: true } },
  reviews: { where: { status: 'APPROVED' }, select: { rating: true } },
} satisfies Prisma.ProductInclude;

function shortDescriptionOf(description: string | null, name: string): string {
  const text = (description ?? '').trim();
  if (!text) return name;
  return text.length > 140 ? `${text.slice(0, 137).trimEnd()}…` : text;
}

export function serializeStorefrontProduct(row: ProductRow, categoryPath: Map<string, string | null>): StorefrontProduct {
  const variants: StorefrontVariant[] = row.variants.map((variant) => {
    const attributes: Record<string, string> = {};
    for (const mapping of variant.variantAttributeValues) {
      attributes[mapping.attribute.name] = mapping.attributeValue.value;
    }
    const availableQuantity = (variant.inventory?.quantityOnHand ?? 0) - (variant.inventory?.quantityReserved ?? 0);
    return {
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price: Number(variant.priceOverride ?? row.basePrice ?? 0),
      compareAtPrice: variant.compareAtPrice === null ? null : Number(variant.compareAtPrice),
      attributes,
      availableQuantity,
      inStock: availableQuantity > 0,
    };
  });

  const prices = variants.map((v) => v.price);
  const minPrice = prices.length ? Math.min(...prices) : Number(row.basePrice ?? 0);
  const cheapest = variants.find((v) => v.price === minPrice) ?? null;
  const brand =
    variants.map((v) => v.attributes['Brand']).find((b): b is string => typeof b === 'string' && b.length > 0) ?? null;

  const ratings = row.reviews.map((r) => r.rating);
  const images = row.images.map((image) => ({ url: image.secureUrl ?? image.url, altText: image.altText }));

  // Department pillar = top-level ancestor slug (precomputed by the caller).
  const department = row.category ? (categoryPath.get(row.category.id) ?? row.category.slug) : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: shortDescriptionOf(row.description, row.name),
    description: row.description,
    brand,
    category: row.category
      ? { id: row.category.id, name: row.category.name, slug: row.category.slug, parentId: row.category.parentId }
      : null,
    department,
    featured: row.collections.some((entry) => entry.collection.slug === FEATURED_COLLECTION_SLUG),
    newArrival: Date.now() - row.createdAt.getTime() < NEW_ARRIVAL_DAYS * 24 * 3600 * 1000,
    price: minPrice,
    compareAtPrice: cheapest?.compareAtPrice ?? null,
    images,
    variants,
    rating: {
      average: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
      count: ratings.length,
    },
    createdAt: row.createdAt,
  };
}

/** Resolve a category slug to itself + all descendants (for scoped discovery). */
export async function resolveCategoryScope(slug: string): Promise<string[] | null> {
  const root = await prisma.category.findUnique({ where: { slug } });
  if (!root || root.deletedAt || root.status !== 'ACTIVE') return null;
  const all = await prisma.category.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true, parentId: true } });
  const childrenOf = new Map<string, string[]>();
  for (const row of all) {
    if (!row.parentId) continue;
    const list = childrenOf.get(row.parentId) ?? [];
    list.push(row.id);
    childrenOf.set(row.parentId, list);
  }
  const ids = new Set<string>([root.id]);
  const queue = [root.id];
  while (queue.length) {
    const current = queue.pop() as string;
    for (const child of childrenOf.get(current) ?? []) {
      if (!ids.has(child)) {
        ids.add(child);
        queue.push(child);
      }
    }
  }
  return [...ids];
}

/**
 * Map every category id → its department pillar (top-level ancestor slug).
 * A top-level category is its own pillar. Guards against hierarchy cycles.
 */
export async function departmentPillars(): Promise<Map<string, string | null>> {
  const rows = await prisma.category.findMany({ select: { id: true, slug: true, parentId: true } });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const memo = new Map<string, string | null>();
  const resolve = (id: string, seen: Set<string>): string | null => {
    if (memo.has(id)) return memo.get(id) ?? null;
    const node = byId.get(id);
    if (!node) return null;
    if (!node.parentId || seen.has(id)) {
      memo.set(id, node.slug);
      return node.slug;
    }
    seen.add(id);
    const top = resolve(node.parentId, seen) ?? node.slug;
    memo.set(id, top);
    return top;
  };
  for (const row of rows) resolve(row.id, new Set());
  return memo;
}

/** Top-level ancestor slug for a single category id (department pillar). */
export async function departmentOfCategory(categoryId: string | null): Promise<string | null> {
  if (!categoryId) return null;
  return (await departmentPillars()).get(categoryId) ?? null;
}

export async function getPublicCategories(): Promise<StorefrontCategory[]> {
  const rows = await prisma.category.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    select: { id: true, name: true, slug: true, description: true, parentId: true, _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
  // Product counts restricted to visible products.
  const visible = await prisma.product.groupBy({
    by: ['categoryId'],
    where: { status: 'ACTIVE', deletedAt: null, categoryId: { not: null } },
    _count: { categoryId: true },
  });
  const counts = new Map(visible.map((row) => [row.categoryId as string, row._count.categoryId]));
  const byId = new Map(
    rows.map((row) => [row.id, { ...row, productCount: counts.get(row.id) ?? 0, children: [] as StorefrontCategory[] }] as const),
  );
  const roots: StorefrontCategory[] = [];
  for (const row of byId.values()) {
    const node: StorefrontCategory = {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      parentId: row.parentId,
      productCount: row.productCount,
      children: row.children,
    };
    if (row.parentId && byId.has(row.parentId)) {
      byId.get(row.parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export async function getPublicCollections(): Promise<StorefrontCollection[]> {
  const rows = await prisma.collection.findMany({
    where: { status: 'ACTIVE', deletedAt: null },
    include: {
      products: {
        include: {
          product: {
            select: {
              status: true,
              deletedAt: true,
              images: { select: { secureUrl: true, url: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 1 },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => {
    const visible = row.products.filter((entry) => entry.product.status === 'ACTIVE' && !entry.product.deletedAt);
    const firstImage = visible[0]?.product.images[0] ?? null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      productCount: visible.length,
      coverImage: firstImage ? (firstImage.secureUrl ?? firstImage.url) : null,
    };
  });
}

export type DiscoveryParams = {
  q?: string;
  category?: string;
  collection?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'name' | 'newest';
  page?: number;
  pageSize?: number;
  attrs?: Record<string, string[]>;
  maxPrice?: number;
  inStockOnly?: boolean;
};

function tokenConditions(tokens: string[]): Prisma.ProductWhereInput[] {
  return tokens.map((token) => ({
    OR: [
      { name: { contains: token, mode: 'insensitive' as const } },
      { description: { contains: token, mode: 'insensitive' as const } },
      { category: { name: { contains: token, mode: 'insensitive' as const } } },
      { variants: { some: { sku: { contains: token, mode: 'insensitive' as const } } } },
      {
        variants: {
          some: {
            variantAttributeValues: {
              some: { attributeValue: { value: { contains: token, mode: 'insensitive' as const } } },
            },
          },
        },
      },
    ],
  }));
}

export async function discoverProducts(params: DiscoveryParams): Promise<{
  products: StorefrontProduct[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: DiscoveryFacet[];
  priceBuckets: PriceBucket[];
}> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(DISCOVERY_MAX_PAGE_SIZE, Math.max(1, params.pageSize ?? DISCOVERY_PAGE_SIZE));

  const where: Prisma.ProductWhereInput = { status: 'ACTIVE', deletedAt: null };
  if (params.q?.trim()) {
    const tokens = params.q.trim().split(/\s+/).slice(0, 8);
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...tokenConditions(tokens)];
  }
  if (params.category) {
    const scope = await resolveCategoryScope(params.category);
    if (!scope) throw new HttpError(404, 'CATEGORY_NOT_FOUND', 'Category not found.');
    where.categoryId = { in: scope };
  }
  if (params.collection) {
    const collection = await prisma.collection.findUnique({ where: { slug: params.collection } });
    if (!collection || collection.deletedAt || collection.status !== 'ACTIVE') {
      throw new HttpError(404, 'COLLECTION_NOT_FOUND', 'Collection not found.');
    }
    where.collections = { some: { collectionId: collection.id } };
  }

  // Scope query (before attr/price/stock filters) drives facets + buckets.
  const scoped = await prisma.product.findMany({
    where,
    include: productInclude,
    orderBy: { createdAt: 'desc' },
    take: 2000,
  });

  // Facets: attributes present in scope with ≥2 values (Brand excluded).
  const counts = new Map<string, Map<string, Set<string>>>();
  for (const row of scoped) {
    for (const variant of row.variants) {
      for (const mapping of variant.variantAttributeValues) {
        const name = mapping.attribute.name;
        if (name === 'Brand') continue;
        if (!counts.has(name)) counts.set(name, new Map());
        const bucket = counts.get(name) as Map<string, Set<string>>;
        if (!bucket.has(mapping.attributeValue.value)) bucket.set(mapping.attributeValue.value, new Set());
        bucket.get(mapping.attributeValue.value)?.add(row.id);
      }
    }
  }
  const order = ['Color', 'Size', 'Shoe Size', 'Capacity', 'Power', 'Material', 'Style', 'Gender'];
  const facets: DiscoveryFacet[] = [...counts.entries()]
    .filter(([, bucket]) => bucket.size >= 2)
    .map(([attribute, bucket]) => ({
      attribute,
      values: [...bucket.entries()]
        .map(([value, ids]) => ({ value, count: ids.size }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    }))
    .sort((a, b) => {
      const ia = order.indexOf(a.attribute);
      const ib = order.indexOf(b.attribute);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

  const pillars = await departmentPillars();
  const serialize = (row: (typeof scoped)[number]) => serializeStorefrontProduct(row, pillars);
  let filtered = scoped.map(serialize);

  if (params.attrs) {
    for (const [attribute, values] of Object.entries(params.attrs)) {
      if (!values.length) continue;
      filtered = filtered.filter((product) =>
        product.variants.some((variant) => values.includes(variant.attributes[attribute] ?? '')),
      );
    }
  }
  const maxPrice = params.maxPrice;
  if (maxPrice !== undefined) filtered = filtered.filter((product) => product.price <= maxPrice);
  if (params.inStockOnly) filtered = filtered.filter((product) => product.variants.some((variant) => variant.inStock));

  switch (params.sort) {
    case 'price-asc':
      filtered.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      filtered.sort((a, b) => b.price - a.price);
      break;
    case 'name':
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'newest':
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      break;
    default:
      filtered.sort(
        (a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.getTime() - a.createdAt.getTime(),
      );
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    products: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    pagination: { page: safePage, pageSize, total: filtered.length, totalPages },
    facets,
    priceBuckets: derivePriceBuckets(filtered.map((p) => p.price)),
  };
}

export function derivePriceBuckets(prices: number[]): PriceBucket[] {
  if (prices.length < 2) return [];
  const sorted = [...prices].sort((a, b) => a - b);
  const min = sorted[0] as number;
  const max = sorted[sorted.length - 1] as number;
  if (max - min < 1000) return [];
  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
  const t1 = min + (max - min) / 3;
  const t2 = min + ((max - min) * 2) / 3;
  return [
    { label: `Under ${fmt(t1)}`, min, max: Math.floor(t1) },
    { label: `${fmt(t1)} – ${fmt(t2)}`, min: Math.ceil(t1), max: Math.floor(t2) },
    { label: `Above ${fmt(t2)}`, min: Math.ceil(t2), max: null },
  ];
}

export async function getPublicProduct(idOrSlug: string): Promise<StorefrontProduct> {
  const row = await prisma.product.findFirst({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      OR: [{ id: idOrSlug }, { slug: idOrSlug }],
    },
    include: productInclude,
  });
  if (!row) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  return serializeStorefrontProduct(row, await departmentPillars());
}

export async function suggestCatalog(q: string): Promise<Array<{ type: 'product' | 'category' | 'collection'; label: string; href: string }>> {
  const normalized = q.trim();
  if (normalized.length < 2) return [];
  const suggestions: Array<{ type: 'product' | 'category' | 'collection'; label: string; href: string }> = [];
  const categories = await prisma.category.findMany({
    where: { status: 'ACTIVE', deletedAt: null, name: { contains: normalized, mode: 'insensitive' } },
    select: { name: true, slug: true },
    take: 3,
  });
  for (const category of categories) {
    suggestions.push({ type: 'category', label: category.name, href: `/categories/${category.slug}` });
  }
  const collections = await prisma.collection.findMany({
    where: { status: 'ACTIVE', deletedAt: null, name: { contains: normalized, mode: 'insensitive' } },
    select: { name: true, slug: true },
    take: 2,
  });
  for (const collection of collections) {
    suggestions.push({ type: 'collection', label: collection.name, href: `/collections/${collection.slug}` });
  }
  const products = await prisma.product.findMany({
    where: { status: 'ACTIVE', deletedAt: null, name: { contains: normalized, mode: 'insensitive' } },
    select: { name: true, slug: true },
    take: 4,
  });
  for (const product of products) {
    suggestions.push({ type: 'product', label: product.name, href: `/products/${product.slug}` });
  }
  return suggestions.slice(0, 8);
}
