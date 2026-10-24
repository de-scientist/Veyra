import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@prisma/client';

import { main } from '../../../../prisma/seed.catalogue.ts';
import { prisma } from '../lib/prisma.js';

const stamp = `sc-${Date.now().toString(36)}`;

function uniqueSlug(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function uniqueCode(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function seedExistingProductInventory() {
  // Pre-create a category, product, variant and inventory with production-like
  // values matching one of the seed SKUs, then assert the seed preserves them.
  await prisma.productVariant.deleteMany({ where: { sku: 'HOD-BLK-M' } });
  await prisma.product.deleteMany({ where: { slug: 'classic-black-hoodie' } });

  const category = await prisma.category.create({
    data: {
      name: 'Test Men',
      slug: uniqueSlug(`${stamp}-men`),
      description: 'test',
      status: 'ACTIVE',
      code: uniqueCode('TST'),
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
    data: { name: 'Existing Coll', slug: uniqueSlug(`${stamp}-coll`), description: 'test', status: 'ACTIVE' },
  });
  await prisma.productCollection.create({
    data: { productId: product.id, collectionId: collection.id },
  });

  return { product, variant, inventory, image, collection };
}

async function cleanup(ids: { product?: { id: string } | string; category?: { id: string } | string; collection?: { id: string } | string }) {
  const productId = typeof ids.product === 'string' ? ids.product : ids.product?.id;
  if (productId) {
    await prisma.productCollection.deleteMany({ where: { productId } });
    await prisma.productImage.deleteMany({ where: { productId } });
    await prisma.variantAttributeValue.deleteMany({
      where: { variant: { productId } },
    });
    await prisma.inventory.deleteMany({ where: { variant: { productId } } });
    await prisma.productVariant.deleteMany({ where: { productId } });
    await prisma.product.delete({ where: { id: productId } });
  }
  const categoryId = typeof ids.category === 'string' ? ids.category : ids.category?.id;
  if (categoryId) {
    await prisma.category.delete({ where: { id: categoryId } });
  }
  const collectionId = typeof ids.collection === 'string' ? ids.collection : ids.collection?.id;
  if (collectionId) {
    await prisma.collection.delete({ where: { id: collectionId } });
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
    await prisma.productVariant.deleteMany({ where: { sku: 'HOD-BLK-M' } });
    await prisma.product.deleteMany({ where: { OR: [{ slug: { startsWith: stamp } }, { slug: 'classic-black-hoodie' }] } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: stamp } } });
    await prisma.collection.deleteMany({ where: { slug: { startsWith: stamp } } });
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
      data: { name: 'D', slug: uniqueSlug(`${stamp}-d`), description: 'd', status: 'ACTIVE', code: uniqueCode('DD'), skuTemplate: 't' },
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
      data: { name: 'V', slug: uniqueSlug(`${stamp}-v`), description: 'v', status: 'ACTIVE', code: uniqueCode('VV'), skuTemplate: 't' },
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

  it('does not initialize inventory for a non-seeded product variant', async () => {
    const category = await prisma.category.create({
      data: { name: 'N', slug: uniqueSlug(`${stamp}-n`), description: 'n', status: 'ACTIVE', code: uniqueCode('NN'), skuTemplate: 't' },
    });
    const product = await prisma.product.create({
      data: { name: 'New', slug: `${stamp}-new`, description: 'n', status: 'ACTIVE', basePrice: 1, categoryId: category.id },
    });
    const newSku = `${stamp}-new-sku`;
    await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: newSku,
        name: 'Fresh variant',
        status: 'ACTIVE',
        priceOverride: 1500,
      },
    });

    await main({ db: prisma, dryRun: false });
    const variant = await prisma.productVariant.findFirst({
      where: { productId: product.id, sku: newSku },
      include: { inventory: true },
    });
    expect(variant).not.toBeNull();
    expect(variant?.inventory).toBeNull();
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
    const src = readFileSync(new URL('../../../../prisma/seed.catalogue.ts', import.meta.url), 'utf8');
    expect(src).not.toContain('seed.rbac');
    expect(src).not.toContain('rbac');
  });
});
