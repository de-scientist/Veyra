/**
 * Barcode presentation helpers (Phase 5).
 *
 * No validation/generation authority lives here: the backend owns
 * normalization, check digits, uniqueness and persistence. This module only
 * renders EAN-13/UPC-A bars as resolution-independent SVG from an
 * already-authoritative value, plus display-only type labels.
 *
 * EAN-13 encoding (95 modules: guard + 6 left + middle guard + 6 right +
 * guard, 9-module quiet zones each side). UPC-A renders through the same
 * path with a leading zero.
 */

const L_PATTERNS = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G_PATTERNS = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R_PATTERNS = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function gs1CheckDigit(payload: string): string {
  let sum = 0;
  const reversed = payload.split('').reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    const digit = Number(reversed[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isEan13(value: string): boolean {
  return value.length === 13 && /^[0-9]+$/.test(value) && gs1CheckDigit(value.slice(0, 12)) === value[12];
}

export function isUpcA(value: string): boolean {
  return value.length === 12 && /^[0-9]+$/.test(value) && gs1CheckDigit(value.slice(0, 11)) === value[11];
}

/** Display-only type label for a stored barcode (backend is authoritative). */
export function barcodeDisplayType(barcode: string): 'EAN-13' | 'UPC-A' | 'CODE' {
  if (isEan13(barcode)) return 'EAN-13';
  if (isUpcA(barcode)) return 'UPC-A';
  return 'CODE';
}

/** Internal restricted-circulation code (29 prefix, store-use only — never a GTIN). */
export function isInternalBarcode(barcode: string): boolean {
  return isEan13(barcode) && barcode.startsWith('29');
}

export type BarcodeSvg = { svg: string; width: number; height: number; modules: string };

/**
 * Render scannable EAN-13/UPC-A SVG. Returns null for non-numeric codes
 * (rendered as human-readable text by callers instead — never fake bars).
 * Quiet zones included; bars are exact module runs (no distortion).
 */
export function renderEan13Svg(barcode: string, options?: { moduleWidth?: number; barHeight?: number }): BarcodeSvg | null {
  const digits = isUpcA(barcode) ? `0${barcode}` : barcode;
  if (!isEan13(digits)) return null;
  const moduleWidth = options?.moduleWidth ?? 2;
  const barHeight = options?.barHeight ?? 60;
  const values = digits.split('').map(Number);
  const first = values[0] as number;
  const parity = PARITY[first] as string;

  let modules = '101';
  for (let i = 0; i < 6; i += 1) {
    const digit = values[1 + i] as number;
    modules += parity[i] === 'G' ? G_PATTERNS[digit] : L_PATTERNS[digit];
  }
  modules += '01010';
  for (let i = 0; i < 6; i += 1) {
    modules += R_PATTERNS[values[7 + i] as number];
  }
  modules += '101';

  const quiet = 9;
  const total = modules.length + quiet * 2;
  const textHeight = 16;
  const width = total * moduleWidth;
  const height = barHeight + textHeight + 8;

  let rects = '';
  let runStart = -1;
  const flush = (end: number) => {
    if (runStart < 0) return;
    const x = (quiet + runStart) * moduleWidth;
    rects += `<rect x="${x}" y="0" width="${(end - runStart) * moduleWidth}" height="${barHeight}" fill="currentColor"/>`;
    runStart = -1;
  };
  for (let i = 0; i < modules.length; i += 1) {
    if (modules[i] === '1' && runStart < 0) runStart = i;
    if (modules[i] === '0' && runStart >= 0) flush(i);
  }
  flush(modules.length);

  const text = (content: string, x: number, anchor: 'start' | 'middle' = 'middle') =>
    `<text x="${x}" y="${barHeight + textHeight}" font-size="${textHeight - 2}" text-anchor="${anchor}" font-family="monospace" fill="currentColor">${content}</text>`;
  const labels =
    text(digits[0] as string, (quiet - 6) * moduleWidth, 'start') +
    text(digits.slice(1, 7), (quiet + 3 + 21) * moduleWidth) +
    text(digits.slice(7), (quiet + 3 + 42 + 5 + 21) * moduleWidth);

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Barcode ${digits}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>` +
    `<g color="#000000">${rects}${labels}</g></svg>`;
  return { svg, width, height, modules };
}
