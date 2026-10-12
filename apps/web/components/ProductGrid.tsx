import Link from 'next/link';

import type { Product } from '../lib/catalog';
import { ProductCard } from './ProductCard';
import { UIAlert } from './ui/alert';
import { Skeleton } from './ui/skeleton';
import { UICard, UICardBody } from './ui/card';

/**
 * Shared responsive product grid — the single grid foundation for home,
 * shop, search, category, collection, and related-product sections.
 * Uses the existing `.product-grid` layout tokens (2 cols small mobile →
 * 3–4 desktop, minmax(0,1fr) so 320px never overflows) with stable
 * product-id keys. Filtering/sorting/pagination stay owned by each page.
 */
export function ProductGrid({
  products,
  eagerCount = 0,
  label = 'Products',
}: {
  products: Product[];
  eagerCount?: number;
  label?: string;
}) {
  return (
    <div className="product-grid" role="list" aria-label={label}>
      {products.map((product, index) => (
        <div key={product.id} role="listitem" className="product-grid__item">
          <ProductCard product={product} eager={index < eagerCount} />
        </div>
      ))}
    </div>
  );
}

/** Skeleton matching the shadcn card geometry (4:5 media + lines + CTA). */
export function ProductCardSkeletonCard() {
  return (
    <UICard className="product-card flex h-full flex-col overflow-hidden" aria-hidden="true">
      <Skeleton label="Loading product image" className="product-card__media-skeleton" style={{ aspectRatio: '4 / 5' }} />
      <UICardBody className="product-card__body">
        <Skeleton label="Loading product details" />
      </UICardBody>
    </UICard>
  );
}

/** Grid of card skeletons with a polite loading announcement. */
export function ProductGridSkeleton({ count = 8, label = 'Loading products…' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      <div className="product-grid" aria-hidden="true">
        {Array.from({ length: count }).map((_, index) => (
          <ProductCardSkeletonCard key={index} />
        ))}
      </div>
    </div>
  );
}

/** Helpful empty state — distinct from fetch failures. */
export function ProductEmptyState({
  title = 'No products found',
  description = 'Try changing your search or adjusting your filters.',
  actionHref,
  actionLabel,
}: {
  title?: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state" role="status">
      <h2>{title}</h2>
      <p>{description}</p>
      {actionHref && actionLabel ? (
        <Link href={actionHref} className="button">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Inline fetch-failure alert — never presented as an empty catalogue.
 * `retryHref` keeps server pages link-based; client surfaces can pass
 * `onRetry` instead.
 */
export function ProductFetchError({
  title = 'Products unavailable',
  description = 'We couldn\u2019t load products. Please try again in a moment.',
  retryHref,
  retryLabel = 'Try again',
  onRetry,
}: {
  title?: string;
  description?: string;
  retryHref?: string;
  retryLabel?: string;
  onRetry?: () => void;
}) {
  return (
    <UIAlert
      tone="error"
      title={title}
      description={description}
      action={
        onRetry ? (
          <button type="button" className="button button--secondary button--small" onClick={onRetry}>
            {retryLabel}
          </button>
        ) : retryHref ? (
          <Link href={retryHref} className="button button--secondary button--small">
            {retryLabel}
          </Link>
        ) : undefined
      }
    />
  );
}
