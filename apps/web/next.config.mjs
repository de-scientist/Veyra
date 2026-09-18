/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
  },
  // Static demo storefront imagery lives on Unsplash (see lib/storefront-data.ts).
  // Production product media should extend this list (e.g. Cloudinary) via deployment config.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
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
