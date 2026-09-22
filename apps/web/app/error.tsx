'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Storefront error boundary (Phase G): catalogue API outages on
 * shop/search/category/collection/product routes render a recoverable
 * state — retry + navigation fallback, never stack traces or internals.
 */
export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side visibility only; no sensitive payload is logged.
    console.error('Storefront route error:', error.message);
  }, [error]);

  return (
    <main className="container page-shell">
      <div className="empty-state" role="alert">
        <h1>Something went wrong</h1>
        <p>
          We couldn&apos;t load this page right now. Check your connection and
          try again, or continue browsing the store.
        </p>
        <div className="cta-row">
          <button type="button" className="button" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/shop" className="button button--secondary">
            Browse all products
          </Link>
        </div>
      </div>
    </main>
  );
}
