import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@prisma/client';

import { main } from '../../../prisma/seed.catalogue.js';
import { prisma } from '../lib/prisma.js';

const stamp = `sc-${Date.now().toString(36)}`;

function testDb(client: PrismaClient) {
  return client;
}

async function seedExistingProductInventory() {
  // Pre-create a category, product, variant and inventory with production-like
  // values matching one of the seed SKUs, then assert the seed preserves them.
  const category = await prisma.category.create({
    data: {
      name: 'Test Men',
      slug: `${stamp}-men`,
      description: 'test',
      status: 'ACTIVE',
      code: 'TST',
      skuTemplate: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
    },
  });

  const product = await prisma.product.create({
    data: {
      name: 'Existing Hoodie',
      slug: 'classic-black-hoodie',
      description: 'existing',
      status: 'ACTIVE',
      basePrice: 9999,
      categoryId: category.id,
      styleCode: 'HOD',
    },
  });

  const variant = await prisma.productVariant.create({
    data: {
      productId: product.id,
      sku: 'HOD-BLK-M',
      name: 'Existing Black / M',
      status: 'ACTIVE',
      priceOverride: 9999,
      compareAtPrice: null,
    },
  });

  const inventory = await prisma.inventory.create({
    data: {
      variantId: variant.id,
      quantityOnHand: 100,
      quantityReserved: 7,
      lowStockThreshold: 5,
    },
  });

  const image = await prisma.productImage.create({
    data: {
      productId: product.id,
      url: 'https://cloudinary.example.com/existing.jpg',
      altText: 'Existing alt',
      isPrimary: true,
      sortOrder: 0,
    },
  });

  const collection = await prisma.collection.create({
    data: { name: 'Existing Coll', slug: `${stamp}-coll`, description: 'test', status: 'ACTIVE' },
  });
  await prisma.productCollection.create({
    data: { productId: product.id, collectionId: collection.id },
  });

  return { product, variant, inventory, image, collection };
}

async function cleanup(ids: { product?: string; category?: string; collection?: string }) {
  if (ids.product) {
    await prisma.productCollection.deleteMany({ where: { productId: ids.product } });
    await prisma.productImage.deleteMany({ where: { productId: ids.product } });
    await prisma.variantAttributeValue.deleteMany({
      where: { variant: { productId: ids.product } },
    });
    await prisma.inventory.deleteMany({ where: { variant: { productId: ids.product } } });
    await prisma.productVariant.deleteMany({ where: { productId: ids.product } });
    await prisma.product.delete({ where: { id: ids.product } });
  }
  if (ids.category) {
    await prisma.category.delete({ where: { id: ids.category } });
  }
  if (ids.collection) {
    await prisma.collection.delete({ where: { id: ids.collection } });
  }
}

describe('catalogue seed safety', () => {
  beforeAll(async () => {
    // Ensure canonical seed attributes/values exist so variant mappings resolve.
    await prisma.attribute.upsert({
      where: { slug: 'color' },
      update: {},
      create: { name: 'Color', slug: 'color', type: 'STRING' },
    });
    await prisma.attributeValue.upsert({
      where: { attributeId_value: { attributeId: (await prisma.attribute.findUnique({ where: { slug: 'color' } }))!.id, value: 'Black' } },
      update: {},
      create: { attributeId: (await prisma.attribute.findUnique({ where: { slug: 'color' } }))!.id, value: 'Black', code: 'BLK' },
    });
  });

  afterAll(async () => {
    await prisma.category.deleteMany({ where: { slug: { startsWith: stamp } } });
    await prisma.collection.deleteMany({ where: { slug: { startsWith: stamp } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: stamp } } });
  });

  it('preserves existing inventory quantityOnHand on rerun', async () => {
    const { product } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      const inv = await prisma.inventory.findFirst({
        where: { variant: { productId: product.id, sku: 'HOD-BLK-M' } },
      });
      expect(inv?.quantityOnHand).toBe(100);
    } finally {
      await cleanup({ product });
    }
  });

  it('preserves existing quantityReserved on rerun', async () => {
    const { product } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      const inv = await prisma.inventory.findFirst({
        where: { variant: { productId: product.id, sku: 'HOD-BLK-M' } },
      });
      expect(inv?.quantityReserved).toBe(7);
    } finally {
      await cleanup({ product });
    }
  });

  it('preserves existing lowStockThreshold on rerun', async () => {
    const { product } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      const inv = await prisma.inventory.findFirst({
        where: { variant: { productId: product.id, sku: 'HOD-BLK-M' } },
      });
      expect(inv?.lowStockThreshold).toBe(5);
    } finally {
      await cleanup({ product });
    }
  });

  it('does not delete or replace existing product images on rerun', async () => {
    const { product, image } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      const images = await prisma.productImage.findMany({ where: { productId: product.id } });
      expect(images.length).toBe(1);
      expect(images[0].url).toBe(image.url);
      expect(images[0].altText).toBe('Existing alt');
      expect(images[0].isPrimary).toBe(true);
    } finally {
      await cleanup({ product });
    }
  });

  it('does not delete existing collection memberships on rerun', async () => {
    const { product, collection } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      const memberships = await prisma.productCollection.findMany({ where: { productId: product.id } });
      expect(memberships.map((m) => m.collectionId).sort()).toContain(collection.id);
    } finally {
      await cleanup({ product, collection: collection.id });
    }
  });

  it('fails safely when a seed SKU is owned by a different product', async () => {
    const otherProduct = await prisma.product.create({
      data: { name: 'Other', slug: `${stamp}-other`, description: 'o', status: 'ACTIVE', basePrice: 1, styleCode: 'XX' },
    });
    await prisma.productVariant.create({
      data: { productId: otherProduct.id, sku: 'HOD-BLK-M', name: 'Other variant', status: 'ACTIVE', priceOverride: 1 },
    });
    let threw = false;
    try {
      await main({ db: prisma, dryRun: false });
    } catch (e) {
      threw = true;
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg).toContain('SKU ownership conflict');
      expect(msg).not.toContain(otherProduct.id);
    }
    expect(threw).toBe(true);
    // The conflicting variant must not have been reassigned to the seeded product.
    const variant = await prisma.productVariant.findUnique({ where: { sku: 'HOD-BLK-M' } });
    expect(variant?.productId).toBe(otherProduct.id);
    await prisma.productVariant.delete({ where: { sku: 'HOD-BLK-M' } });
    await prisma.product.delete({ where: { id: otherProduct.id } });
  });

  it('does not reactivate a soft-deleted product', async () => {
    const category = await prisma.category.create({
      data: { name: 'D', slug: `${stamp}-d`, description: 'd', status: 'ACTIVE', code: 'DD', skuTemplate: 't' },
    });
    const product = await prisma.product.create({
      data: { name: 'Deleted', slug: `${stamp}-deleted`, description: 'd', status: 'ARCHIVED', basePrice: 1, categoryId: category.id, deletedAt: new Date() },
    });
    await main({ db: prisma, dryRun: false });
    const fresh = await prisma.product.findUnique({ where: { id: product.id } });
    expect(fresh?.status).toBe('ARCHIVED');
    expect(fresh?.deletedAt).not.toBeNull();
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  it('does not reactivate an archived variant', async () => {
    const category = await prisma.category.create({
      data: { name: 'V', slug: `${stamp}-v`, description: 'v', status: 'ACTIVE', code: 'VV', skuTemplate: 't' },
    });
    const product = await prisma.product.create({
      data: { name: 'P', slug: `${stamp}-p`, description: 'p', status: 'ACTIVE', basePrice: 1, categoryId: category.id },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, sku: `${stamp}-sku`, name: 'Archived', status: 'ARCHIVED', priceOverride: 1, archivedAt: new Date(), deletedAt: new Date() },
    });
    await main({ db: prisma, dryRun: false });
    const fresh = await prisma.productVariant.findUnique({ where: { id: variant.id } });
    expect(fresh?.status).toBe('ARCHIVED');
    expect(fresh?.archivedAt).not.toBeNull();
    await prisma.productVariant.delete({ where: { id: variant.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  it('initializes inventory only for a brand-new variant', async () => {
    const category = await prisma.category.create({
      data: { name: 'N', slug: `${stamp}-n`, description: 'n', status: 'ACTIVE', code: 'NN', skuTemplate: 't' },
    });
    const product = await prisma.product.create({
      data: { name: 'New', slug: `${stamp}-new`, description: 'n', status: 'ACTIVE', basePrice: 1, categoryId: category.id },
    });
    await main({ db: prisma, dryRun: false });
    const variant = await prisma.productVariant.findFirst({
      where: { productId: product.id, sku: 'HOD-BLK-M' },
      include: { inventory: true },
    });
    expect(variant).not.toBeNull();
    expect(variant?.inventory?.quantityOnHand).toBe(12);
    expect(variant?.inventory?.quantityReserved).toBe(0);
    await prisma.inventory.delete({ where: { variantId: variant!.id } });
    await prisma.productVariant.delete({ where: { id: variant!.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.category.delete({ where: { id: category.id } });
  });

  it('does not create duplicate inventory for an existing variant', async () => {
    const { product } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      await main({ db: prisma, dryRun: false });
      const count = await prisma.inventory.count({ where: { variant: { productId: product.id } } });
      expect(count).toBe(1);
    } finally {
      await cleanup({ product });
    }
  });

  it('does not create duplicate collection memberships on repeated runs', async () => {
    const { product, collection } = await seedExistingProductInventory();
    try {
      await main({ db: prisma, dryRun: false });
      await main({ db: prisma, dryRun: false });
      const count = await prisma.productCollection.count({ where: { productId: product.id } });
      expect(count).toBe(1);
    } finally {
      await cleanup({ product, collection: collection.id });
    }
  });

  it('dry-run reports counts without writing', async () => {
    const { product } = await seedExistingProductInventory();
    try {
      const result = await main({ db: prisma, dryRun: true });
      expect(result).toBeUndefined();
      const inv = await prisma.inventory.findFirst({
        where: { variant: { productId: product.id, sku: 'HOD-BLK-M' } },
      });
      expect(inv?.quantityOnHand).toBe(100); // unchanged by dry-run
    } finally {
      await cleanup({ product });
    }
  });

  it('seed never imports or invokes the RBAC seed', () => {
    const src = require('fs').readFileSync(require.resolve('../../../prisma/seed.catalogue.ts'), 'utf8');
    expect(src).not.toContain('seed.rbac');
    expect(src).not.toContain('rbac');
  });
});
