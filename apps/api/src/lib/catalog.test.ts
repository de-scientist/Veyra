import { describe, expect, it } from 'vitest';

import {
  calculateAvailableQuantity,
  generateSlug,
  isLowStock,
  validateCatalogProduct,
  validateInventoryAdjustment,
  validateVariantCombination,
} from './catalog.js';

describe('catalogue rules', () => {
  it('creates stable slugs and validates publish readiness', () => {
    expect(generateSlug('Classic Black Hoodie')).toBe('classic-black-hoodie');

    const result = validateCatalogProduct({
      name: 'Classic Black Hoodie',
      slug: 'classic-black-hoodie',
      categoryId: 'cat-1',
      description: 'A premium hoodie',
      variants: [
        {
          sku: 'HOD-BLK-M',
          price: 2500,
          status: 'ACTIVE',
          attributeValues: [{ attributeId: 'color', value: 'Black' }],
        },
      ],
      images: [{ url: 'https://cdn.example.com/hoodie.jpg', altText: 'Classic black hoodie' }],
    });

    expect(result.ok).toBe(true);
  });

  it('rejects incomplete products before publish', () => {
    const result = validateCatalogProduct({
      name: '',
      slug: 'bad-product',
      categoryId: '',
      description: '',
      variants: [],
      images: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain('Product name is required.');
    }
  });

  it('calculates available stock and low stock state', () => {
    expect(calculateAvailableQuantity(12, 3)).toBe(9);
    expect(isLowStock(3, 5)).toBe(true);
    expect(isLowStock(8, 5)).toBe(false);
  });

  it('validates inventory adjustments and variant attribute uniqueness', () => {
    expect(validateInventoryAdjustment(10, 5)).toEqual({ ok: true, newQuantity: 15 });
    expect(validateInventoryAdjustment(-2, 1)).toMatchObject({ ok: false });

    const duplicateError = validateVariantCombination(
      [
        { attributeId: 'color', value: 'Black' },
        { attributeId: 'color', value: 'Black' },
      ],
      'product-1',
    );

    expect(duplicateError.ok).toBe(false);
  });
});
