import type { MetadataRoute } from 'next';

import { departments } from '../lib/catalog';
import { getCategories, getCollections, getPublicProducts } from '../lib/storefront';

/**
 * Catalogue sitemap generated from live database content (departments are
 * static pillars; categories, collections, products come from the API).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com').replace(/\/$/, '');
  const now = new Date();
  const staticRoutes = ['', '/shop', '/search', '/login', '/register'];
  const [categories, collections, products] = await Promise.all([
    getCategories().catch(() => []),
    getCollections().catch(() => []),
    getPublicProducts().catch(() => []),
  ]);
  const departmentRoutes = departments.map((department) => `/shop?department=${department.slug}`);
  const categoryRoutes = categories.map((category) => `/categories/${category.slug}`);
  const collectionRoutes = collections.map((collection) => `/collections/${collection.slug}`);
  const productRoutes = products.map((product) => `/products/${product.slug}`);
  return [...staticRoutes, ...departmentRoutes, ...categoryRoutes, ...collectionRoutes, ...productRoutes].map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
  }));
}
