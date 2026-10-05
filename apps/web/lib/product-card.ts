import { discountPercent, productInStock, type Product, type ProductVariant } from './catalog';

/**
 * Pure product-card helpers (framework-free, unit-testable).
 * All inputs come from the live catalogue adapter (`lib/storefront.ts`);
 * nothing here invents prices, discounts, ratings, or stock.
 */

export type CardBadge = 'sale' | 'out' | 'low' | 'new';

/**
 * Single badge priority: out-of-stock (purchase-blocking) > sale
 * (authoritative `compareAtPrice` math) > low stock (authoritative
 * `availableQuantity` scarcity) > new arrival (backend flag).
 * At most one badge — never a crowded stack.
 */
export function cardBadge(product: Product): CardBadge | null {
  if (!productInStock(product)) return 'out';
  if (discountPercent(product) !== null) return 'sale';
  if (lowStockQuantity(product) !== null) return 'low';
  if (product.newArrival) return 'new';
  return null;
}

/**
 * Quick-add target: only single-variant, in-stock products may be added
 * straight from the card. Anything requiring configuration returns null
 * so the card renders "Choose Options" → PDP instead of guessing.
 */
export function quickAddVariant(product: Product): ProductVariant | null {
  if (product.variants.length !== 1) return null;
  const [only] = product.variants;
  return only && only.inStock ? only : null;
}

/**
 * Presentational low-stock threshold over the authoritative
 * `availableQuantity`. Returns the lowest sellable quantity when at least
 * one in-stock variant is scarce (1–5 units), else null. Backend stays
 * authoritative; `5` is display-only and documented.
 */
export const LOW_STOCK_THRESHOLD = 5;

export function lowStockQuantity(product: Product): number | null {
  let lowest: number | null = null;
  for (const variant of product.variants) {
    const qty = variant.availableQuantity;
    if (!variant.inStock || qty === undefined || qty === null) continue;
    if (qty > 0 && qty <= LOW_STOCK_THRESHOLD && (lowest === null || qty < lowest)) {
      lowest = qty;
    }
  }
  return lowest;
}

const VARIANT_HINT_NOUNS: Record<string, string> = {
  Color: 'colours',
  Size: 'sizes',
  'Shoe Size': 'sizes',
  Capacity: 'capacities',
  Power: 'options',
  Material: 'materials',
  Style: 'styles',
  Brand: 'brands',
};

/**
 * Generic variant summary from real attribute data (never hard-coded
 * Size/Color assumptions): e.g. "3 colours", "5 sizes · 2 capacities".
 * Returns null when no attribute has more than one distinct value.
 */
export function variantHint(product: Product): string | null {
  const values = new Map<string, Set<string>>();
  for (const variant of product.variants) {
    for (const [attr, value] of Object.entries(variant.attributes)) {
      const clean = value.trim();
      if (!clean) continue;
      if (!values.has(attr)) values.set(attr, new Set());
      values.get(attr)!.add(clean);
    }
  }
  const parts: string[] = [];
  for (const [attr, set] of values) {
    if (set.size > 1) parts.push(`${set.size} ${VARIANT_HINT_NOUNS[attr] ?? 'options'}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Distinct `Color` attribute values across variants (real values only). */
export function cardColors(product: Product): string[] {
  const seen: string[] = [];
  for (const variant of product.variants) {
    const color = (variant.attributes['Color'] ?? '').trim();
    if (color && !seen.includes(color)) seen.push(color);
  }
  return seen;
}

export type RatingSummary = { average: number; count: number };

/** Real rating only: needs a backend average AND at least one review. */
export function ratingSummary(product: Product): RatingSummary | null {
  const average = product.rating?.average;
  const count = product.rating?.count ?? 0;
  if (average === null || average === undefined || count <= 0) return null;
  return { average, count };
}

/** Screen-reader label — the visual stars are supplemental. */
export function ratingAccessibleLabel(average: number, count: number, productName: string): string {
  const reviewWord = count === 1 ? 'review' : 'reviews';
  return `Rated ${average} out of 5 from ${count} ${reviewWord} for ${productName}`;
}

/** 0–100 fill for the 1-based star at `index` (partial-star rendering). */
export function starFillPercent(average: number, index: number): number {
  return Math.round(Math.max(0, Math.min(100, (average - (index - 1)) * 100)));
}
