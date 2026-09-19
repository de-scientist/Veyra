/**
 * Backward-compatibility shim: the storefront now reads from `lib/catalog.ts`
 * (multi-category JB Mercantile catalogue). Existing imports keep working.
 */
export type { ProductVariant, Product, Category, Collection } from './catalog';
export {
  products,
  categories,
  collections,
  getPublicProducts,
  getFeaturedProducts,
  getNewArrivals,
  getProductBySlug,
  getProductsByCategory,
  getProductsByCollection,
  getProductsByQuery,
  getCategoryBySlug,
  getCollectionBySlug,
  getAvailableProductsCount,
} from './catalog';
