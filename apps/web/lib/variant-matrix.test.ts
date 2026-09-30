import { describe, expect, it } from 'vitest';

import {
  buildAllowList,
  existingVariantRows,
  formatKES,
  matchDimensionAttributes,
  mergePreviewRows,
  parseTemplateTokens,
  requiredDimensionTokens,
  summarizeSelection,
  validatePriceInput,
  validateStockInput,
} from './variant-matrix';

const resolvePair = (attributeName: string, value: string) => ({
  attributeId: `attr-${attributeName.toLowerCase()}`,
  valueId: `val-${value.toLowerCase()}`,
});

describe('template display parsing (never SKU generation)', () => {
  it('extracts required dimensions per category template', () => {
    expect(parseTemplateTokens('{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}')).toEqual(['BRAND', 'CATEGORY', 'STYLE', 'COLOR', 'SIZE']);
    expect(requiredDimensionTokens('{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}')).toEqual(['COLOR', 'SIZE']);
    expect(requiredDimensionTokens('{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}')).toEqual(['MATERIAL', 'PACK']);
    expect(requiredDimensionTokens('{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}')).toEqual(['POWER', 'COLOR']);
    expect(requiredDimensionTokens('{BRAND}-{CATEGORY}-{STYLE}')).toEqual([]);
  });

  it('matches attributes to dimensions without category hardcoding', () => {
    const clothing = matchDimensionAttributes(
      [
        { id: 'c', name: 'Color', slug: 'color' },
        { id: 's', name: 'Size', slug: 'size' },
        { id: 'f', name: 'Fit', slug: 'fit' },
        { id: 'b', name: 'Brand', slug: 'brand' },
      ],
      '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
    );
    expect(clothing.dimensions.map((d) => d.token)).toEqual(['COLOR', 'SIZE']);
    expect(clothing.descriptive.map((a) => a.name)).toEqual(['Fit']);
    expect(clothing.identity.map((a) => a.name)).toEqual(['Brand']);

    const shoes = matchDimensionAttributes(
      [
        { id: 'c', name: 'Color', slug: 'color' },
        { id: 'ss', name: 'Shoe Size', slug: 'shoe-size' },
      ],
      '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
    );
    expect(shoes.dimensions.find((d) => d.attribute.slug === 'shoe-size')?.token).toBe('SIZE');

    const utensil = matchDimensionAttributes(
      [
        { id: 'm', name: 'Material', slug: 'material' },
        { id: 'p', name: 'Pack Size', slug: 'pack' },
      ],
      '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}',
    );
    expect(utensil.dimensions.map((d) => d.token)).toEqual(['MATERIAL', 'PACK']);
  });
});

describe('selection summary', () => {
  it('describes clothing, shoes, appliance and utensil selections', () => {
    expect(summarizeSelection([{ name: 'Colors', count: 2 }, { name: 'Sizes', count: 3 }])).toEqual({ label: '2 Colors × 3 Sizes', total: 6 });
    expect(summarizeSelection([{ name: 'Colors', count: 2 }, { name: 'Sizes', count: 4 }]).total).toBe(8);
    expect(summarizeSelection([{ name: 'Powers', count: 2 }, { name: 'Colors', count: 2 }]).total).toBe(4);
    expect(summarizeSelection([{ name: 'Materials', count: 2 }, { name: 'Packs', count: 2 }]).total).toBe(4);
    expect(summarizeSelection([])).toEqual({ label: expect.stringContaining('Single variant'), total: 1 });
  });
});

describe('price and stock validation', () => {
  it('accepts empty (inherit) and valid KES prices', () => {
    expect(validatePriceInput('')).toEqual({ ok: true, value: null });
    expect(validatePriceInput('2500')).toEqual({ ok: true, value: 2500 });
    expect(validatePriceInput('2,500.50')).toEqual({ ok: true, value: 2500.5 });
    expect(validatePriceInput('0')).toEqual({ ok: true, value: 0 });
  });

  it('rejects negative, malformed and over-precise prices', () => {
    expect(validatePriceInput('-5').ok).toBe(false);
    expect(validatePriceInput('abc').ok).toBe(false);
    expect(validatePriceInput('10.999').ok).toBe(false);
    expect(validatePriceInput('99999999999').ok).toBe(false);
  });

  it('accepts empty and valid whole stock quantities', () => {
    expect(validateStockInput('')).toEqual({ ok: true, value: null });
    expect(validateStockInput('0')).toEqual({ ok: true, value: 0 });
    expect(validateStockInput('25')).toEqual({ ok: true, value: 25 });
  });

  it('rejects negative, fractional and malformed stock', () => {
    expect(validateStockInput('-1').ok).toBe(false);
    expect(validateStockInput('2.5').ok).toBe(false);
    expect(validateStockInput('ten').ok).toBe(false);
    expect(validateStockInput('100001').ok).toBe(false);
  });

  it('formats KES amounts for Kenyan admins', () => {
    expect(formatKES(2500)).toContain('2,500');
    expect(formatKES(null)).toBe('—');
  });
});

describe('matrix row merging', () => {
  it('merges preview payloads into existing/new/skipped rows', () => {
    const rows = mergePreviewRows({
      created: [{ id: null, sku: 'NKE-TSH-AM01-WHT-M', attributes: { Color: 'White', Size: 'M' } }],
      existing: [{ id: 'v1', sku: 'NKE-TSH-AM01-BLK-M', attributes: { Color: 'Black', Size: 'M' } }],
      skipped: [{ id: null, sku: 'NKE-TSH-AM01-WHT-L', attributes: { Color: 'White', Size: 'L' } }],
      existingDetails: [{ id: 'v1', status: 'ACTIVE', priceOverride: 2500, quantityOnHand: 8, quantityReserved: 2, pairs: [] }],
      resolvePair,
    });
    expect(rows.map((row) => [row.sku, row.status, row.variantId, row.included])).toEqual([
      ['NKE-TSH-AM01-BLK-M', 'existing', 'v1', true],
      ['NKE-TSH-AM01-WHT-M', 'new', null, true],
      ['NKE-TSH-AM01-WHT-L', 'skipped', null, false],
    ]);
    expect(rows[0]?.priceOverride).toBe(2500);
    expect(rows[0]?.quantityOnHand).toBe(8);
    expect(rows[1]?.label).toBe('White / M');
  });

  it('lists persisted variants in edit mode', () => {
    const rows = existingVariantRows([
      { id: 'v1', sku: 'SNK-RED-42', status: 'ACTIVE', priceOverride: 6500, quantityOnHand: 14, quantityReserved: 0, pairs: [{ attributeId: 'c', attributeName: 'Color', valueId: 'r', value: 'Red' }] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('existing');
    expect(rows[0]?.label).toBe('Red');
  });
});

describe('allow-list building', () => {
  it('omits the allow-list when every new row is included', () => {
    const rows = existingVariantRows([
      { id: 'v1', sku: 'A', status: 'ACTIVE', priceOverride: 1, quantityOnHand: 1, quantityReserved: 0, pairs: [] },
    ]);
    expect(buildAllowList(rows)).toBeUndefined();
  });

  it('restricts to checked new rows and never resubmits existing variants', () => {
    const rows = mergePreviewRows({
      created: [
        { id: null, sku: 'B', attributes: { Color: 'Black' } },
        { id: null, sku: 'W', attributes: { Color: 'White' } },
      ],
      existing: [{ id: 'v1', sku: 'A', attributes: { Color: 'Red' } }],
      skipped: [],
      existingDetails: [],
      resolvePair,
    }).map((row) => (row.sku === 'W' ? { ...row, included: false } : row));
    expect(buildAllowList(rows)).toEqual([{ 'attr-color': 'val-black' }]);
  });
});
