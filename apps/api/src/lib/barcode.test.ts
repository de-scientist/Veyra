import { describe, expect, it } from 'vitest';

import {
  deriveBarcodeType,
  generateInternalCandidate,
  gs1CheckDigit,
  isInternalBarcode,
  normalizeBarcode,
  validateBarcodeSource,
  validateBarcodeValue,
} from './barcode.js';

describe('barcode normalization', () => {
  it('strips human grouping to the canonical form', () => {
    expect(normalizeBarcode('629 1234 567-890')).toBe('6291234567890');
    expect(normalizeBarcode('  5901234123457  ')).toBe('5901234123457');
  });
});

describe('check digits (never length-only)', () => {
  it('computes GS1 check digits', () => {
    expect(gs1CheckDigit('590123412345')).toBe('7');
    expect(gs1CheckDigit('03600029145')).toBe('2');
  });

  it('accepts valid EAN-13 and rejects bad check digits', () => {
    expect(validateBarcodeValue('5901234123457')).toEqual({ ok: true, value: { barcode: '5901234123457', type: 'EAN13' } });
    const bad = validateBarcodeValue('5901234123457', 'EAN13');
    expect(bad.ok).toBe(true);
    const wrong = validateBarcodeValue('5901234123450', 'EAN13');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.errors[0]?.code).toBe('INVALID_BARCODE_CHECK_DIGIT');
  });

  it('accepts valid UPC-A and rejects bad check digits', () => {
    expect(validateBarcodeValue('036000291452')).toEqual({ ok: true, value: { barcode: '036000291452', type: 'UPC_A' } });
    expect(validateBarcodeValue('036000291450', 'UPC_A').ok).toBe(false);
  });

  it('rejects wrong lengths with actionable codes', () => {
    expect(validateBarcodeValue('12345', 'EAN13').ok).toBe(false);
    expect(validateBarcodeValue('12345', 'UPC_A').ok).toBe(false);
    expect(validateBarcodeValue('AB', 'CODE128').ok).toBe(false);
    expect(validateBarcodeValue('', 'EAN13').ok).toBe(false);
  });
});

describe('type detection and charset rules', () => {
  it('detects EAN-13, UPC-A and Code 128 without mislabeling', () => {
    expect(deriveBarcodeType('5901234123457')).toBe('EAN13');
    expect(deriveBarcodeType('036000291452')).toBe('UPC_A');
    expect(deriveBarcodeType('JB-2026-0042')).toBe('CODE128');
    // Too short for any standard (Code 128 needs 4+ chars after normalization).
    expect(deriveBarcodeType('a\nb')).toBeNull();
  });

  it('validates Code 128 and Code 39 charsets', () => {
    expect(validateBarcodeValue('ABC-123').ok).toBe(true);
    expect(validateBarcodeValue('abc', 'CODE39')).toEqual({ ok: true, value: { barcode: 'ABC', type: 'CODE39' } });
    expect(validateBarcodeValue('ABC 123', 'CODE39')).toEqual({ ok: true, value: { barcode: 'ABC 123', type: 'CODE39' } });
    expect(validateBarcodeValue('x', 'QR').ok).toBe(false);
  });

  it('validates sources explicitly', () => {
    expect(validateBarcodeSource('manufacturer')).toEqual({ ok: true, value: 'MANUFACTURER' });
    expect(validateBarcodeSource('homemade').ok).toBe(false);
  });
});

describe('internal generation (restricted circulation, never GTIN)', () => {
  it('produces valid 29-prefix EAN-13 candidates', () => {
    const first = generateInternalCandidate();
    expect(first).toMatch(/^29\d{11}$/);
    expect(validateBarcodeValue(first)).toEqual({ ok: true, value: { barcode: first, type: 'EAN13' } });
    expect(isInternalBarcode(first)).toBe(true);
    expect(isInternalBarcode('5901234123457')).toBe(false);
  });

  it('allocates unique candidates across batches', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) seen.add(generateInternalCandidate());
    expect(seen.size).toBeGreaterThan(190);
  });
});
