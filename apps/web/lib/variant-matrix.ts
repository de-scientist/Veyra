/**
 * Variant-matrix helpers (Phase 3).
 *
 * Pure, framework-free logic for the admin variant matrix. Deliberately
 * contains NO SKU generation: SKUs always arrive from the server (Phase 2
 * `dryRun` preview backed by the Phase 1 generator). The only template
 * parsing here is display-only — extracting `{TOKEN}` names so the UI can
 * label required dimensions and match attributes to them.
 */

export type MatrixAttribute = { id: string; name: string; slug: string };
export type MatrixAttributeValue = { id: string; value: string };

export type DimensionMatch = { attribute: MatrixAttribute; token: string };

/** Identity segments never define variants (mirrors the backend engine). */
export const IDENTITY_TOKENS: ReadonlySet<string> = new Set(['BRAND', 'CATEGORY', 'STYLE', 'MODEL']);

/** Extract `{TOKEN}` placeholders in order — display use only. */
export function parseTemplateTokens(template: string): string[] {
  const matches = template.match(/\{([A-Z]+)\}/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

/** Non-identity template tokens in order = required variant dimensions. */
export function requiredDimensionTokens(template: string): string[] {
  return parseTemplateTokens(template).filter((token) => !IDENTITY_TOKENS.has(token));
}

function normalizeSlug(slug: string): string {
  return slug.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Match catalogue attributes to the template's dimension tokens. Exact
 * normalized match wins (`color` -> COLOR); otherwise a suffix match covers
 * scoped attributes (`shoe-size` -> SIZE). Returns matched dimensions plus
 * the remaining descriptive attributes (never variant-defining).
 */
export function matchDimensionAttributes(
  attributes: MatrixAttribute[],
  template: string,
): { dimensions: DimensionMatch[]; descriptive: MatrixAttribute[]; identity: MatrixAttribute[] } {
  const tokens = requiredDimensionTokens(template);
  const dimensions: DimensionMatch[] = [];
  const descriptive: MatrixAttribute[] = [];
  const identity: MatrixAttribute[] = [];
  const claimed = new Set<string>();
  for (const attribute of attributes) {
    const normalized = normalizeSlug(attribute.slug);
    if (IDENTITY_TOKENS.has(normalized)) {
      identity.push(attribute);
      continue;
    }
    const exact = tokens.find((token) => token === normalized && !claimed.has(token));
    if (exact) {
      dimensions.push({ attribute, token: exact });
      claimed.add(exact);
      continue;
    }
    const suffix = [...tokens]
      .filter((token) => !claimed.has(token) && normalized.endsWith(token) && normalized.length > token.length)
      .sort((a, b) => b.length - a.length)[0];
    if (suffix) {
      dimensions.push({ attribute, token: suffix });
      claimed.add(suffix);
      continue;
    }
    descriptive.push(attribute);
  }
  return { dimensions, descriptive, identity };
}

export type SelectionAxis = { name: string; count: number };

/** Human summary: `2 Colors × 3 Sizes` + total combination count. */
export function summarizeSelection(axes: SelectionAxis[]): { label: string; total: number } {
  const total = axes.reduce((acc, axis) => acc * Math.max(axis.count, 0), 1);
  if (axes.length === 0) return { label: 'Single variant (no variant-defining attributes selected)', total: 1 };
  const label = axes.map((axis) => `${axis.count} ${axis.count === 1 ? axis.name.replace(/s$/i, '') : axis.name}`).join(' × ');
  return { label, total: axes.length === 0 ? 1 : total };
}

export const MAX_PRICE = 99999999.99;
export const MAX_STOCK = 100000;

export type FieldResult = { ok: true; value: number | null } | { ok: false; error: string };

/**
 * Validate an optional per-variant price (KES major units, matching the
 * backend Decimal(10,2)). Empty means "inherit the product base price".
 */
export function validatePriceInput(raw: string): FieldResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  const normalized = trimmed.replace(/,/g, '');
  const value = Number(normalized);
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a valid price, e.g. 2500.00.' };
  if (value < 0) return { ok: false, error: 'Price cannot be negative.' };
  if (value > MAX_PRICE) return { ok: false, error: `Price must not exceed ${formatKES(MAX_PRICE)}.` };
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { ok: false, error: 'Price supports at most two decimal places.' };
  return { ok: true, value: Math.round(value * 100) / 100 };
}

/** Validate an optional per-variant stock quantity (whole units, never negative). */
export function validateStockInput(raw: string): FieldResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  const normalized = trimmed.replace(/,/g, '');
  if (!/^\d+$/.test(normalized)) return { ok: false, error: 'Stock must be a whole non-negative number.' };
  const value = Number(normalized);
  if (!Number.isSafeInteger(value)) return { ok: false, error: 'Stock quantity is too large.' };
  if (value > MAX_STOCK) return { ok: false, error: `Stock must not exceed ${MAX_STOCK.toLocaleString('en-KE')} units per entry.` };
  return { ok: true, value };
}

export function formatKES(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 2 }).format(Number(value));
}

export function formatStock(value: number | null | undefined, reserved = 0): string {
  if (value === null || value === undefined) return '—';
  const available = value - reserved;
  return `${available.toLocaleString('en-KE')} available`;
}

export type MatrixPair = { attributeId: string; attributeName: string; valueId: string; value: string };

export type MatrixRow = {
  key: string;
  sku: string;
  barcode: string | null;
  label: string;
  pairs: MatrixPair[];
  /** existing: persisted variant · new: from preview, not yet saved · skipped: excluded via allow-list */
  status: 'existing' | 'new' | 'skipped';
  variantId: string | null;
  variantStatus: string | null;
  priceOverride: number | null;
  /** Existing backend compare-at price (nullable); never fabricated. */
  compareAtPrice: number | null;
  quantityOnHand: number | null;
  quantityReserved: number;
  included: boolean;
};

export type PreviewSummary = { id: string | null; sku: string; attributes: Record<string, string> };

function labelOf(pairs: MatrixPair[]): string {
  return pairs.map((pair) => pair.value).join(' / ');
}

/**
 * Merge a server preview (`dryRun`) into matrix rows. Existing variants keep
 * their ids/prices/stock; created rows are new; skipped rows stay visible
 * but excluded. Attribute names come from the preview payload; ids are
 * resolved through the provided lookup (attribute name + value -> ids).
 */
export function mergePreviewRows(options: {
  created: PreviewSummary[];
  existing: PreviewSummary[];
  skipped: PreviewSummary[];
  existingDetails: Array<{
    id: string;
    status: string;
    barcode: string | null;
    priceOverride: number | null;
    compareAtPrice?: number | null;
    quantityOnHand: number | null;
    quantityReserved: number;
    pairs: MatrixPair[];
  }>;
  resolvePair: (attributeName: string, value: string) => { attributeId: string; valueId: string } | null;
}): MatrixRow[] {
  const rows: MatrixRow[] = [];
  const toPairs = (attributes: Record<string, string>): MatrixPair[] =>
    Object.entries(attributes).map(([attributeName, value]) => {
      const resolved = options.resolvePair(attributeName, value);
      return {
        attributeId: resolved?.attributeId ?? attributeName,
        attributeName,
        valueId: resolved?.valueId ?? value,
        value,
      };
    });
  const detailById = new Map(options.existingDetails.map((detail) => [detail.id, detail]));
  for (const item of options.existing) {
    const detail = item.id ? detailById.get(item.id) : undefined;
    const pairs = detail?.pairs ?? toPairs(item.attributes);
    rows.push({
      key: `existing:${item.id ?? item.sku}`,
      sku: item.sku,
      barcode: detail?.barcode ?? null,
      label: labelOf(pairs),
      pairs,
      status: 'existing',
      variantId: item.id,
      variantStatus: detail?.status ?? null,
      priceOverride: detail?.priceOverride ?? null,
      compareAtPrice: detail?.compareAtPrice ?? null,
      quantityOnHand: detail?.quantityOnHand ?? null,
      quantityReserved: detail?.quantityReserved ?? 0,
      included: true,
    });
  }
  for (const item of options.created) {
    const pairs = toPairs(item.attributes);
    rows.push({
      key: `new:${item.sku}`,
      sku: item.sku,
      barcode: null,
      label: labelOf(pairs),
      pairs,
      status: 'new',
      variantId: null,
      variantStatus: null,
      priceOverride: null,
      compareAtPrice: null,
      quantityOnHand: null,
      quantityReserved: 0,
      included: true,
    });
  }
  for (const item of options.skipped) {
    const pairs = toPairs(item.attributes);
    rows.push({
      key: `skipped:${item.sku}`,
      sku: item.sku,
      barcode: null,
      label: labelOf(pairs),
      pairs,
      status: 'skipped',
      variantId: null,
      variantStatus: null,
      priceOverride: null,
      compareAtPrice: null,
      quantityOnHand: null,
      quantityReserved: 0,
      included: false,
    });
  }
  return rows;
}

/**
 * Build rows for already-persisted variants (edit mode before any preview).
 */
export function existingVariantRows(
  variants: Array<{
    id: string;
    sku: string;
    barcode: string | null;
    status: string;
    priceOverride: number | null;
    compareAtPrice?: number | null;
    quantityOnHand: number | null;
    quantityReserved: number;
    pairs: MatrixPair[];
  }>,
): MatrixRow[] {
  return variants.map((variant) => ({
    key: `existing:${variant.id}`,
    sku: variant.sku,
    barcode: variant.barcode,
    label: labelOf(variant.pairs),
    pairs: variant.pairs,
    status: 'existing' as const,
    variantId: variant.id,
    variantStatus: variant.status,
    priceOverride: variant.priceOverride,
    compareAtPrice: variant.compareAtPrice ?? null,
    quantityOnHand: variant.quantityOnHand,
    quantityReserved: variant.quantityReserved,
    included: true,
  }));
}

/**
 * Build the explicit allow-list from unchecked NEW rows. Returns undefined
 * when every new row is included (no restriction needed). Only new rows
 * participate — existing variants are never re-submitted.
 */
export function buildAllowList(rows: MatrixRow[]): Array<Record<string, string>> | undefined {
  const fresh = rows.filter((row) => row.status === 'new');
  if (fresh.length === 0) return undefined;
  if (fresh.every((row) => row.included)) return undefined;
  const allowed = fresh.filter((row) => row.included);
  if (allowed.length === 0) return [];
  return allowed.map((row) => {
    const entry: Record<string, string> = {};
    for (const pair of row.pairs) entry[pair.attributeId] = pair.valueId;
    return entry;
  });
}
