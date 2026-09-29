import { describe, expect, it } from 'vitest';

import {
  buildVariantCombinations,
  defaultSkuTemplate,
  deriveCode,
  deriveStyleCode,
  generateSku,
  normalizeSegment,
  normalizeSku,
  skuConflictFromPrismaTarget,
  validateBarcode,
  validateDictionaryCode,
  validateManualSku,
  validateSkuFormat,
  validateSkuTemplate,
} from './sku.js';

describe('sku normalization', () => {
  it('normalizes names case-insensitively', () => {
    expect(normalizeSegment(' Nike ')).toBe('NIKE');
    expect(normalizeSegment('black')).toBe('BLACK');
    expect(normalizeSegment('10.5')).toBe('105');
    expect(normalizeSku(' nke-sho-am90-blk-42 ')).toBe('NKE-SHO-AM90-BLK-42');
  });

  it('collapses separators and strips invalid characters', () => {
    expect(normalizeSku('NKE__SHO  AM90--BLK')).toBe('NKE-SHO-AM90-BLK');
    expect(normalizeSku('--NKE-SHO--')).toBe('NKE-SHO');
    expect(normalizeSku('nike/shoes!')).toBe('NIKESHOES');
  });

  it('validates manual SKUs within the legacy 3-64 contract', () => {
    expect(validateManualSku('HOD-BLK-M').ok).toBe(true);
    expect(validateManualSku('  hod-blk-m  ')).toEqual({ ok: true, value: 'HOD-BLK-M' });
    const short = validateManualSku('AB');
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors[0]?.code).toBe('INVALID_SKU');
    const dup = validateManualSku('NKE-SHO-AM90-BLK-42');
    expect(dup.ok).toBe(true);
  });

  it('caps generated SKUs at 32 chars', () => {
    const long = validateSkuFormat('ABCDEFGHIJ-KLMNOPQRST-UVWXYZ1234-5678');
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.errors[0]?.code).toBe('INVALID_SKU');
    expect(validateSkuFormat('NKE-SHO-AM90-BLK-42').ok).toBe(true);
  });
});

describe('code dictionaries', () => {
  it('validates dictionary codes per kind', () => {
    expect(validateDictionaryCode('NKE', 'brand')).toEqual({ ok: true, value: 'NKE' });
    expect(validateDictionaryCode(' nke ').ok).toBe(true);
    expect(validateDictionaryCode('TOOLONGCODE', 'brand').ok).toBe(false);
    expect(validateDictionaryCode('TOOLONGCAT', 'category').ok).toBe(false);
    expect(validateDictionaryCode('42', 'size')).toEqual({ ok: true, value: '42' });
    expect(validateDictionaryCode('AM90', 'style')).toEqual({ ok: true, value: 'AM90' });
  });

  it('derives deterministic collision-free codes', () => {
    expect(deriveCode('Nike')).toBe('NIK');
    expect(deriveCode('Black')).toBe('BLA');
    // Collision within scope extends deterministically, never random.
    expect(deriveCode('Blush', ['BLA'])).toBe('BLUS');
    expect(deriveCode('Blush', ['BLA'])).toBe(deriveCode('Blush', ['BLA']));
    expect(deriveCode('42')).toBe('42');
    expect(deriveCode('One Size')).toBe('ONE');
  });

  it('derives style codes without using the full product name', () => {
    expect(deriveStyleCode('Nike Air Max 90', 'Nike')).toBe('AM90');
    expect(deriveStyleCode('Classic Black Hoodie')).toBe('CBH');
    expect(deriveStyleCode('Air Max 90')).toBe('AM90');
  });

  it('validates barcodes separately from SKUs', () => {
    expect(validateBarcode('6001234567890').ok).toBe(true);
    expect(validateBarcode('SHORT').ok).toBe(false);
  });
});

describe('sku templates', () => {
  it('accepts known tokens and rejects unknown/duplicate tokens', () => {
    expect(validateSkuTemplate('{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}').ok).toBe(true);
    const unknown = validateSkuTemplate('{BRAND}-{FOO}');
    expect(unknown.ok).toBe(false);
    const dup = validateSkuTemplate('{BRAND}-{STYLE}-{MODEL}');
    expect(dup.ok).toBe(false);
  });

  it('picks category-aware defaults', () => {
    expect(defaultSkuTemplate('sneakers')).toBe('{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}');
    expect(defaultSkuTemplate('kitchen-appliances')).toBe('{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}');
    expect(defaultSkuTemplate('cookware')).toBe('{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}');
  });
});

describe('sku generation', () => {
  it('generates the canonical shoe SKU deterministically', () => {
    const first = generateSku({
      brandCode: 'NKE',
      categoryCode: 'SHO',
      styleCode: 'AM90',
      attributeSegments: { COLOR: 'BLK', SIZE: '42' },
    });
    const second = generateSku({
      brandCode: ' nike ',
      categoryCode: 'sho',
      styleCode: 'am90',
      attributeSegments: { COLOR: ' black ', SIZE: '42' },
    });
    expect(first).toEqual({ ok: true, value: 'NKE-SHO-AM90-BLK-42' });
    expect(second).toEqual(first);
  });

  it('supports clothing, appliance and utensil templates', () => {
    const clothing = generateSku({
      brandCode: 'NKE',
      categoryCode: 'TSH',
      styleCode: 'AM01',
      attributeSegments: { COLOR: 'BLK', SIZE: 'M' },
    });
    expect(clothing).toEqual({ ok: true, value: 'NKE-TSH-AM01-BLK-M' });

    const appliance = generateSku({
      brandCode: 'SAM',
      categoryCode: 'BLD',
      styleCode: 'BL500',
      attributeSegments: { POWER: '1500W', COLOR: 'BLK' },
      template: '{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}',
    });
    expect(appliance).toEqual({ ok: true, value: 'SAM-BLD-BL500-1500W-BLK' });

    const utensil = generateSku({
      brandCode: 'GEN',
      categoryCode: 'UTN',
      styleCode: 'KN01',
      attributeSegments: { MATERIAL: 'SS', PACK: '6PC' },
      template: '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}',
    });
    expect(utensil).toEqual({ ok: true, value: 'GEN-UTN-KN01-SS-6PC' });
  });

  it('rejects missing components with actionable codes', () => {
    const missing = generateSku({ brandCode: '', categoryCode: 'SHO', styleCode: 'AM90', attributeSegments: {} });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors[0]?.code).toBe('MISSING_SKU_COMPONENT');

    const gap = generateSku({
      brandCode: 'NKE',
      categoryCode: 'SHO',
      styleCode: 'AM90',
      attributeSegments: { COLOR: 'BLK' },
    });
    expect(gap.ok).toBe(false);
    if (!gap.ok) expect(gap.errors[0]?.code).toBe('MISSING_SKU_COMPONENT');
  });
});

describe('variant combinations', () => {
  it('computes cartesian products (3 colors x 4 sizes = 12)', () => {
    const combos = buildVariantCombinations({
      color: ['c-black', 'c-white', 'c-red'],
      size: ['s-s', 's-m', 's-l', 's-xl'],
    });
    expect(combos).toHaveLength(12);
    expect(combos[0]).toEqual(['c-black', 's-s']);
    expect(combos[11]).toEqual(['c-red', 's-xl']);
  });

  it('supports single-axis and empty inputs', () => {
    expect(buildVariantCombinations({})).toEqual([]);
    expect(buildVariantCombinations({ power: ['p-500w', 'p-1500w'] })).toEqual([['p-500w'], ['p-1500w']]);
  });
});

describe('conflict mapping', () => {
  it('maps P2002 targets to actionable error codes', () => {
    expect(skuConflictFromPrismaTarget(['sku'])?.code).toBe('SKU_ALREADY_EXISTS');
    expect(skuConflictFromPrismaTarget(['barcode'])?.code).toBe('BARCODE_ALREADY_EXISTS');
    expect(skuConflictFromPrismaTarget(['other']) ?? null).toBeNull();
  });
});
