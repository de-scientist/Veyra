import { describe, expect, it } from 'vitest';

import {
  canonicalVariantKey,
  planCombinations,
  planGenerationFromRecords,
  requiredDimensionTokens,
  tokenForAttributeSlug,
  validateAxes,
  type PlanGenerationRecords,
} from './variant-generation.js';

const CLOTHING_TEMPLATE = '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}';

function clothingRecords(): PlanGenerationRecords {
  return {
    productName: 'Nike Air Tee',
    styleCode: 'AM01',
    categorySlug: 't-shirts',
    categoryCode: 'TSH',
    categoryTemplate: CLOTHING_TEMPLATE,
    attributes: [
      { id: 'attr-brand', name: 'Brand', slug: 'brand' },
      { id: 'attr-color', name: 'Color', slug: 'color' },
      { id: 'attr-size', name: 'Size', slug: 'size' },
      { id: 'attr-fit', name: 'Fit', slug: 'fit' },
    ],
    values: [
      { id: 'val-nike', attributeId: 'attr-brand', value: 'Nike', code: 'NKE' },
      { id: 'val-black', attributeId: 'attr-color', value: 'Black', code: 'BLK' },
      { id: 'val-white', attributeId: 'attr-color', value: 'White', code: 'WHT' },
      { id: 'val-s', attributeId: 'attr-size', value: 'S', code: 'S' },
      { id: 'val-m', attributeId: 'attr-size', value: 'M', code: 'M' },
      { id: 'val-l', attributeId: 'attr-size', value: 'L', code: 'L' },
      { id: 'val-regular', attributeId: 'attr-fit', value: 'Regular', code: 'REG' },
    ],
    existingVariants: [],
  };
}

function issuesOf(fn: () => unknown): Array<{ code: string; message: string }> {
  try {
    fn();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'issues' in error) {
      return (error as { issues: Array<{ code: string; message: string }> }).issues;
    }
    throw error;
  }
  throw new Error('Expected function to throw generation issues.');
}

describe('token mapping', () => {
  it('maps exact and scoped slugs without category hardcoding', () => {
    expect(tokenForAttributeSlug('color')).toBe('COLOR');
    expect(tokenForAttributeSlug('size')).toBe('SIZE');
    expect(tokenForAttributeSlug('shoe-size')).toBe('SIZE');
    expect(tokenForAttributeSlug('capacity')).toBe('CAPACITY');
    expect(tokenForAttributeSlug('voltage')).toBe('VOLTAGE');
    expect(tokenForAttributeSlug('material')).toBe('MATERIAL');
    expect(tokenForAttributeSlug('pack')).toBe('PACK');
    expect(tokenForAttributeSlug('brand')).toBe('BRAND');
    expect(tokenForAttributeSlug('unknown-thing')).toBeNull();
  });

  it('derives required dimensions from the category template', () => {
    expect(requiredDimensionTokens(CLOTHING_TEMPLATE)).toEqual(['COLOR', 'SIZE']);
    expect(requiredDimensionTokens('{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}')).toEqual(['MATERIAL', 'PACK']);
    expect(requiredDimensionTokens('{BRAND}-{CATEGORY}-{STYLE}')).toEqual([]);
  });
});

describe('variant identity', () => {
  it('is order-independent and product-scoped', () => {
    const a = canonicalVariantKey('p1', [
      { attributeId: 'color', attributeValueId: 'black' },
      { attributeId: 'size', attributeValueId: 'm' },
    ]);
    const b = canonicalVariantKey('p1', [
      { attributeId: 'size', attributeValueId: 'm' },
      { attributeId: 'color', attributeValueId: 'black' },
    ]);
    expect(a).toBe(b);
    expect(canonicalVariantKey('p2', [{ attributeId: 'color', attributeValueId: 'black' }])).not.toBe(a);
  });
});

describe('attribute validation', () => {
  it('accepts ids or slugs and resolves values by id or exact value', () => {
    const records = clothingRecords();
    const { axes, singleVariant } = validateAxes(
      { productId: 'p1', attributes: { color: ['Black', 'val-white'], size: ['val-s'] } },
      records,
      CLOTHING_TEMPLATE,
    );
    expect(singleVariant).toBe(false);
    expect(axes.map((axis) => axis.valueIds)).toEqual([['val-black', 'val-white'], ['val-s']]);
  });

  it('deduplicates repeated values before combination math', () => {
    const records = clothingRecords();
    const { axes } = validateAxes(
      { productId: 'p1', attributes: { color: ['val-black', 'Black', 'val-black'], size: ['val-m', 'M'] } },
      records,
      CLOTHING_TEMPLATE,
    );
    expect(axes[0]?.valueIds).toEqual(['val-black']);
    expect(axes[1]?.valueIds).toEqual(['val-m']);
  });

  it('rejects descriptive attributes instead of generating from them', () => {
    const issues = issuesOf(() =>
      validateAxes({ productId: 'p1', attributes: { color: ['val-black'], fit: ['val-regular'] } }, clothingRecords(), CLOTHING_TEMPLATE),
    );
    expect(issues[0]?.code).toBe('ATTRIBUTE_NOT_VARIANT_DEFINING');
  });

  it('rejects unknown attributes, empty values and missing required dimensions', () => {
    expect(issuesOf(() => validateAxes({ productId: 'p1', attributes: { nosuch: ['x'] } }, clothingRecords(), CLOTHING_TEMPLATE))[0]?.code).toBe(
      'ATTRIBUTE_NOT_FOUND',
    );
    expect(
      issuesOf(() => validateAxes({ productId: 'p1', attributes: { color: [] } }, clothingRecords(), CLOTHING_TEMPLATE))[0]?.code,
    ).toBe('ATTRIBUTE_VALUES_REQUIRED');
    expect(
      issuesOf(() => validateAxes({ productId: 'p1', attributes: { color: ['val-black'] } }, clothingRecords(), CLOTHING_TEMPLATE))[0]?.code,
    ).toBe('MISSING_REQUIRED_DIMENSION');
    expect(
      issuesOf(() => validateAxes({ productId: 'p1', attributes: { color: ['Neon'] } }, clothingRecords(), CLOTHING_TEMPLATE))[0]?.code,
    ).toBe('VALUE_NOT_FOUND');
  });

  it('rejects two attributes competing for one SKU segment', () => {
    const records: PlanGenerationRecords = {
      ...clothingRecords(),
      attributes: [...clothingRecords().attributes, { id: 'attr-shoe-size', name: 'Shoe Size', slug: 'shoe-size' }],
      values: [...clothingRecords().values, { id: 'val-42', attributeId: 'attr-shoe-size', value: '42', code: '42' }],
    };
    const issues = issuesOf(() =>
      validateAxes({ productId: 'p1', attributes: { size: ['val-s'], 'shoe-size': ['val-42'] } }, records, CLOTHING_TEMPLATE),
    );
    expect(issues[0]?.code).toBe('AMBIGUOUS_ATTRIBUTE_TOKEN');
  });

  it('requires dictionary codes before SKU generation', () => {
    const records = clothingRecords();
    records.values.push({ id: 'val-codeless', attributeId: 'attr-color', value: 'Mauve', code: null });
    const issues = issuesOf(() =>
      validateAxes({ productId: 'p1', attributes: { color: ['val-codeless'], size: ['val-s'] } }, records, CLOTHING_TEMPLATE),
    );
    expect(issues[0]?.code).toBe('VALUE_MISSING_CODE');
  });
});

describe('combination planning', () => {
  it('computes 2 x 3 = 6 and 2 x 2 x 2 = 8 cartesian products', () => {
    const records = clothingRecords();
    const { axes } = validateAxes(
      { productId: 'p1', attributes: { color: ['val-black', 'val-white'], size: ['val-s', 'val-m', 'val-l'] } },
      records,
      CLOTHING_TEMPLATE,
    );
    expect(planCombinations(axes, undefined, records).combos).toHaveLength(6);

    const three = planCombinations(
      [
        { attributeId: 'a', attributeSlug: 'color', attributeName: 'Color', valueIds: ['c1', 'c2'] },
        { attributeId: 'b', attributeSlug: 'size', attributeName: 'Size', valueIds: ['s1', 's2'] },
        { attributeId: 'c', attributeSlug: 'material', attributeName: 'Material', valueIds: ['m1', 'm2'] },
      ],
      undefined,
      records,
    );
    expect(three.combos).toHaveLength(8);
  });

  it('supports any dimension count, including single-axis and single-variant', () => {
    const records = clothingRecords();
    expect(planCombinations([], undefined, records).combos).toEqual([[]]);
    const { axes } = validateAxes({ productId: 'p1', attributes: { color: ['val-black'], size: ['val-s'] } }, records, CLOTHING_TEMPLATE);
    expect(planCombinations(axes, undefined, records).combos).toEqual([['val-black', 'val-s']]);
  });

  it('restricts to explicit allow-lists and reports the rest as skipped', () => {
    const records = clothingRecords();
    const { axes } = validateAxes(
      { productId: 'p1', attributes: { color: ['val-black', 'val-white'], size: ['val-s', 'val-m'] } },
      records,
      CLOTHING_TEMPLATE,
    );
    const { combos, skippedCombos } = planCombinations(
      axes,
      [
        { color: 'val-black', size: 'val-s' },
        { color: 'White', size: 'M' },
      ],
      records,
    );
    expect(combos).toHaveLength(2);
    expect(skippedCombos).toHaveLength(2);
  });

  it('guards against combinatorial explosions', () => {
    const records = clothingRecords();
    const axes = [
      { attributeId: 'a', attributeSlug: 'color', attributeName: 'Color', valueIds: Array.from({ length: 20 }, (_, i) => `c${i}`) },
      { attributeId: 'b', attributeSlug: 'size', attributeName: 'Size', valueIds: Array.from({ length: 16 }, (_, i) => `s${i}`) },
    ];
    expect(issuesOf(() => planCombinations(axes, undefined, records))[0]?.code).toBe('TOO_MANY_VARIANTS');
  });
});

describe('planned SKU generation', () => {
  it('generates deterministic clothing SKUs (2 colors x 3 sizes)', () => {
    const { planned } = planGenerationFromRecords(
      'prod-1',
      { productId: 'prod-1', attributes: { color: ['Black', 'White'], size: ['S', 'M', 'L'] }, brandValueId: 'val-nike' },
      clothingRecords(),
    );
    expect(planned.map((item) => item.sku)).toEqual([
      'NKE-TSH-AM01-BLK-S',
      'NKE-TSH-AM01-BLK-M',
      'NKE-TSH-AM01-BLK-L',
      'NKE-TSH-AM01-WHT-S',
      'NKE-TSH-AM01-WHT-M',
      'NKE-TSH-AM01-WHT-L',
    ]);
    // Determinism: same inputs always yield the same SKUs and keys.
    const again = planGenerationFromRecords(
      'prod-1',
      { productId: 'prod-1', attributes: { color: ['Black', 'White'], size: ['S', 'M', 'L'] }, brandValueId: 'val-nike' },
      clothingRecords(),
    );
    expect(again.planned.map((item) => `${item.sku}|${item.key}`)).toEqual(planned.map((item) => `${item.sku}|${item.key}`));
  });

  it('resolves numeric shoe sizes through the SIZE segment', () => {
    const records: PlanGenerationRecords = {
      productName: 'Adidas Ultra',
      styleCode: 'ULTRA01',
      categorySlug: 'sneakers',
      categoryCode: 'SNK',
      categoryTemplate: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      attributes: [
        { id: 'attr-brand', name: 'Brand', slug: 'brand' },
        { id: 'attr-color', name: 'Color', slug: 'color' },
        { id: 'attr-shoe-size', name: 'Shoe Size', slug: 'shoe-size' },
      ],
      values: [
        { id: 'val-adidas', attributeId: 'attr-brand', value: 'Adidas', code: 'ADI' },
        { id: 'val-black', attributeId: 'attr-color', value: 'Black', code: 'BLK' },
        { id: 'val-40', attributeId: 'attr-shoe-size', value: '40', code: '40' },
        { id: 'val-41', attributeId: 'attr-shoe-size', value: '41', code: '41' },
      ],
      existingVariants: [],
    };
    const { planned } = planGenerationFromRecords(
      'prod-shoe',
      { productId: 'prod-shoe', attributes: { color: ['Black'], 'shoe-size': ['40', '41'] }, brandCode: 'ADI' },
      records,
    );
    expect(planned.map((item) => item.sku)).toEqual(['ADI-SNK-ULTRA01-BLK-40', 'ADI-SNK-ULTRA01-BLK-41']);
  });

  it('supports appliance (power + color) and utensil (material + pack) templates', () => {
    const appliance: PlanGenerationRecords = {
      productName: 'Savanna Blender',
      styleCode: 'BL500',
      categorySlug: 'kitchen-appliances',
      categoryCode: 'KAP',
      categoryTemplate: '{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}',
      attributes: [
        { id: 'attr-brand', name: 'Brand', slug: 'brand' },
        { id: 'attr-power', name: 'Power', slug: 'power' },
        { id: 'attr-color', name: 'Color', slug: 'color' },
      ],
      values: [
        { id: 'val-jb', attributeId: 'attr-brand', value: 'JB', code: 'JB' },
        { id: 'val-500w', attributeId: 'attr-power', value: '500W', code: '500W' },
        { id: 'val-black', attributeId: 'attr-color', value: 'Black', code: 'BLK' },
        { id: 'val-white', attributeId: 'attr-color', value: 'White', code: 'WHT' },
      ],
      existingVariants: [],
    };
    const { planned } = planGenerationFromRecords(
      'prod-app',
      { productId: 'prod-app', attributes: { power: ['500W'], color: ['Black', 'White'] }, brandCode: 'JB' },
      appliance,
    );
    expect(planned.map((item) => item.sku)).toEqual(['JB-KAP-BL500-500W-BLK', 'JB-KAP-BL500-500W-WHT']);

    const utensil: PlanGenerationRecords = {
      productName: 'Karibu Knife Set',
      styleCode: 'KN01',
      categorySlug: 'cookware',
      categoryCode: 'CKW',
      categoryTemplate: '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}',
      attributes: [
        { id: 'attr-brand', name: 'Brand', slug: 'brand' },
        { id: 'attr-material', name: 'Material', slug: 'material' },
        { id: 'attr-pack', name: 'Pack Size', slug: 'pack' },
      ],
      values: [
        { id: 'val-jb', attributeId: 'attr-brand', value: 'JB', code: 'JB' },
        { id: 'val-steel', attributeId: 'attr-material', value: 'Stainless steel', code: 'SST' },
        { id: 'val-silicone', attributeId: 'attr-material', value: 'Silicone', code: 'SIL' },
        { id: 'val-6pc', attributeId: 'attr-pack', value: '6PC', code: '6PC' },
        { id: 'val-12pc', attributeId: 'attr-pack', value: '12PC', code: '12PC' },
      ],
      existingVariants: [],
    };
    const utensils = planGenerationFromRecords(
      'prod-uten',
      { productId: 'prod-uten', attributes: { material: ['Stainless steel', 'Silicone'], pack: ['6PC', '12PC'] }, brandCode: 'JB' },
      utensil,
    );
    expect(utensils.planned.map((item) => item.sku)).toEqual([
      'JB-CKW-KN01-SST-6PC',
      'JB-CKW-KN01-SST-12PC',
      'JB-CKW-KN01-SIL-6PC',
      'JB-CKW-KN01-SIL-12PC',
    ]);
  });

  it('produces exactly one base-identity SKU when no variant attributes are selected', () => {
    const { planned, singleVariant } = planGenerationFromRecords('prod-spoon', { productId: 'prod-spoon', attributes: {} }, {
      productName: 'Stainless Steel Cooking Spoon',
      styleCode: 'SPOON01',
      categorySlug: 'cookware',
      categoryCode: 'UTN',
      categoryTemplate: '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}',
      attributes: [{ id: 'attr-brand', name: 'Brand', slug: 'brand' }],
      values: [{ id: 'val-gen', attributeId: 'attr-brand', value: 'Generic', code: 'GEN' }],
      existingVariants: [],
    });
    expect(singleVariant).toBe(true);
    expect(planned).toHaveLength(1);
    expect(planned[0]?.sku).toBe('GEN-UTN-SPOON01');
  });

  it('surfaces missing brand and category codes with actionable errors', () => {
    const noBrand = { ...clothingRecords(), values: clothingRecords().values.filter((value) => value.attributeId !== 'attr-brand') };
    expect(
      issuesOf(() => planGenerationFromRecords('p1', { productId: 'p1', attributes: { color: ['Black'], size: ['S'] } }, noBrand))[0]?.code,
    ).toBe('MISSING_SKU_COMPONENT');
    const noCategory = { ...clothingRecords(), categoryCode: null };
    expect(
      issuesOf(() => planGenerationFromRecords('p1', { productId: 'p1', attributes: { color: ['Black'], size: ['S'] }, brandCode: 'NKE' }, noCategory))[0]?.code,
    ).toBe('MISSING_CATEGORY_CODE');
  });
});
