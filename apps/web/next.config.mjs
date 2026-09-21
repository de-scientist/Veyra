/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // Static demo storefront imagery lives on Unsplash (see lib/storefront-data.ts).
  // Phase C: Cloudinary delivery host added for provider-hosted media.
  // Hostname-only (no wildcards); Unsplash pattern preserved for legacy assets.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  // Safe baseline headers. A strict Content-Security-Policy is intentionally
  // deferred: Next.js hydration requires nonce-based CSP architecture, which is
  // documented as Phase 15 work (see PHASE-14-REPORT).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
