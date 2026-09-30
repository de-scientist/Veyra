import { describe, expect, it } from 'vitest';

import {
  barcodeDisplayType,
  gs1CheckDigit,
  isEan13,
  isInternalBarcode,
  isUpcA,
  renderEan13Svg,
} from './barcode';

describe('barcode display helpers (rendering only — backend validates)', () => {
  it('verifies EAN-13/UPC-A check digits before rendering', () => {
    expect(gs1CheckDigit('590123412345')).toBe('7');
    expect(isEan13('5901234123457')).toBe(true);
    expect(isEan13('5901234123450')).toBe(false);
    expect(isUpcA('036000291452')).toBe(true);
    expect(isUpcA('036000291450')).toBe(false);
    expect(barcodeDisplayType('5901234123457')).toBe('EAN-13');
    expect(barcodeDisplayType('036000291452')).toBe('UPC-A');
    expect(barcodeDisplayType('JB-2026-0042')).toBe('CODE');
    expect(isInternalBarcode('2900000000162')).toBe(true);
    expect(isInternalBarcode('5901234123457')).toBe(false);
  });

  it('renders exact 95-module EAN-13 SVG with quiet zones', () => {
    const rendered = renderEan13Svg('5901234123457', { moduleWidth: 2, barHeight: 60 });
    expect(rendered).not.toBeNull();
    expect(rendered?.modules).toHaveLength(95);
    expect(rendered?.modules.startsWith('101')).toBe(true);
    expect(rendered?.modules.endsWith('101')).toBe(true);
    expect(rendered?.modules.slice(45, 50)).toBe('01010');
    // Quiet zones: 9 modules each side at moduleWidth 2.
    expect(rendered?.width).toBe((95 + 18) * 2);
    expect(rendered?.svg).toContain('5901234123457');
    expect(rendered?.svg).toContain('fill="#ffffff"');
  });

  it('renders UPC-A through the same path and refuses non-numeric codes', () => {
    const rendered = renderEan13Svg('036000291452');
    expect(rendered?.modules).toHaveLength(95);
    expect(renderEan13Svg('JB-2026-0042')).toBeNull();
    expect(renderEan13Svg('5901234123450')).toBeNull();
  });
});
