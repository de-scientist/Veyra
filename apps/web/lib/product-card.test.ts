import { describe, expect, it } from 'vitest';

import type { Product } from './catalog';
import {
  cardBadge,
  cardColors,
  lowStockQuantity,
  quickAddVariant,
  ratingAccessibleLabel,
  ratingSummary,
  starFillPercent,
  variantHint,
} from './product-card';

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    slug: 'classic-sneakers',
    name: 'Classic Sneakers',
    shortDescription: 'Everyday sneakers',
    description: 'Everyday sneakers',
    department: 'footwear',
    category: 'sneakers',
    categoryName: 'Sneakers',
    brand: 'JB Mercantile',
    featured: false,
    newArrival: false,
    status: 'ACTIVE',
    price: 4999,
    images: ['https://example.com/a.jpg'],
    variants: [
      { id: 'v1', sku: 'SNK-1', name: 'SNK-1', price: 4999, attributes: {}, inStock: true, availableQuantity: 12 },
    ],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('cardBadge', () => {
  it('prioritizes out-of-stock over sale and new', () => {
    const product = makeProduct({
      compareAtPrice: 6499,
      newArrival: true,
      variants: [{ id: 'v1', sku: 'S', name: 'S', price: 4999, attributes: {}, inStock: false }],
    });
    expect(cardBadge(product)).toBe('out');
  });

  it('shows sale from authoritative compare-at pricing', () => {
    expect(cardBadge(makeProduct({ compareAtPrice: 6499 }))).toBe('sale');
  });

  it('shows low-stock for scarce in-stock products', () => {
    const product = makeProduct({
      variants: [{ id: 'v1', sku: 'S', name: 'S', price: 4999, attributes: {}, inStock: true, availableQuantity: 3 }],
    });
    expect(cardBadge(product)).toBe('low');
  });

  it('prioritizes sale over low-stock scarcity', () => {
    const product = makeProduct({
      compareAtPrice: 6499,
      variants: [{ id: 'v1', sku: 'S', name: 'S', price: 4999, attributes: {}, inStock: true, availableQuantity: 2 }],
    });
    expect(cardBadge(product)).toBe('sale');
  });

  it('shows new only when in stock, undiscounted, healthy, and flagged', () => {
    expect(cardBadge(makeProduct({ newArrival: true }))).toBe('new');
  });

  it('shows no badge for plain in-stock products', () => {
    expect(cardBadge(makeProduct())).toBeNull();
  });

  it('never fabricates sale from equal prices', () => {
    expect(cardBadge(makeProduct({ compareAtPrice: 4999 }))).toBeNull();
  });
});

describe('quickAddVariant', () => {
  it('targets the single in-stock variant', () => {
    const product = makeProduct();
    expect(quickAddVariant(product)?.id).toBe('v1');
  });

  it('refuses multi-variant products (choose options instead)', () => {
    const product = makeProduct({
      variants: [
        { id: 'v1', sku: 'A', name: 'A', price: 4999, attributes: { Size: 'S' }, inStock: true },
        { id: 'v2', sku: 'B', name: 'B', price: 4999, attributes: { Size: 'M' }, inStock: true },
      ],
    });
    expect(quickAddVariant(product)).toBeNull();
  });

  it('refuses out-of-stock single variants', () => {
    const product = makeProduct({
      variants: [{ id: 'v1', sku: 'A', name: 'A', price: 4999, attributes: {}, inStock: false }],
    });
    expect(quickAddVariant(product)).toBeNull();
  });
});

describe('lowStockQuantity', () => {
  it('reports the scarcest sellable quantity', () => {
    const product = makeProduct({
      variants: [
        { id: 'v1', sku: 'A', name: 'A', price: 4999, attributes: {}, inStock: true, availableQuantity: 3 },
        { id: 'v2', sku: 'B', name: 'B', price: 4999, attributes: {}, inStock: true, availableQuantity: 40 },
      ],
    });
    expect(lowStockQuantity(product)).toBe(3);
  });

  it('stays silent for healthy stock or unknown quantities', () => {
    expect(lowStockQuantity(makeProduct())).toBeNull();
    expect(
      lowStockQuantity(
        makeProduct({ variants: [{ id: 'v1', sku: 'A', name: 'A', price: 1, attributes: {}, inStock: true }] }),
      ),
    ).toBeNull();
  });
});

describe('cardColors', () => {
  it('collects distinct real color values', () => {
    const product = makeProduct({
      variants: [
        { id: 'v1', sku: 'A', name: 'A', price: 1, attributes: { Color: 'Black' }, inStock: true },
        { id: 'v2', sku: 'B', name: 'B', price: 1, attributes: { Color: 'Black' }, inStock: true },
        { id: 'v3', sku: 'C', name: 'C', price: 1, attributes: { Color: 'White' }, inStock: false },
      ],
    });
    expect(cardColors(product)).toEqual(['Black', 'White']);
  });

  it('returns empty when products have no color attribute', () => {
    expect(cardColors(makeProduct())).toEqual([]);
  });
});

describe('variantHint', () => {
  it('summarizes multi-value attributes generically', () => {
    const product = makeProduct({
      variants: [
        { id: 'v1', sku: 'A', name: 'A', price: 1, attributes: { Color: 'Black', Size: 'S' }, inStock: true },
        { id: 'v2', sku: 'B', name: 'B', price: 1, attributes: { Color: 'Blue', Size: 'M' }, inStock: true },
        { id: 'v3', sku: 'C', name: 'C', price: 1, attributes: { Color: 'Grey', Size: 'M' }, inStock: true },
      ],
    });
    expect(variantHint(product)).toBe('3 colours · 2 sizes');
  });

  it('maps appliance attributes without clothing assumptions', () => {
    const product = makeProduct({
      variants: [
        { id: 'v1', sku: 'A', name: 'A', price: 1, attributes: { Capacity: '1.5L' }, inStock: true },
        { id: 'v2', sku: 'B', name: 'B', price: 1, attributes: { Capacity: '2L' }, inStock: true },
      ],
    });
    expect(variantHint(product)).toBe('2 capacities');
  });

  it('stays silent when nothing varies', () => {
    expect(variantHint(makeProduct())).toBeNull();
  });
});

describe('ratingSummary', () => {
  it('returns real ratings only', () => {
    expect(ratingSummary(makeProduct({ rating: { average: 4.8, count: 24 } }))).toEqual({ average: 4.8, count: 24 });
  });

  it('hides missing, null-average, and zero-count ratings', () => {
    expect(ratingSummary(makeProduct())).toBeNull();
    expect(ratingSummary(makeProduct({ rating: { average: null, count: 0 } }))).toBeNull();
    expect(ratingSummary(makeProduct({ rating: { average: 4.5, count: 0 } }))).toBeNull();
  });
});

describe('ratingAccessibleLabel', () => {
  it('communicates rating, count, and product without color reliance', () => {
    expect(ratingAccessibleLabel(4.8, 24, 'Blender')).toBe('Rated 4.8 out of 5 from 24 reviews for Blender');
    expect(ratingAccessibleLabel(5, 1, 'Blender')).toContain('1 review for Blender');
  });
});

describe('starFillPercent', () => {
  it('fills full, partial, and empty stars', () => {
    expect(starFillPercent(4.8, 1)).toBe(100);
    expect(starFillPercent(4.8, 5)).toBe(80);
    expect(starFillPercent(2, 4)).toBe(0);
  });
});
