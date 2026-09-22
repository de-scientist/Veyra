/**
 * Database-backed storefront data layer (Phase E).
 * Server-only: fetches the public catalogue API and adapts rows to the
 * `lib/catalog.ts` shapes the UI already renders, so pages, cards, filters
 * and product UX required no rewrite — only this data source changed.
 * Departments remain static brand pillars; everything else is live data
 * (ISR-cached for 60s).
 */

import {
  attributeDef,
  departments,
  type Category,
  type Collection,
  type DepartmentSlug,
  type DiscoveryQuery,
  type Facet,
  type PriceBucket,
  type Product,
  type ProductVariant,
} from './catalog';

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const REVALIDATE_SECONDS = 60;

type ApiCategoryNode = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  productCount: number;
  children: ApiCategoryNode[];
};

type ApiCollection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  productCount: number;
  coverImage: string | null;
};

type ApiVariant = {
  id: string;
  sku: string;
  name: string | null;
  price: number;
  compareAtPrice: number | null;
  attributes: Record<string, string>;
  availableQuantity: number;
  inStock: boolean;
};

type ApiProduct = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string | null;
  brand: string | null;
  category: { id: string; name: string; slug: string; parentId: string | null } | null;
  department: string | null;
  featured: boolean;
  newArrival: boolean;
  price: number;
  compareAtPrice: number | null;
  images: Array<{ url: string; altText: string | null }>;
  variants: ApiVariant[];
  rating: { average: number | null; count: number };
  createdAt: string;
};

type DiscoveryResponse = {
  products: ApiProduct[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
  facets: Array<{ attribute: string; values: Array<{ value: string; count: number }> }>;
  priceBuckets: PriceBucket[];
};

export type Suggestion = { type: 'product' | 'category' | 'collection'; label: string; href: string };

async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase}/api/v1${path}`, { next: { revalidate: REVALIDATE_SECONDS } });
  if (!response.ok) {
    const error = new Error(`Storefront request failed: ${path}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

function toProductVariant(variant: ApiVariant): ProductVariant {
  return {
    id: variant.id,
    sku: variant.sku,
    name: variant.name ?? variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? undefined,
    attributes: variant.attributes,
    inStock: variant.inStock,
  };
}

function toProduct(row: ApiProduct): Product {
  const firstAttributes = row.variants[0]?.attributes ?? {};
  const specs: Record<string, string> = {};
  for (const [key, value] of Object.entries(firstAttributes)) {
    if (key !== 'Brand') specs[key] = value;
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.shortDescription,
    description: row.description ?? row.shortDescription,
    department: (departments.some((d) => d.slug === row.department) ? row.department : 'fashion') as DepartmentSlug,
    category: row.category?.slug ?? 'uncategorized',
    categoryName: row.category?.name ?? null,
    brand: row.brand ?? 'JB Mercantile',
    featured: row.featured,
    newArrival: row.newArrival,
    status: 'ACTIVE',
    price: row.price,
    compareAtPrice: row.compareAtPrice ?? undefined,
    images: row.images.map((image) => image.url),
    imageAlts: row.images.map((image) => image.altText),
    variants: row.variants.map(toProductVariant),
    createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date(row.createdAt).toISOString(),
    specs,
  };
}

function toFacet(facet: DiscoveryResponse['facets'][number]): Facet {
  // Presentation control mapping stays in catalog.ATTRIBUTE_REGISTRY.
  return { attribute: facet.attribute, control: attributeDef(facet.attribute).control, values: facet.values };
}

function flattenCategories(nodes: ApiCategoryNode[], pillar: string, parentSlug?: string): Category[] {
  const out: Category[] = [];
  for (const node of nodes) {
    out.push({
      slug: node.slug,
      name: node.name,
      description: node.description ?? '',
      department: pillar as DepartmentSlug,
      parentSlug,
    });
    out.push(...flattenCategories(node.children, pillar, node.slug));
  }
  return out;
}

let categoryCache: { at: number; tree: ApiCategoryNode[] } | null = null;

async function categoryTree(): Promise<ApiCategoryNode[]> {
  // In-request + short-lived process memo: pages fetch categories several
  // times per render; the underlying fetch is ISR-cached regardless.
  if (categoryCache && Date.now() - categoryCache.at < 30_000) return categoryCache.tree;
  const tree = await apiGet<ApiCategoryNode[]>('/catalog/categories');
  categoryCache = { at: Date.now(), tree };
  return tree;
}

function pillarOf(tree: ApiCategoryNode[], slug: string): string | null {
  for (const node of tree) {
    if (node.slug === slug) return node.slug;
    const childPillars = node.children.map((child) => pillarOf([child], slug)).filter(Boolean);
    if (childPillars.length) return node.slug;
  }
  return null;
}

export async function getCategories(): Promise<Category[]> {
  const tree = await categoryTree();
  const flat: Category[] = [];
  for (const pillar of tree) {
    flat.push({
      slug: pillar.slug,
      name: pillar.name,
      description: pillar.description ?? '',
      department: (departments.some((d) => d.slug === pillar.slug) ? pillar.slug : 'fashion') as DepartmentSlug,
    });
    flat.push(...flattenCategories(pillar.children, pillar.slug, pillar.slug));
  }
  return flat;
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const tree = await categoryTree();
  const pillar = pillarOf(tree, slug);
  if (!pillar) return undefined;
  return (await getCategories()).find((category) => category.slug === slug);
}

export async function getSubcategories(slug: string): Promise<Category[]> {
  return (await getCategories()).filter((category) => category.parentSlug === slug);
}

export async function getDepartmentCategories(slug: DepartmentSlug): Promise<Category[]> {
  const tree = await categoryTree();
  const pillar = tree.find((node) => node.slug === slug);
  if (!pillar) return [];
  return flattenCategories(pillar.children, pillar.slug, pillar.slug).filter((category) => category.parentSlug === slug);
}

export async function getCollections(): Promise<Collection[]> {
  const rows = await apiGet<ApiCollection[]>('/catalog/collections');
  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    image: row.coverImage,
    productIds: [],
  }));
}

export async function getCollectionBySlug(slug: string): Promise<Collection | undefined> {
  return (await getCollections()).find((collection) => collection.slug === slug);
}

function discoveryParams(query: DiscoveryQuery, extra?: Record<string, string | number>): string {
  const params = new URLSearchParams();
  if (query.department) params.set('category', query.department);
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
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export type DiscoveryResult = {
  items: Product[];
  facets: Facet[];
  priceBuckets: PriceBucket[];
  page: number;
  totalPages: number;
  total: number;
};

export async function discoverProducts(
  query: DiscoveryQuery,
  opts?: { maxPrice?: number | null; pageSize?: number },
): Promise<DiscoveryResult> {
  const extra: Record<string, string | number> = {};
  if (opts?.maxPrice != null) extra.maxPrice = opts.maxPrice;
  if (opts?.pageSize) extra.pageSize = opts.pageSize;
  const data = await apiGet<DiscoveryResponse>(`/catalog/products${discoveryParams(query, extra)}`);
  return {
    items: data.products.map(toProduct),
    facets: data.facets.map(toFacet),
    priceBuckets: data.priceBuckets,
    page: data.pagination.page,
    totalPages: data.pagination.totalPages,
    total: data.pagination.total,
  };
}

export async function getPublicProducts(pageSize = 48): Promise<Product[]> {
  const data = await apiGet<DiscoveryResponse>(`/catalog/products?pageSize=${pageSize}`);
  return data.products.map(toProduct);
}

export async function getFeaturedProducts(limit = 4): Promise<Product[]> {
  const data = await apiGet<DiscoveryResponse>(`/catalog/products?collection=featured&pageSize=${limit}`);
  return data.products.map(toProduct).slice(0, limit);
}

export async function getNewArrivals(limit = 4): Promise<Product[]> {
  const data = await apiGet<DiscoveryResponse>(`/catalog/products?sort=newest&pageSize=${limit}`);
  return data.products.map(toProduct).slice(0, limit);
}

export async function getProductsByDepartment(department: DepartmentSlug, limit = 4): Promise<Product[]> {
  const data = await apiGet<DiscoveryResponse>(`/catalog/products?category=${department}&pageSize=${limit}`);
  return data.products.map(toProduct).slice(0, limit);
}

export async function getProductsByCategory(slug: string, limit = 48): Promise<Product[]> {
  const data = await apiGet<DiscoveryResponse>(`/catalog/products?category=${slug}&pageSize=${limit}`);
  return data.products.map(toProduct);
}

export async function getProductsByCollection(slug: string, sort?: string): Promise<Product[]> {
  const sortParam = sort && sort !== 'featured' ? `&sort=${sort}` : '';
  const data = await apiGet<DiscoveryResponse>(`/catalog/products?collection=${slug}&pageSize=48${sortParam}`);
  return data.products.map(toProduct);
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    return toProduct(await apiGet<ApiProduct>(`/catalog/products/${encodeURIComponent(slug)}`));
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
}

export async function getSearchSuggestions(query: string): Promise<Suggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    return await apiGet<Suggestion[]>(`/catalog/suggest?q=${encodeURIComponent(query.trim())}`);
  } catch {
    return [];
  }
}

export function getDepartmentBySlug(slug: string) {
  return departments.find((department) => department.slug === slug);
}
