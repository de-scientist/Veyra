/**
 * Product Variant Generation Engine (Phase 2).
 *
 * Transforms a parent product's selected variant attributes into concrete,
 * sellable ProductVariants with deterministic SKUs. Category-aware,
 * deterministic, transaction-safe, and built on the Phase 1 SKU domain
 * (`./sku.ts` remains the single source of truth for SKU math).
 *
 * Conceptual pipeline (names adapted to this codebase):
 *
 *   AttributeValidator  ->  CombinationGenerator  ->  SkuGenerator  ->  VariantPersistenceService
 *   (validateAxes)         (planCombinations)        (sku.ts)            (generateProductVariants)
 *
 * Design notes:
 * - Variant-defining dimensions are data-driven: they are the non-identity
 *   tokens of the product category's `skuTemplate`
 *   (e.g. `{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}` => COLOR + SIZE).
 *   BRAND/CATEGORY/STYLE(/MODEL) are identity segments, never dimensions.
 *   Descriptive attributes (no template token) are rejected as dimensions
 *   instead of silently generating variants from them.
 * - Variant identity is canonical: productId + sorted
 *   (attributeId, attributeValueId) pairs. SKU strings are never the
 *   identity key; they are derived output.
 * - The planner (`planGenerationFromRecords`) is pure and takes plain
 *   records, so validation/combination/identity/SKU logic is unit-testable
 *   without a database. Only `generateProductVariants` touches Prisma, and
 *   it persists inside a single transaction (all-or-nothing).
 * - The engine never deletes variants. De-selected combinations are left
 *   untouched (preserved); explicit archival stays on the existing variant
 *   PATCH endpoint (status ARCHIVED). Historical orders stay traceable.
 */

import {
  MAX_VARIANTS_PER_REQUEST,
  SKU_TEMPLATE_TOKENS,
  buildVariantCombinations,
  defaultSkuTemplate,
  deriveStyleCode,
  generateSku,
  normalizeSegment,
  parseTemplateTokens,
} from './sku.js';

/** Template tokens that identify the product itself — never variant dimensions. */
export const IDENTITY_TOKENS: ReadonlySet<string> = new Set(['BRAND', 'CATEGORY', 'STYLE', 'MODEL']);

/** Base SKU template for single-variant products (no variant dimensions). */
export const SINGLE_VARIANT_TEMPLATE = '{BRAND}-{CATEGORY}-{STYLE}';

export type GenerationIssue = { code: string; message: string };

export type GenerationAxis = {
  /** Attribute id (uuid). */
  attributeId: string;
  /** Attribute slug (lowercase, e.g. `shoe-size`). */
  attributeSlug: string;
  /** Attribute display name. */
  attributeName: string;
  /** Resolved AttributeValue ids in request order (deduplicated). */
  valueIds: string[];
};

export type ResolvedValue = {
  id: string;
  attributeId: string;
  value: string;
  code: string | null;
};

export type ExistingVariantRecord = {
  id: string;
  sku: string;
  status: string;
  mappings: Array<{ attributeId: string; attributeValueId: string }>;
};

export type PlannedCombination = {
  /** Canonical identity key (productId + sorted attribute pairs). */
  key: string;
  /** Ordered (attributeId, valueId) pairs in template-token order. */
  pairs: Array<{ attributeId: string; attributeValueId: string }>;
  /** Human-readable label, e.g. `Black / M`. */
  label: string;
  /** Deterministic SKU for this combination. */
  sku: string;
  /** SKU segment codes by template token. */
  attributeSegments: Record<string, string>;
};

export type VariantSummary = {
  id: string | null;
  sku: string;
  attributes: Record<string, string>;
};

export type GenerationResult = {
  created: VariantSummary[];
  existing: VariantSummary[];
  skipped: VariantSummary[];
  errors: GenerationIssue[];
  summary: { created: number; existing: number; skipped: number; errors: number };
};

export type PlanGenerationInput = {
  productId: string;
  /** Raw request axes: attribute key (id or slug) -> value keys (ids or exact values). */
  attributes: Record<string, string[]>;
  /** Explicit allow-list; combinations not listed are reported as skipped. */
  allowList?: Array<Record<string, string>>;
  brandCode?: string;
  /** Single Brand AttributeValue id applied to every combination. */
  brandValueId?: string;
  categoryCode?: string;
  styleCode?: string;
  price?: number;
  compareAtPrice?: number;
};

export type PlanGenerationRecords = {
  productName: string;
  styleCode: string | null;
  categorySlug: string | null;
  categoryCode: string | null;
  categoryTemplate: string | null;
  attributes: Array<{ id: string; name: string; slug: string }>;
  values: ResolvedValue[];
  existingVariants: ExistingVariantRecord[];
};

/**
 * Map an attribute slug to its SKU template token.
 * Exact normalized match wins (`color` -> COLOR); otherwise a suffix match
 * covers scoped attributes (`shoe-size` -> SIZE) without hardcoding
 * category logic. Returns null for descriptive attributes (no token).
 */
export function tokenForAttributeSlug(slug: string): string | null {
  const normalized = slug.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!normalized) return null;
  if ((SKU_TEMPLATE_TOKENS as readonly string[]).includes(normalized)) return normalized;
  // Suffix match: SHOESIZE ends with SIZE, so shoe sizes feed {SIZE}.
  const candidates = (SKU_TEMPLATE_TOKENS as readonly string[]).filter(
    (token) => !IDENTITY_TOKENS.has(token) && normalized.endsWith(token) && normalized.length > token.length,
  );
  // Longest token wins on overlap.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? null;
}

/** Non-identity template tokens in template order = required variant dimensions. */
export function requiredDimensionTokens(template: string): string[] {
  return parseTemplateTokens(template).filter((token) => !IDENTITY_TOKENS.has(token));
}

/**
 * Canonical variant identity: productId + sorted `attributeId:valueId` pairs.
 * Two variants are equivalent when their keys match, regardless of SKU text.
 */
export function canonicalVariantKey(
  productId: string,
  pairs: Array<{ attributeId: string; attributeValueId: string }>,
): string {
  const parts = pairs.map((pair) => `${pair.attributeId}:${pair.attributeValueId}`).sort();
  return `${productId}|${parts.join('|')}`;
}

export function summarizeResult(partial: Omit<GenerationResult, 'summary'>): GenerationResult {
  return {
    ...partial,
    summary: {
      created: partial.created.length,
      existing: partial.existing.length,
      skipped: partial.skipped.length,
      errors: partial.errors.length,
    },
  };
}

function issue(code: string, message: string): GenerationIssue {
  return { code, message };
}

function findAttribute(
  attributes: PlanGenerationRecords['attributes'],
  key: string,
): PlanGenerationRecords['attributes'][number] | null {
  const normalized = key.trim().toLowerCase();
  return (
    attributes.find((attr) => attr.id === key.trim()) ??
    attributes.find((attr) => attr.slug.toLowerCase() === normalized) ??
    null
  );
}

function findValue(values: ResolvedValue[], attributeId: string, key: string): ResolvedValue | null {
  const trimmed = key.trim();
  return (
    values.find((value) => value.attributeId === attributeId && value.id === trimmed) ??
    values.find((value) => value.attributeId === attributeId && value.value.toLowerCase() === trimmed.toLowerCase()) ??
    null
  );
}

/**
 * AttributeValidator: resolve + validate request axes against the
 * category/product dictionary. Throws `{ issues }` on invalid input.
 */
export function validateAxes(
  input: PlanGenerationInput,
  records: PlanGenerationRecords,
  template: string,
): { axes: GenerationAxis[]; dimensionTokens: Map<string, string>; singleVariant: boolean } {
  const entries = Object.entries(input.attributes ?? {});
  const dimensionTokens = new Map<string, string>();

  if (entries.length === 0) {
    return { axes: [], dimensionTokens, singleVariant: true };
  }

  const seenAttributes = new Set<string>();
  const axes: GenerationAxis[] = [];
  for (const [rawKey, rawValues] of entries) {
    const attribute = findAttribute(records.attributes, rawKey);
    if (!attribute) {
      throw {
        issues: [issue('ATTRIBUTE_NOT_FOUND', `Unknown attribute "${rawKey}". Use an attribute id or slug configured in the catalogue.`)],
      };
    }
    if (seenAttributes.has(attribute.id)) {
      throw {
        issues: [issue('DUPLICATE_ATTRIBUTE', `Attribute "${attribute.name}" was selected more than once. Merge its values into a single list.`)],
      };
    }
    seenAttributes.add(attribute.id);

    const token = tokenForAttributeSlug(attribute.slug);
    const templateTokens = requiredDimensionTokens(template);
    if (!token || IDENTITY_TOKENS.has(token) || !templateTokens.includes(token)) {
      throw {
        issues: [
          issue(
            'ATTRIBUTE_NOT_VARIANT_DEFINING',
            `Attribute "${attribute.name}" is descriptive and does not define sellable variants for this category. Remove it from the variant selection.`,
          ),
        ],
      };
    }
    const owner = dimensionTokens.get(token);
    if (owner !== undefined && owner !== attribute.id) {
      const other = records.attributes.find((attr) => attr.id === owner);
      throw {
        issues: [
          issue(
            'AMBIGUOUS_ATTRIBUTE_TOKEN',
            `Attributes "${other?.name ?? 'unknown'}" and "${attribute.name}" both map to the {${token}} SKU segment. Select only one of them.`,
          ),
        ],
      };
    }
    dimensionTokens.set(token, attribute.id);

    if (!Array.isArray(rawValues) || rawValues.length === 0) {
      throw {
        issues: [issue('ATTRIBUTE_VALUES_REQUIRED', `Attribute "${attribute.name}" was selected without values. Provide at least one value or remove the attribute.`)],
      };
    }
    // Normalize: trim, drop empties, deduplicate before combination math.
    const deduped = [...new Set(rawValues.map((value) => value.trim()).filter((value) => value.length > 0))];
    if (deduped.length === 0) {
      throw {
        issues: [issue('ATTRIBUTE_VALUES_REQUIRED', `Attribute "${attribute.name}" has no usable values after normalization.`)],
      };
    }
    const valueIds: string[] = [];
    for (const key of deduped) {
      const resolved = findValue(records.values, attribute.id, key);
      if (!resolved) {
        throw {
          issues: [
            issue(
              'VALUE_NOT_FOUND',
              `Value "${key}" does not exist for attribute "${attribute.name}". Use a configured attribute value id or its exact value.`,
            ),
          ],
        };
      }
      if (!resolved.code) {
        throw {
          issues: [
            issue(
              'VALUE_MISSING_CODE',
              `Value "${resolved.value}" (${attribute.name}) has no dictionary code. Ask an administrator to assign a code before generating variants.`,
            ),
          ],
        };
      }
      if (!valueIds.includes(resolved.id)) valueIds.push(resolved.id);
    }
    axes.push({ attributeId: attribute.id, attributeSlug: attribute.slug, attributeName: attribute.name, valueIds });
  }

  // Required dimensions = non-identity template tokens. Every required token
  // must be covered by exactly one selected attribute.
  for (const token of requiredDimensionTokens(template)) {
    if (!dimensionTokens.has(token)) {
      const label = token.charAt(0) + token.slice(1).toLowerCase();
      throw {
        issues: [
          issue(
            'MISSING_REQUIRED_DIMENSION',
            `The ${label} attribute is required for this product category. Select at least one ${label} value.`,
          ),
        ],
      };
    }
  }

  return { axes, dimensionTokens, singleVariant: false };
}

/**
 * CombinationGenerator: cartesian product over validated axes, with optional
 * explicit allow-list restriction (commercially valid subset). Pure.
 */
export function planCombinations(
  axes: GenerationAxis[],
  allowList: PlanGenerationInput['allowList'],
  records: PlanGenerationRecords,
): { combos: string[][]; skippedCombos: string[][] } {
  if (axes.length === 0) return { combos: [[]], skippedCombos: [] };
  const axesRecord: Record<string, string[]> = {};
  for (const axis of axes) axesRecord[axis.attributeId] = axis.valueIds;
  const combos = buildVariantCombinations(axesRecord);
  if (combos.length > MAX_VARIANTS_PER_REQUEST) {
    throw {
      issues: [
        issue(
          'TOO_MANY_VARIANTS',
          `This selection would create more than ${MAX_VARIANTS_PER_REQUEST} variants, above the limit of ${MAX_VARIANTS_PER_REQUEST} per operation. Narrow the selection or split it into smaller batches.`,
        ),
      ],
    };
  }
  if (!allowList || allowList.length === 0) return { combos, skippedCombos: [] };

  const allowed = new Set<string>();
  for (const entry of allowList) {
    const parts: string[] = [];
    let valid = true;
    for (const axis of axes) {
      const rawKey = Object.keys(entry).find(
        (key) => key.trim() === axis.attributeId || key.trim().toLowerCase() === axis.attributeSlug.toLowerCase(),
      );
      if (!rawKey) {
        valid = false;
        break;
      }
      const resolved = findValue(records.values, axis.attributeId, entry[rawKey] as string);
      if (!resolved || !axis.valueIds.includes(resolved.id)) {
        valid = false;
        break;
      }
      parts.push(resolved.id);
    }
    if (valid) allowed.add(parts.join('|'));
  }
  if (allowed.size === 0) {
    throw {
      issues: [issue('ALLOW_LIST_EMPTY', 'The allow-list matched none of the generated combinations. Check that every entry uses selected attribute values.')],
    };
  }
  const kept = combos.filter((combo) => allowed.has(combo.join('|')));
  const skippedCombos = combos.filter((combo) => !allowed.has(combo.join('|')));
  return { combos: kept, skippedCombos };
}

function resolveBrandCode(
  input: PlanGenerationInput,
  records: PlanGenerationRecords,
): { code: string; valueId: string | null } {
  if (input.brandCode?.trim()) {
    return { code: normalizeSegment(input.brandCode), valueId: null };
  }
  const brandAttr = records.attributes.find((attr) => tokenForAttributeSlug(attr.slug) === 'BRAND');
  if (input.brandValueId) {
    const resolved = records.values.find((value) => value.id === input.brandValueId);
    if (!resolved || (brandAttr && resolved.attributeId !== brandAttr.id)) {
      throw { issues: [issue('INVALID_BRAND_VALUE', 'The provided brand value does not belong to the Brand attribute.')] };
    }
    if (!resolved.code) {
      throw { issues: [issue('VALUE_MISSING_CODE', `Value "${resolved.value}" (Brand) has no dictionary code. Assign a code before generating variants.`)] };
    }
    return { code: normalizeSegment(resolved.code), valueId: resolved.id };
  }
  if (brandAttr) {
    // Fall back to the product's established brand (most common Brand mapping).
    const counts = new Map<string, number>();
    for (const variant of records.existingVariants) {
      for (const mapping of variant.mappings) {
        if (mapping.attributeId === brandAttr.id) counts.set(mapping.attributeValueId, (counts.get(mapping.attributeValueId) ?? 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const resolved = records.values.find((value) => value.id === top);
    if (resolved?.code) return { code: normalizeSegment(resolved.code), valueId: resolved.id };
    // Single-candidate convenience: exactly one coded Brand value exists.
    const candidates = records.values.filter((value) => value.attributeId === brandAttr.id && value.code);
    if (candidates.length === 1 && candidates[0]?.code) {
      return { code: normalizeSegment(candidates[0].code as string), valueId: candidates[0].id };
    }
  }
  throw {
    issues: [
      issue(
        'MISSING_SKU_COMPONENT',
        'No brand code is available for SKU generation. Pass "brandCode" (e.g. "NKE") or a "brandValueId".',
      ),
    ],
  };
}

/**
 * Full planning pass: validate axes, generate combinations, resolve SKU
 * components through the Phase 1 SKU generator, and attach canonical
 * identity keys. Pure — no database access. Throws `{ issues }`.
 */
export function planGenerationFromRecords(
  productId: string,
  input: PlanGenerationInput,
  records: PlanGenerationRecords,
): {
  planned: PlannedCombination[];
  skippedPlanned: PlannedCombination[];
  template: string;
  singleVariant: boolean;
} {
  const requestedTemplate =
    records.categoryTemplate?.trim() || (records.categorySlug ? defaultSkuTemplate(records.categorySlug) : SINGLE_VARIANT_TEMPLATE);
  const singleVariant = Object.keys(input.attributes ?? {}).length === 0;
  const template = singleVariant ? SINGLE_VARIANT_TEMPLATE : requestedTemplate;
  const { axes, dimensionTokens } = validateAxes(input, records, template);

  const categoryCode = input.categoryCode?.trim()
    ? normalizeSegment(input.categoryCode)
    : records.categoryCode
      ? normalizeSegment(records.categoryCode)
      : null;
  if (!categoryCode) {
    throw {
      issues: [
        issue(
          'MISSING_CATEGORY_CODE',
          'This product has no category code for SKU generation. Assign the product to a coded category or pass "categoryCode".',
        ),
      ],
    };
  }
  const styleCode = input.styleCode?.trim()
    ? normalizeSegment(input.styleCode)
    : records.styleCode
      ? normalizeSegment(records.styleCode)
      : normalizeSegment(deriveStyleCode(records.productName));
  if (!styleCode) {
    throw { issues: [issue('MISSING_SKU_COMPONENT', 'No style/model code is available. Set a styleCode on the product or pass "styleCode".')] };
  }

  const { combos, skippedCombos } = planCombinations(axes, input.allowList, records);
  if (!singleVariant && combos.length === 0) {
    throw { issues: [issue('NO_COMBINATIONS', 'The allow-list excluded every combination. Nothing would be created.')] };
  }

  const valueById = new Map(records.values.map((value) => [value.id, value]));
  const attrById = new Map(records.attributes.map((attr) => [attr.id, attr]));
  // Attribute order follows template-token order for deterministic labels/keys.
  const tokenOrder = parseTemplateTokens(template);
  const orderedAxes = [...axes].sort((a, b) => {
    const tokenA = [...dimensionTokens.entries()].find(([, id]) => id === a.attributeId)?.[0] ?? '';
    const tokenB = [...dimensionTokens.entries()].find(([, id]) => id === b.attributeId)?.[0] ?? '';
    return tokenOrder.indexOf(tokenA) - tokenOrder.indexOf(tokenB);
  });

  const brand = resolveBrandCode(input, records);
  const brandAttr = records.attributes.find((attr) => tokenForAttributeSlug(attr.slug) === 'BRAND');

  const toPlanned = (combo: string[]): PlannedCombination => {
    const pairs = orderedAxes.map((axis) => {
      const index = axes.findIndex((candidate) => candidate.attributeId === axis.attributeId);
      return { attributeId: axis.attributeId, attributeValueId: combo[index] as string };
    });
    // Brand mapping is identity (storefront reads brand from variant
    // attributes) but never a SKU dimension beyond the {BRAND} segment.
    if (brand.valueId && brandAttr && !pairs.some((pair) => pair.attributeId === brandAttr.id)) {
      pairs.push({ attributeId: brandAttr.id, attributeValueId: brand.valueId });
    }
    const attributeSegments: Record<string, string> = {};
    for (const pair of pairs) {
      const attr = attrById.get(pair.attributeId);
      const token = attr ? tokenForAttributeSlug(attr.slug) : null;
      if (!token || IDENTITY_TOKENS.has(token)) continue;
      const resolved = valueById.get(pair.attributeValueId);
      if (!resolved?.code) {
        throw { issues: [issue('MISSING_SKU_COMPONENT', `Cannot resolve a SKU segment for "${attr?.name ?? pair.attributeId}".`)] };
      }
      attributeSegments[token] = normalizeSegment(resolved.code);
    }
    const generated = generateSku({ brandCode: brand.code, categoryCode, styleCode, attributeSegments, template });
    if (!generated.ok) {
      throw { issues: generated.errors.map((entry) => issue(entry.code, entry.message)) };
    }
    const label = singleVariant
      ? records.productName
      : pairs
          .filter((pair) => pair.attributeId !== brandAttr?.id)
          .map((pair) => valueById.get(pair.attributeValueId)?.value ?? pair.attributeValueId)
          .filter(Boolean)
          .join(' / ');
    return {
      key: canonicalVariantKey(productId, pairs),
      pairs,
      label,
      sku: generated.value,
      attributeSegments,
    };
  };

  const planned = combos.map(toPlanned);
  const skippedPlanned = skippedCombos.map(toPlanned);

  // Deterministic SKU collisions *within* the request indicate ambiguous
  // dictionary codes (two values sharing one code path).
  const seenSkus = new Map<string, string>();
  for (const item of planned) {
    const first = seenSkus.get(item.sku);
    if (first !== undefined && first !== item.key) {
      throw {
        issues: [
          issue(
            'SKU_COLLISION_IN_REQUEST',
            `Two combinations produce the same SKU ${item.sku}. Assign distinct dictionary codes to the colliding values.`,
          ),
        ],
      };
    }
    seenSkus.set(item.sku, item.key);
  }

  return { planned, skippedPlanned, template, singleVariant };
}

export function isGenerationIssues(error: unknown): error is { issues: GenerationIssue[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { issues?: unknown }).issues) &&
    ((error as { issues: unknown[] }).issues.length === 0 ||
      typeof (error as { issues: Array<{ code?: unknown }> }).issues[0]?.code === 'string')
  );
}
