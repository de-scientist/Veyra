import type { MetadataRoute } from 'next';

/**
 * Public catalogue is crawlable; account, checkout, admin, and API surfaces
 * are disallowed. Product-level URLs belong in a future DB-backed sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/shop', '/search', '/products/', '/categories/', '/collections/'],
        disallow: ['/admin/', '/account/', '/checkout/', '/cart/', '/wishlist/', '/order-confirmation/', '/api/'],
      },
    ],
  };
}
