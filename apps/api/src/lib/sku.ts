/**
 * SKU domain foundation (Phase 1).
 *
 * Server-authoritative, deterministic SKU generation. Pure functions only —
 * no Prisma imports here so generation stays separate from persistence
 * (routes own transactions; this module owns math + strings).
 *
 * Canonical SKU form: UPPER alnum segments joined by `-`, max 32 chars.
 * Example: NKE-SHO-AM90-BLK-42
 */

export const SKU_MAX_LENGTH = 32;
export const SKU_MIN_LENGTH = 3;
export const SKU_PATTERN = /^[A-Z0-9]+(-[A-Z0-9]+)*$/;
export const CODE_PATTERN = /^[A-Z0-9]{2,6}$/;
export const SIZE_CODE_PATTERN = /^[A-Z0-9]{1,6}$/;
export const STYLE_CODE_PATTERN = /^[A-Z0-9]{2,10}$/;
export const BARCODE_PATTERN = /^[0-9A-Za-z.\- ]{8,48}$/;
export const CATEGORY_CODE_PATTERN = /^[A-Z0-9]{2,5}$/;
export const MAX_VARIANTS_PER_REQUEST = 300;

/** Whitelisted template tokens. MODEL is an alias of STYLE. */
export const SKU_TEMPLATE_TOKENS = [
  'BRAND',
  'CATEGORY',
  'STYLE',
  'MODEL',
  'COLOR',
  'SIZE',
  'MATERIAL',
  'CAPACITY',
  'POWER',
  'VOLTAGE',
  'STORAGE',
  'RAM',
  'SHADE',
  'PACK',
  'DIAMETER',
  'FIT',
  'GENDER',
] as const;

export type SkuTemplateToken = (typeof SKU_TEMPLATE_TOKENS)[number];

export type SkuIssue = { code: string; message: string };
export type SkuResult<T> = { ok: true; value: T } | { ok: false; errors: SkuIssue[] };

export function fail(message: string, code = 'INVALID_SKU_COMPONENT'): SkuResult<never> {
  return { ok: false, errors: [{ code, message }] };
}

/** Uppercase, trim, collapse inner whitespace to nothing for code comparison. */
export function normalizeName(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

/** Normalize a single SKU segment: UPPER alnum only, stripped of separators. */
export function normalizeSegment(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalize a full candidate SKU: UPPER, whitespace/underscores become `-`,
 * invalid chars removed, duplicate separators collapsed, edges trimmed.
 */
export function normalizeSku(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function validateSkuFormat(sku: string): SkuResult<string> {
  const normalized = normalizeSku(sku);
  if (normalized.length < SKU_MIN_LENGTH) {
    return fail(`SKU must be at least ${SKU_MIN_LENGTH} characters.`, 'INVALID_SKU');
  }
  if (normalized.length > SKU_MAX_LENGTH) {
    return fail(`SKU must be at most ${SKU_MAX_LENGTH} characters (got ${normalized.length}).`, 'INVALID_SKU');
  }
  if (!SKU_PATTERN.test(normalized)) {
    return fail('SKU may only contain A-Z, 0-9 and single `-` separators.', 'INVALID_SKU');
  }
  return { ok: true, value: normalized };
}

export function validateDictionaryCode(code: string, kind: 'brand' | 'category' | 'color' | 'size' | 'style' | 'generic' = 'generic'): SkuResult<string> {
  const normalized = normalizeSegment(code);
  const pattern = kind === 'category' ? CATEGORY_CODE_PATTERN : kind === 'style' ? STYLE_CODE_PATTERN : kind === 'size' ? SIZE_CODE_PATTERN : CODE_PATTERN;
  if (!pattern.test(normalized)) {
    return fail(`Invalid ${kind} code "${code}". Use uppercase A-Z0-9 (${pattern}).`, 'INVALID_SKU_COMPONENT');
  }
  return { ok: true, value: normalized };
}

/**
 * Manual/legacy SKU boundary: normalize + pattern-check, accepting the
 * pre-existing API contract of 3-64 chars. Generator output is always
 * <= SKU_MAX_LENGTH (32); legacy rows up to 64 keep working untouched.
 */
export function validateManualSku(sku: string): SkuResult<string> {
  const normalized = normalizeSku(sku);
  if (normalized.length < SKU_MIN_LENGTH || normalized.length > 64) {
    return fail('SKU must be 3-64 characters after normalization.', 'INVALID_SKU');
  }
  if (!SKU_PATTERN.test(normalized)) {
    return fail('SKU may only contain A-Z, 0-9 and single `-` separators.', 'INVALID_SKU');
  }
  return { ok: true, value: normalized };
}

export function validateBarcode(barcode: string): SkuResult<string> {
  const normalized = barcode.trim();
  if (!BARCODE_PATTERN.test(normalized)) {
    return fail('Invalid barcode. Use 8-48 characters of A-Z, a-z, 0-9, dot, dash or space.', 'INVALID_SKU_COMPONENT');
  }
  return { ok: true, value: normalized };
}

/**
 * Deterministic fallback code derived from a display name.
 * Given the same (name, taken) inputs it always returns the same code —
 * no random numbers, timestamps or UUID fragments.
 *
 * Strategy: cleaned alnum UPPER -> first3, first4, first5, then PREFIX-N.
 * Callers pass codes already taken in the scope (e.g. sibling colors)
 * so Blue -> BLU forces Blush -> BLUS deterministically.
 */
export function deriveCode(name: string, taken: Iterable<string> = [], maxLen = 6): string {
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  const cleaned = normalizeSegment(name);
  const base = cleaned.length === 0 ? 'X' : cleaned;
  if (base.length <= 3 && !used.has(base)) return base;
  for (const len of [3, 4, 5, maxLen]) {
    if (base.length >= len) {
      const candidate = base.slice(0, Math.min(len, maxLen));
      if (!used.has(candidate)) return candidate;
    }
  }
  const prefix = base.slice(0, Math.max(2, maxLen - 2));
  for (let n = 1; n < 1000; n += 1) {
    const candidate = `${prefix}${n}`.slice(0, maxLen);
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}999`.slice(0, maxLen);
}

/**
 * Deterministic style/model code from a product name.
 * "Nike Air Max 90" -> AM90 (brand words are NOT special-cased; caller may
 * strip a leading brand word before calling). "Classic Black Hoodie" -> CBH.
 */
export function deriveStyleCode(productName: string, brandName?: string): string {
  let words = productName.trim().split(/\s+/).filter(Boolean);
  if (brandName) {
    const brandFirst = brandName.trim().split(/\s+/)[0]?.toUpperCase();
    if (brandFirst && words.length > 1 && words[0]?.toUpperCase() === brandFirst) {
      words = words.slice(1);
    }
  }
  let letters = '';
  let digits = '';
  for (const word of words) {
    const cleaned = normalizeSegment(word);
    if (cleaned.length === 0) continue;
    if (/^[0-9]+$/.test(cleaned)) {
      digits += cleaned;
    } else {
      letters += cleaned[0] ?? '';
    }
  }
  const code = `${letters}${digits}`.slice(0, 10);
  return code.length >= 2 ? code : deriveCode(productName, [], 6);
}

/** Extract `{TOKEN}` placeholders in order. */
export function parseTemplateTokens(template: string): string[] {
  const matches = template.match(/\{([A-Z]+)\}/g) ?? [];
  return matches.map((m) => m.slice(1, -1));
}

export function validateSkuTemplate(template: string): SkuResult<string> {
  const trimmed = template.trim();
  if (trimmed.length === 0 || trimmed.length > 120) {
    return fail('SKU template must be 1-120 characters.', 'INVALID_SKU_COMPONENT');
  }
  const tokens = parseTemplateTokens(trimmed);
  if (tokens.length < 2) {
    return fail('SKU template must contain at least two {TOKENS}.', 'INVALID_SKU_COMPONENT');
  }
  const allowed = new Set<string>(SKU_TEMPLATE_TOKENS);
  for (const token of tokens) {
    if (!allowed.has(token)) {
      return fail(`Unknown SKU template token {${token}}. Allowed: ${SKU_TEMPLATE_TOKENS.join(', ')}.`, 'INVALID_SKU_COMPONENT');
    }
  }
  const remainder = trimmed.replace(/\{[A-Z]+\}/g, '').replace(/[-_ ]/g, '');
  if (remainder.length > 0) {
    return fail('SKU template may only contain {TOKENS} joined by `-` separators.', 'INVALID_SKU_COMPONENT');
  }
  const seen = new Set<string>();
  for (const token of tokens) {
    const key = token === 'MODEL' ? 'STYLE' : token;
    if (seen.has(key)) {
      return fail(`Duplicate SKU template token {${token}}.`, 'INVALID_SKU_COMPONENT');
    }
    seen.add(key);
  }
  return { ok: true, value: trimmed };
}

/**
 * Default SKU template for a category slug. Stored templates on Category
 * always win; this is only the fallback for categories without one.
 */
export function defaultSkuTemplate(categorySlug: string): string {
  const slug = categorySlug.toLowerCase();
  if (/(appliance|kettle|blender|microwave|fridge|cooker|electronics|phone)/.test(slug)) {
    return '{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}';
  }
  if (/(utensil|cookware|pot|pan|knife|home|duvet|bedding)/.test(slug)) {
    return '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}';
  }
  return '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}';
}

export type GenerateSkuInput = {
  brandCode: string;
  categoryCode: string;
  styleCode: string;
  /** Segment key (template token without braces) -> resolved code. */
  attributeSegments: Record<string, string>;
  template?: string;
};

/**
 * Deterministic SKU renderer. Same valid inputs -> same SKU, always.
 * Generation never touches the database; callers enforce uniqueness.
 */
export function generateSku(input: GenerateSkuInput): SkuResult<string> {
  const templateCheck = validateSkuTemplate(input.template ?? '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}');
  if (!templateCheck.ok) return templateCheck;
  const template = templateCheck.value;

  const brand = normalizeSegment(input.brandCode);
  const category = normalizeSegment(input.categoryCode);
  const style = normalizeSegment(input.styleCode);
  if (!brand || !category || !style) {
    return fail('Missing SKU component: brand, category and style codes are all required.', 'MISSING_SKU_COMPONENT');
  }

  const segments: Record<string, string> = { BRAND: brand, CATEGORY: category, STYLE: style, MODEL: style };
  for (const [rawKey, rawValue] of Object.entries(input.attributeSegments)) {
    const key = rawKey.trim().toUpperCase();
    const code = normalizeSegment(rawValue);
    if (!code) {
      return fail(`Missing SKU component: empty code for {${key}}.`, 'MISSING_SKU_COMPONENT');
    }
    segments[key] = code;
  }

  const tokens = parseTemplateTokens(template);
  const parts: string[] = [];
  for (const token of tokens) {
    const part = segments[token];
    if (!part) {
      return fail(`Missing SKU component for template token {${token}}.`, 'MISSING_SKU_COMPONENT');
    }
    parts.push(part);
  }
  return validateSkuFormat(parts.join('-'));
}

/**
 * Cartesian variant combination engine. Axes map attribute slug -> valueIds.
 * Returns explicit id-lists; callers allow-list instead when combos are
 * restricted (e.g. only certain voltage/color pairs).
 */
export function buildVariantCombinations(axes: Record<string, string[]>): string[][] {
  const entries = Object.entries(axes).filter(([, ids]) => ids.length > 0);
  if (entries.length === 0) return [];
  let combos: string[][] = [[]];
  for (const [, ids] of entries) {
    const next: string[][] = [];
    const uniqueIds = [...new Set(ids)];
    for (const combo of combos) {
      for (const id of uniqueIds) {
        next.push([...combo, id]);
      }
    }
    combos = next;
    if (combos.length > MAX_VARIANTS_PER_REQUEST) {
      return combos.slice(0, MAX_VARIANTS_PER_REQUEST + 1);
    }
  }
  return combos;
}

/** Map a Prisma P2002 target to a structured SKU/barcode conflict. */
export function skuConflictFromPrismaTarget(target: unknown): { code: string; message: string } | null {
  const fields = Array.isArray(target) ? target.map(String) : [];
  if (fields.includes('sku')) {
    return { code: 'SKU_ALREADY_EXISTS', message: 'This SKU already exists. Correct the conflicting codes or use a distinct style/model code.' };
  }
  if (fields.includes('barcode')) {
    return { code: 'BARCODE_ALREADY_EXISTS', message: 'This barcode is already assigned to another variant.' };
  }
  if (fields.includes('code')) {
    return { code: 'CODE_ALREADY_EXISTS', message: 'This dictionary code is already in use in the same scope.' };
  }
  return null;
}
