import type { MetadataRoute } from 'next';

import { categories, collections, departments, getPublicProducts } from '../lib/catalog';

/**
 * Catalogue sitemap is generated from the live catalogue module (departments,
 * categories, collections, products). When merchandising moves to DB-backed
 * products, this module reads the same source — no sitemap rewrite needed.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com').replace(/\/$/, '');
  const now = new Date();
  const staticRoutes = ['', '/shop', '/search', '/login', '/register'];
  const departmentRoutes = departments.map((department) => `/shop?department=${department.slug}`);
  const categoryRoutes = categories.map((category) => `/categories/${category.slug}`);
  const collectionRoutes = collections.map((collection) => `/collections/${collection.slug}`);
  const productRoutes = getPublicProducts().map((product) => `/products/${product.slug}`);
  return [...staticRoutes, ...departmentRoutes, ...categoryRoutes, ...collectionRoutes, ...productRoutes].map((route) => ({
    url: `${base}${route}`,
    lastModified: now,
  }));
}
