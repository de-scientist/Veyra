/**
 * JB Mercantile catalogue layer (Phase E: database-backed).
 *
 * Shared shapes, static department pillars, attribute control registry,
 * URL-state helpers, and pure product math. Live products, categories, and
 * collections come from `lib/storefront.ts` (public `/catalog/*` API) —
 * never from hard-coded clothing-only assumptions or static demo arrays.
 */

export type DepartmentSlug = 'fashion' | 'footwear' | 'kitchen-home';

export type Department = {
  slug: DepartmentSlug;
  name: string;
  tagline: string;
  description: string;
  image: string;
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  department: DepartmentSlug;
  /** Parent category slug for nested departments (e.g. sneakers → footwear). */
  parentSlug?: string;
  image?: string;
};

export type AttributeControl = 'swatch' | 'option' | 'facet';

export type AttributeDef = {
  name: string;
  control: AttributeControl;
  /** Kind hint for filters/specs (e.g. EU shoe sizes vs apparel sizes). */
  kind: 'color' | 'apparel-size' | 'shoe-size' | 'capacity' | 'power' | 'material' | 'style' | 'brand' | 'generic';
};

export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  attributes: Record<string, string>;
  inStock: boolean;
  inventoryLabel?: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  department: DepartmentSlug;
  category: string;
  /** Display name of the category (resolved server-side from live data). */
  categoryName?: string | null;
  brand: string;
  featured: boolean;
  newArrival: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  price: number;
  compareAtPrice?: number;
  images: string[];
  /** Per-image alt text aligned with `images` (may be shorter). */
  imageAlts?: Array<string | null>;
  variants: ProductVariant[];
  createdAt: string;
  /** Static product-level facts (material, care) — never guarantees/warranties. */
  specs?: Record<string, string>;
};

export type Collection = {
  slug: string;
  name: string;
  description: string;
  image?: string | null;
  productIds: string[];
};

/* ---------------- Departments ---------------- */

export const departments: Department[] = [
  {
    slug: 'fashion',
    name: 'Fashion',
    tagline: 'Everyday clothing',
    description: 'Men, women and accessory staples — structured essentials built for daily wear.',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    tagline: 'Shoes for every step',
    description: 'Sneakers, casual and formal footwear for men and women.',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  },
  {
    slug: 'kitchen-home',
    name: 'Kitchen & Home',
    tagline: 'Cook, serve, settle in',
    description: 'Kitchen appliances, cookware and home essentials for modern Kenyan homes.',
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=900&q=80',
  },
];

/* ---------------- Categories (Phase E: database-backed via lib/storefront.ts) ---------------- */

/* ---------------- Attribute registry (control mapping) ---------------- */

export const ATTRIBUTE_REGISTRY: Record<string, AttributeDef> = {
  Color: { name: 'Color', control: 'swatch', kind: 'color' },
  Size: { name: 'Size', control: 'option', kind: 'apparel-size' },
  'Shoe Size': { name: 'Shoe Size', control: 'option', kind: 'shoe-size' },
  Capacity: { name: 'Capacity', control: 'option', kind: 'capacity' },
  Power: { name: 'Power', control: 'option', kind: 'power' },
  Material: { name: 'Material', control: 'facet', kind: 'material' },
  Style: { name: 'Style', control: 'facet', kind: 'style' },
  Brand: { name: 'Brand', control: 'facet', kind: 'brand' },
};

export function attributeDef(name: string): AttributeDef {
  return ATTRIBUTE_REGISTRY[name] ?? { name, control: 'facet', kind: 'generic' };
}

/** Approximate swatch colours for known colorways; unknown values fall back to neutral. */
const COLOR_HEX: Record<string, string> = {
  Black: '#1a1a1a', White: '#f5f5f5', Stone: '#d8cfc2', Olive: '#5b6236', Brown: '#7a4b2a',
  Beige: '#e3d3b8', Blue: '#1d4ed8', Red: '#c81e1e', Silver: '#b9c0cc', Nude: '#e0bfa4',
  Grey: '#6b7280', Gray: '#6b7280', Green: '#157a3d', Navy: '#1e3a8a',
};

export function colorHex(value: string): string | null {
  const direct = COLOR_HEX[value];
  if (direct) return direct;
  const lower = value.toLowerCase();
  const hit = Object.entries(COLOR_HEX).find(([key]) => lower.includes(key.toLowerCase()));
  return hit ? hit[1] : null;
}

/* ---------------- Products (Phase E: database-backed via lib/storefront.ts) ---------------- */

/* ---------------- Basic selectors (Phase E: database-backed via lib/storefront.ts) ---------------- */

export function getDepartmentBySlug(slug: string): Department | undefined {
  return departments.find((department) => department.slug === slug);
}

export function productInStock(product: Product): boolean {
  return product.variants.some((variant) => variant.inStock);
}

export function discountPercent(product: { price: number; compareAtPrice?: number }): number | null {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return null;
  return Math.round((1 - product.price / product.compareAtPrice) * 100);
}

/* ---------------- Discovery: category-aware filtering ---------------- */

export type DiscoveryQuery = {
  department?: DepartmentSlug;
  category?: string;
  /** Collection scope (path-driven on collection pages; never user-typed). */
  collection?: string;
  q?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'name' | 'newest';
  attrs?: Record<string, string[]>;
  inStockOnly?: boolean;
  page?: number;
};

export type Facet = {
  attribute: string;
  control: AttributeControl;
  values: Array<{ value: string; count: number }>;
};

export type PriceBucket = { label: string; min: number; max: number | null };

/** Parse URL search params into a DiscoveryQuery (shareable discovery state). */
export function parseDiscoveryQuery(params: Record<string, string | string[] | undefined>): DiscoveryQuery {
  const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const all = (v: string | string[] | undefined): string[] => {
    if (!v) return [];
    const raw = Array.isArray(v) ? v : [v];
    return raw.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  };
  const attrs: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (['department', 'category', 'collection', 'q', 'sort', 'inStock', 'page'].includes(key)) continue;
    const values = all(value);
    if (values.length) attrs[key] = values;
  }
  const sort = first(params.sort);
  const department = first(params.department);
  return {
    department: departments.some((d) => d.slug === department) ? (department as DepartmentSlug) : undefined,
    category: first(params.category),
    collection: first(params.collection),
    q: first(params.q),
    sort: sort === 'price-asc' || sort === 'price-desc' || sort === 'name' || sort === 'newest' ? sort : 'featured',
    attrs,
    inStockOnly: first(params.inStock) === 'true',
    page: Math.max(1, Number(first(params.page)) || 1),
  };
}

/** Serialize a DiscoveryQuery back to URL params (keeps URL ↔ UI ↔ results in sync). */
export function discoveryQueryString(query: DiscoveryQuery): string {
  const params = new URLSearchParams();
  if (query.department) params.set('department', query.department);
  if (query.category) params.set('category', query.category);
  if (query.collection) params.set('collection', query.collection);
  if (query.q) params.set('q', query.q);
  if (query.sort && query.sort !== 'featured') params.set('sort', query.sort);
  if (query.attrs) {
    for (const [key, values] of Object.entries(query.attrs)) {
      if (values.length) params.set(key, values.join(','));
    }
  }
  if (query.inStockOnly) params.set('inStock', 'true');
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/* ---------------- Live data (Phase E) ---------------- */
/**
 * Products, categories, and collections are database-backed via
 * `lib/storefront.ts` (public `/catalog/*` API). This module keeps the
 * shared shapes, static department pillars, attribute control registry,
 * URL-state helpers, and pure product math.
 */
