import crypto from 'node:crypto';

import { Prisma } from '@prisma/client';

import { validateAuditReason } from './admin.js';
import { HttpError } from './errors.js';
import { prisma } from './prisma.js';

/**
 * Barcode domain service (Phase 5).
 *
 * SKU and barcode are separate identifiers for the same sellable unit:
 * SKU is the internal/business key (Phase 1 engine); barcode is the
 * machine-readable operational key stored on `ProductVariant.barcode`
 * (unique nullable — NULL stays allowed until assignment; the database
 * remains the final authority on duplicates).
 *
 * Standards strategy (documented choice):
 * - Assigned identifiers may be EAN-13, UPC-A, CODE128 or CODE39 and are
 *   validated per standard (EAN-13/UPC-A check digits verified, never just
 *   length-checked). Legitimate manufacturer/supplier codes are preserved
 *   verbatim and never overwritten without explicit replacement.
 * - Internally generated barcodes are EAN-13 in the GS1 restricted-
 *   circulation range (prefix 29, store-use only). They are explicitly NOT
 *   official GTINs and must never be presented as such; the prefix choice
 *   keeps internal labels scannable on standard hardware without
 *   fabricating an official identifier JB Mercantile was never issued.
 * - QR is deferred (no renderer/validator in this phase).
 *
 * Pure functions (normalize/validate/detect/generate candidate) stay free
 * of Prisma so they are unit-testable; persistence lives in the service
 * functions below, which use atomic claims (`updateMany ... barcode: null`
 * / `restockApplied`-style guards) plus the DB unique constraint so
 * concurrent assignments collapse instead of duplicating.
 */

export const BARCODE_TYPES = ['EAN13', 'UPC_A', 'CODE128', 'CODE39'] as const;
export type BarcodeType = (typeof BARCODE_TYPES)[number];

export const BARCODE_SOURCES = ['INTERNAL', 'MANUFACTURER', 'SUPPLIER', 'IMPORTED', 'MANUAL'] as const;
export type BarcodeSource = (typeof BARCODE_SOURCES)[number];

/** GS1 restricted-circulation prefix reserved for internal store use. */
export const INTERNAL_BARCODE_PREFIX = '29';

export const MAX_GENERATION_ATTEMPTS = 10;

export type BarcodeIssue = { code: string; message: string };
export type BarcodeResult<T> = { ok: true; value: T } | { ok: false; errors: BarcodeIssue[] };

function fail(message: string, code = 'INVALID_BARCODE'): BarcodeResult<never> {
  return { ok: false, errors: [{ code, message }] };
}

/** Strip spaces/dots/dashes used for human grouping of numeric barcodes. */
export function normalizeBarcode(value: string): string {
  return value.trim().replace(/[\s.\-]+/g, '');
}

/** Canonical form for Code 128 (dashes/spaces are significant — trim only). */
function normalizeCode128(value: string): string {
  return value.trim();
}

/** EAN-13/UPC-A check digit over the payload (all digits except the last). */
export function gs1CheckDigit(payload: string): string {
  let sum = 0;
  const reversed = payload.split('').reverse();
  for (let i = 0; i < reversed.length; i += 1) {
    const digit = Number(reversed[i]);
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return String((10 - (sum % 10)) % 10);
}

function isDigits(value: string): boolean {
  return /^[0-9]+$/.test(value);
}

function checkEan13(value: string): boolean {
  return value.length === 13 && isDigits(value) && gs1CheckDigit(value.slice(0, 12)) === value[12];
}

function checkUpcA(value: string): boolean {
  return value.length === 12 && isDigits(value) && gs1CheckDigit(value.slice(0, 11)) === value[11];
}

function checkCode128(value: string): boolean {
  return value.length >= 4 && value.length <= 48 && /^[\x20-\x7E]+$/.test(value);
}

function checkCode39(value: string): boolean {
  return value.length >= 1 && value.length <= 43 && /^[0-9A-Z \-$/%+.]+$/.test(value);
}

/**
 * Validate a barcode value against an explicit type, or detect the type
 * when omitted (EAN-13 → UPC-A → CODE128, in that order). CODE39 is only
 * accepted when explicitly requested so plain numerics never mislabel.
 * Normalization is type-aware: grouping characters are stripped for
 * numeric standards but preserved for Code 128/39, where they are data.
 */
export function validateBarcodeValue(raw: string, type?: string): BarcodeResult<{ barcode: string; type: BarcodeType }> {
  const trimmed = raw.trim();
  if (!trimmed) return fail('Enter a barcode value.', 'EMPTY_BARCODE');
  const requested = type?.trim().toUpperCase() || null;
  if (requested && !(BARCODE_TYPES as readonly string[]).includes(requested)) {
    return fail(`Unsupported barcode type "${type}". Supported: ${BARCODE_TYPES.join(', ')}.`, 'UNSUPPORTED_BARCODE_TYPE');
  }
  if (!requested || requested === 'EAN13') {
    const barcode = normalizeBarcode(trimmed);
    if (checkEan13(barcode)) return { ok: true, value: { barcode, type: 'EAN13' } };
    if (requested === 'EAN13') {
      if (!isDigits(barcode) || barcode.length !== 13) {
        return fail('EAN-13 must be exactly 13 digits. Internal store barcodes start with 29.', 'INVALID_BARCODE');
      }
      return fail(`Invalid EAN-13 check digit for ${barcode}. Verify the digits or use the correct type.`, 'INVALID_BARCODE_CHECK_DIGIT');
    }
  }
  if (!requested || requested === 'UPC_A') {
    const barcode = normalizeBarcode(trimmed);
    if (checkUpcA(barcode)) return { ok: true, value: { barcode, type: 'UPC_A' } };
    if (requested === 'UPC_A') {
      if (!isDigits(barcode) || barcode.length !== 12) return fail('UPC-A must be exactly 12 digits.', 'INVALID_BARCODE');
      return fail(`Invalid UPC-A check digit for ${barcode}.`, 'INVALID_BARCODE_CHECK_DIGIT');
    }
  }
  if ((!requested && checkCode128(normalizeCode128(trimmed))) || requested === 'CODE128') {
    const barcode = normalizeCode128(trimmed);
    if (checkCode128(barcode)) return { ok: true, value: { barcode, type: 'CODE128' } };
    return fail('Code 128 needs 4–48 printable ASCII characters.', 'INVALID_BARCODE');
  }
  if (requested === 'CODE39') {
    const barcode = trimmed.toUpperCase();
    if (checkCode39(barcode)) return { ok: true, value: { barcode, type: 'CODE39' } };
    return fail('Code 39 needs 1–43 characters of A-Z, 0-9, space and -.$/+%.', 'INVALID_BARCODE');
  }
  return fail(
    'Unrecognized barcode. Use a valid EAN-13/UPC-A (check digit verified), a 4–48 character Code 128 value, or request CODE39 explicitly.',
    'INVALID_BARCODE',
  );
}

/** Display-only type derivation for a stored barcode (never authoritative). */
export function deriveBarcodeType(barcode: string): BarcodeType | null {
  const result = validateBarcodeValue(barcode);
  return result.ok ? result.value.type : null;
}

/** True for internally generated restricted-circulation EAN-13 (29 prefix). */
export function isInternalBarcode(barcode: string): boolean {
  const canonical = normalizeBarcode(barcode);
  return checkEan13(canonical) && canonical.startsWith(INTERNAL_BARCODE_PREFIX);
}

/**
 * Generate one internal EAN-13 candidate (29 + 10 crypto-random digits +
 * valid check digit). Uniqueness is enforced by the caller via atomic
 * claim + unique constraint with bounded retries — never hope-based.
 */
export function generateInternalCandidate(randomBytes: (size: number) => Buffer = crypto.randomBytes): string {
  const digits: number[] = [];
  while (digits.length < 10) {
    const chunk = randomBytes(8);
    for (const byte of chunk) {
      if (digits.length >= 10) break;
      if (byte < 250) digits.push(byte % 10);
    }
  }
  const payload = `${INTERNAL_BARCODE_PREFIX}${digits.join('')}`;
  return `${payload}${gs1CheckDigit(payload)}`;
}

export function validateBarcodeSource(source: unknown): BarcodeResult<BarcodeSource> {
  const normalized = String(source ?? '').trim().toUpperCase();
  if ((BARCODE_SOURCES as readonly string[]).includes(normalized)) return { ok: true, value: normalized as BarcodeSource };
  return fail(`Unknown barcode source. Allowed: ${BARCODE_SOURCES.join(', ')}.`, 'INVALID_BARCODE_SOURCE');
}

export function isBarcodeIssues(error: unknown): error is { issues: BarcodeIssue[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues) &&
    ((error as { issues: unknown[] }).issues.length === 0 ||
      typeof (error as { issues: Array<{ code?: unknown }> }).issues[0]?.code === 'string')
  );
}

export type BarcodeLookup = {
  variant: { id: string; sku: string; name: string | null; status: string; barcode: string | null; price: number | null };
  product: { id: string; name: string; slug: string; status: string };
  attributes: Record<string, string>;
  inventory: { quantityOnHand: number; quantityReserved: number; availableQuantity: number; lowStockThreshold: number } | null;
};

/** Resolve a barcode to its variant (throws `{ issues }` when unknown). */
export async function lookupVariantByBarcode(raw: string): Promise<BarcodeLookup> {
  const trimmed = raw.trim();
  if (!trimmed) throw { issues: [{ code: 'EMPTY_BARCODE', message: 'Enter a barcode value to look up.' }] };
  // Scanners may send grouped digits ("629 1234…"); Code 128 values with
  // significant spaces must still match exactly — try both forms.
  const candidates = [...new Set([trimmed, normalizeBarcode(trimmed)])];
  const variant = await prisma.productVariant.findFirst({
    where: { barcode: { in: candidates }, deletedAt: null },
    include: {
      product: { select: { id: true, name: true, slug: true, status: true } },
      inventory: true,
      variantAttributeValues: { include: { attribute: true, attributeValue: true } },
    },
  });
  if (!variant) {
    throw { issues: [{ code: 'BARCODE_NOT_FOUND', message: `No product variant uses barcode ${normalizeBarcode(trimmed)}.` }] };
  }
  const attributes: Record<string, string> = {};
  for (const mapping of variant.variantAttributeValues) attributes[mapping.attribute.name] = mapping.attributeValue.value;
  return {
    variant: {
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      status: variant.status,
      barcode: variant.barcode,
      price: variant.priceOverride === null ? null : Number(variant.priceOverride),
    },
    product: variant.product,
    attributes,
    inventory: variant.inventory
      ? {
          quantityOnHand: variant.inventory.quantityOnHand,
          quantityReserved: variant.inventory.quantityReserved,
          availableQuantity: Math.max(variant.inventory.quantityOnHand - variant.inventory.quantityReserved, 0),
          lowStockThreshold: variant.inventory.lowStockThreshold,
        }
      : null,
  };
}

function toHttpError(issues: BarcodeIssue[]): HttpError {
  const first = issues[0] ?? { code: 'INVALID_BARCODE', message: 'Invalid barcode.' };
  const status = first.code === 'BARCODE_NOT_FOUND' ? 404 : first.code === 'BARCODE_ALREADY_EXISTS' || first.code === 'BARCODE_ALREADY_ASSIGNED' ? 409 : 400;
  return new HttpError(status, first.code, first.message, { issues });
}

async function requireVariant(productId: string, variantId: string) {
  const variant = await prisma.productVariant.findFirst({ where: { id: variantId, productId } });
  if (!variant) throw new HttpError(404, 'VARIANT_NOT_FOUND', 'Product variant not found for this product.');
  return variant;
}

/**
 * Server-authoritative internal barcode generation. The variant must have
 * no barcode (never overwrite — use assign with replace for that path).
 * Allocation is claim + retry: each candidate commits via
 * `updateMany(... barcode: null ...)` so concurrent generators collapse;
 * residual P2002 races retry with a fresh candidate, bounded.
 */
export async function generateVariantBarcode(productId: string, variantId: string, actorId: string): Promise<{ barcode: string; type: BarcodeType }> {
  const variant = await requireVariant(productId, variantId);
  if (variant.barcode) {
    throw new HttpError(409, 'BARCODE_ALREADY_ASSIGNED', `Variant ${variant.sku} already uses barcode ${variant.barcode}. Replacement requires explicit confirmation.`);
  }
  let lastCollision: unknown = null;
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateInternalCandidate();
    try {
      const claimed = await prisma.productVariant.updateMany({
        where: { id: variantId, productId, barcode: null },
        data: { barcode: candidate },
      });
      if (claimed.count !== 1) {
        throw new HttpError(409, 'BARCODE_CONFLICT', 'The variant changed while assigning the barcode. Please try again.');
      }
      await prisma.auditLog.create({
        data: {
          actorId,
          action: 'VARIANT_UPDATED',
          entity: 'ProductVariant',
          entityId: variantId,
          before: { barcode: null } as Prisma.InputJsonValue,
          after: { barcode: candidate, type: 'EAN13', source: 'INTERNAL' } as Prisma.InputJsonValue,
        },
      });
      return { barcode: candidate, type: 'EAN13' };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        lastCollision = error;
        continue;
      }
      throw error;
    }
  }
  throw new HttpError(409, 'BARCODE_GENERATION_FAILED', 'Could not allocate a unique barcode after several attempts. Please try again.', { cause: String(lastCollision) });
}

export type AssignBarcodeOptions = { type?: string; replace?: boolean; reason?: string };

/**
 * Manual assignment (manufacturer/supplier/imported/manual codes).
 * Existing barcodes are never silently overwritten: replacement needs
 * `replace: true` plus an audit reason, and the change is recorded with
 * before/after values (history via the existing audit log, no second log).
 */
export async function assignVariantBarcode(
  productId: string,
  variantId: string,
  raw: string,
  source: unknown,
  actorId: string,
  options: AssignBarcodeOptions = {},
): Promise<{ barcode: string; type: BarcodeType; source: BarcodeSource }> {
  const variant = await requireVariant(productId, variantId);
  const validated = validateBarcodeValue(raw, options.type);
  if (!validated.ok) throw toHttpError(validated.errors);
  const sourceCheck = validateBarcodeSource(source);
  if (!sourceCheck.ok) throw toHttpError(sourceCheck.errors);
  const { barcode, type } = validated.value;

  if (variant.barcode && variant.barcode !== barcode && !options.replace) {
    throw new HttpError(
      409,
      'BARCODE_ALREADY_ASSIGNED',
      `Variant ${variant.sku} already uses barcode ${variant.barcode}. Pass replace: true with a reason to replace it explicitly.`,
    );
  }
  if (variant.barcode === barcode) return { barcode, type, source: sourceCheck.value };
  const reason = options.replace ? validateAuditReason(options.reason, 'replacement reason') : null;

  const holder = await prisma.productVariant.findUnique({ where: { barcode }, select: { id: true, sku: true, productId: true } });
  if (holder && holder.id !== variantId) {
    throw new HttpError(409, 'BARCODE_ALREADY_EXISTS', `Barcode ${barcode} is already assigned to variant ${holder.sku}. It cannot identify two variants.`);
  }
  try {
    const claimed = await prisma.productVariant.updateMany({
      where: options.replace ? { id: variantId, productId } : { id: variantId, productId, barcode: null },
      data: { barcode },
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, 'BARCODE_CONFLICT', 'The variant changed while assigning the barcode. Please try again.');
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, 'BARCODE_ALREADY_EXISTS', `Barcode ${barcode} is already assigned to another variant.`);
    }
    throw error;
  }
  await prisma.auditLog.create({
    data: {
      actorId,
      action: 'VARIANT_UPDATED',
      entity: 'ProductVariant',
      entityId: variantId,
      before: { barcode: variant.barcode } as Prisma.InputJsonValue,
      after: { barcode, type, source: sourceCheck.value, ...(reason ? { reason } : {}) } as Prisma.InputJsonValue,
    },
  });
  return { barcode, type, source: sourceCheck.value };
}

export type BulkBarcodeResult = {
  generated: Array<{ variantId: string; sku: string; barcode: string }>;
  skipped: number;
  errors: Array<{ variantId: string; code: string; message: string }>;
};

/**
 * Bulk generation for variants missing barcodes. Existing barcodes are
 * never touched. Per-row atomic (claim per variant); failures are
 * collected per variant rather than aborting the batch.
 */
export async function generateMissingBarcodes(productId: string, actorId: string, limit = 100): Promise<BulkBarcodeResult> {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.deletedAt) throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  const missing = await prisma.productVariant.findMany({
    where: { productId, barcode: null, deletedAt: null },
    select: { id: true, sku: true },
    orderBy: { createdAt: 'asc' },
    take: Math.min(Math.max(limit, 1), 100),
  });
  const skipped = await prisma.productVariant.count({ where: { productId, barcode: { not: null } } });
  const result: BulkBarcodeResult = { generated: [], skipped, errors: [] };
  for (const variant of missing) {
    try {
      const { barcode } = await generateVariantBarcode(productId, variant.id, actorId);
      result.generated.push({ variantId: variant.id, sku: variant.sku, barcode });
    } catch (error) {
      const code = error instanceof HttpError ? error.code : 'BARCODE_GENERATION_FAILED';
      result.errors.push({ variantId: variant.id, code, message: error instanceof Error ? error.message : 'Barcode generation failed.' });
    }
  }
  return result;
}
