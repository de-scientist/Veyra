import { describe, expect, it } from 'vitest';

import { firstVariantSchema, productDraftSchema, publishChecklist, slugify } from './product-publish';

describe('product creation validation (frontend mirror of backend rules)', () => {
  it('slugifies like the backend generator', () => {
    expect(slugify('  Blue Denim Jacket!! ')).toBe('blue-denim-jacket');
    expect(slugify('Kitchen & Home')).toBe('kitchen-home');
  });

  it('requires name, description, and category for a draft', () => {
    const bad = productDraftSchema.safeParse({ name: 'A', description: 'short', categoryId: '', status: 'DRAFT' });
    expect(bad.success).toBe(false);
    const ok = productDraftSchema.safeParse({
      name: 'Blue Denim Jacket',
      description: 'A sturdy everyday denim jacket.',
      categoryId: 'cat-1',
      status: 'DRAFT',
    });
    expect(ok.success).toBe(true);
  });

  it('requires an attribute value on every variant', () => {
    const bad = firstVariantSchema.safeParse({ sku: 'SKU-1', price: 1500, attributeId: '', attributeValue: '' });
    expect(bad.success).toBe(false);
    const ok = firstVariantSchema.safeParse({
      sku: 'SKU-1',
      price: 1500,
      attributeId: 'attr-1',
      attributeValue: 'Large',
    });
    expect(ok.success).toBe(true);
  });

  it('checklist blocks publish until a variant and an image exist', () => {
    const base = { name: 'Blue Denim Jacket', slug: 'blue-denim-jacket', categoryId: 'cat-1', description: 'A sturdy everyday denim jacket.' };
    expect(publishChecklist({ ...base, variantCount: 0, imageCount: 0 }).filter((c) => !c.ok).length).toBeGreaterThan(0);
    expect(publishChecklist({ ...base, variantCount: 1, imageCount: 1 }).every((c) => c.ok)).toBe(true);
  });
});
