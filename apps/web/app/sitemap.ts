import type { MetadataRoute } from 'next';

/**
 * Static-route sitemap only. Product/category/collection URLs require a
 * DB-backed sitemap once the production domain is finalized (Phase 15 prep).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com').replace(/\/$/, '');
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now },
    { url: `${base}/shop`, lastModified: now },
    { url: `${base}/search`, lastModified: now },
  ];
}
