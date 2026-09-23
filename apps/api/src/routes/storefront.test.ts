import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `store-${Date.now().toString(36)}`;
const ids = { products: [] as string[], variants: [] as string[], categories: [] as string[], collections: [] as string[], attributes: [] as string[] };

async function seed() {
  const fashion = await prisma.category.create({ data: { name: `Fashion ${stamp}`, slug: `fashion-${stamp}`, status: 'ACTIVE' } });
  const sneakers = await prisma.category.create({
    data: { name: `Sneakers ${stamp}`, slug: `sneakers-${stamp}`, status: 'ACTIVE', parentId: fashion.id },
  });
  ids.categories.push(fashion.id, sneakers.id);

  const color = await prisma.attribute.create({ data: { name: `Color ${stamp}`, slug: `color-${stamp}`, type: 'STRING' } });
  const red = await prisma.attributeValue.create({ data: { attributeId: color.id, value: 'Red' } });
  const blue = await prisma.attributeValue.create({ data: { attributeId: color.id, value: 'Blue' } });
  ids.attributes.push(color.id);

  const product = await prisma.product.create({
    data: {
      name: `Runner ${stamp}`,
      slug: `runner-${stamp}`,
      description: 'A lightweight running shoe for daily training.',
      status: 'ACTIVE',
      basePrice: 5000,
      categoryId: sneakers.id,
    },
  });
  ids.products.push(product.id);
  const v1 = await prisma.productVariant.create({
    data: { productId: product.id, sku: `RUN-RED-${stamp}`, name: 'Red', status: 'ACTIVE', priceOverride: 5000, compareAtPrice: 6000 },
  });
  const v2 = await prisma.productVariant.create({
    data: { productId: product.id, sku: `RUN-BLU-${stamp}`, name: 'Blue', status: 'ACTIVE', priceOverride: 4500 },
  });
  ids.variants.push(v1.id, v2.id);
  await prisma.inventory.createMany({
    data: [
      { variantId: v1.id, quantityOnHand: 10, quantityReserved: 0, lowStockThreshold: 2 },
      { variantId: v2.id, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: 2 },
    ],
  });
  await prisma.variantAttributeValue.createMany({
    data: [
      { variantId: v1.id, attributeId: color.id, attributeValueId: red.id },
      { variantId: v2.id, attributeId: color.id, attributeValueId: blue.id },
    ],
  });
  await prisma.productImage.create({
    data: { productId: product.id, url: 'https://images.unsplash.com/photo-x', altText: 'Runner', isPrimary: true, sortOrder: 0 },
  });

  const draft = await prisma.product.create({
    data: { name: `Draft ${stamp}`, slug: `draft-${stamp}`, description: 'Invisible draft product.', status: 'DRAFT' },
  });
  ids.products.push(draft.id);

  // Reuse the merchandising seed's `featured` collection when present
  // (the seed owns that slug); only delete it in cleanup if we created it.
  const existing = await prisma.collection.findUnique({ where: { slug: 'featured' } });
  const featured =
    existing ??
    (await prisma.collection.create({
      data: { name: `Featured ${stamp}`, slug: 'featured', description: 'Featured picks.', status: 'ACTIVE' },
    }));
  if (!existing) ids.collections.push(featured.id);
  await prisma.productCollection.create({ data: { productId: product.id, collectionId: featured.id } });
}

beforeAll(async () => {
  app = await buildApp();
  await seed();
}, 60000);

afterAll(async () => {
  await prisma.productImage.deleteMany({ where: { productId: { in: ids.products } } });
  await prisma.productCollection.deleteMany({ where: { productId: { in: ids.products } } });
  await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: ids.variants } } });
  await prisma.inventory.deleteMany({ where: { variantId: { in: ids.variants } } });
  await prisma.productVariant.deleteMany({ where: { id: { in: ids.variants } } });
  await prisma.attributeValue.deleteMany({ where: { attributeId: { in: ids.attributes } } });
  await prisma.attribute.deleteMany({ where: { id: { in: ids.attributes } } });
  await prisma.product.deleteMany({ where: { id: { in: ids.products } } });
  await prisma.collection.deleteMany({ where: { id: { in: ids.collections } } });
  await prisma.category.deleteMany({ where: { id: { in: ids.categories } } });
});

describe('public storefront catalogue', () => {
  it('lists categories as a tree with visible counts', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/catalog/categories' });
    expect(response.statusCode).toBe(200);
    const data = (response.json() as { data: Array<{ slug: string; children: Array<{ slug: string; productCount: number }>; productCount: number }> }).data;
    const fashion = data.find((c) => c.slug === `fashion-${stamp}`);
    expect(fashion?.children.map((c) => c.slug)).toContain(`sneakers-${stamp}`);
    expect(fashion?.productCount).toBe(0);
    expect(fashion?.children[0]?.productCount).toBe(1);
  });

  it('discovers active products with facets and pagination', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/catalog/products' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: {
        products: Array<{ slug: string; price: number; featured: boolean; variants: Array<{ inStock: boolean }> }>;
        pagination: { total: number };
        facets: Array<{ attribute: string }>;
      };
    };
    expect(body.data.products.some((p) => p.slug === `runner-${stamp}`)).toBe(true);
    expect(body.data.products.some((p) => p.slug === `draft-${stamp}`)).toBe(false);
    const runner = body.data.products.find((p) => p.slug === `runner-${stamp}`);
    expect(runner?.price).toBe(4500);
    expect(runner?.featured).toBe(true);
  });

  it('searches across names, SKUs, and attribute values', async () => {
    const byName = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?q=Runner` });
    expect((byName.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBeGreaterThanOrEqual(1);
    const bySku = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?q=RUN-BLU-${stamp}` });
    expect((bySku.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBe(1);
    const byAttr = await app.inject({ method: 'GET', url: '/api/v1/catalog/products?q=Blue' });
    expect((byAttr.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('scopes by category including children, and by collection', async () => {
    const category = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?category=fashion-${stamp}` });
    expect((category.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBe(1);
    const missing = await app.inject({ method: 'GET', url: '/api/v1/catalog/products?category=no-such-cat' });
    expect(missing.statusCode).toBe(404);
    const collection = await app.inject({ method: 'GET', url: '/api/v1/catalog/products?collection=featured' });
    expect((collection.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('filters by attributes, price, and stock', async () => {
    const colorName = `Color ${stamp}`;
    const attr = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?${encodeURIComponent(colorName)}=Red` });
    expect((attr.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBe(1);
    // Scoped to the fixture category: the shared dev database may hold
    // unrelated products outside this test's control.
    const scope = `category=fashion-${stamp}`;
    const cheap = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?${scope}&maxPrice=4600` });
    expect((cheap.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBe(1);
    const strict = await app.inject({ method: 'GET', url: `/api/v1/catalog/products?${scope}&maxPrice=1000` });
    expect((strict.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBe(0);
    const stocked = await app.inject({ method: 'GET', url: '/api/v1/catalog/products?inStock=true' });
    expect((stocked.json() as { data: { pagination: { total: number } } }).data.pagination.total).toBeGreaterThanOrEqual(1);
  });

  it('resolves product detail by slug and id, hiding drafts', async () => {
    const bySlug = await app.inject({ method: 'GET', url: `/api/v1/catalog/products/runner-${stamp}` });
    expect(bySlug.statusCode).toBe(200);
    const detail = (bySlug.json() as { data: { variants: Array<{ sku: string; availableQuantity: number }>; rating: { count: number } } }).data;
    expect(detail.variants).toHaveLength(2);
    const draft = await app.inject({ method: 'GET', url: `/api/v1/catalog/products/draft-${stamp}` });
    expect(draft.statusCode).toBe(404);
    const missing = await app.inject({ method: 'GET', url: '/api/v1/catalog/products/no-such-product' });
    expect(missing.statusCode).toBe(404);
  });

  it('suggests products and categories without short queries', async () => {
    const short = await app.inject({ method: 'GET', url: '/api/v1/catalog/suggest?q=x' });
    expect((short.json() as { data: unknown[] }).data).toEqual([]);
    const match = await app.inject({ method: 'GET', url: '/api/v1/catalog/suggest?q=Runner' });
    const data = (match.json() as { data: Array<{ type: string; href: string }> }).data;
    expect(data.some((s) => s.type === 'product' && s.href === `/products/runner-${stamp}`)).toBe(true);
  });

  it('exposes collections with counts', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/catalog/collections' });
    expect(response.statusCode).toBe(200);
    const data = (response.json() as { data: Array<{ slug: string; productCount: number }> }).data;
    expect(data.find((c) => c.slug === 'featured')?.productCount).toBeGreaterThanOrEqual(1);
  });
});
