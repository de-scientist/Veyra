import Link from 'next/link';
import type { Route } from 'next';
import { useId } from 'react';

import { PriceDisplay } from './PriceDisplay';
import { ProductCardActions } from './ProductCardActions';
import { ProductImage } from './ProductImage';
import { ProductRating } from './ProductRating';
import { WishlistButton } from './WishlistButton';
import { UICard, UICardBody } from './ui/card';
import { UIBadge } from './ui/badge';
import type { UIBadgeTone } from './ui/badge';
import { cn } from '../lib/cn';
import {
  cardBadge,
  cardColors,
  lowStockQuantity,
  ratingSummary,
  variantHint,
  type CardBadge,
} from '../lib/product-card';
import {
  colorHex,
  discountPercent,
  getDepartmentBySlug,
  productInStock,
  type Product,
} from '../lib/catalog';

const BADGE_TONE: Record<CardBadge, UIBadgeTone> = {
  sale: 'red',
  low: 'amber',
  new: 'blue',
  out: 'neutral',
};

function badgeLabel(
  badge: CardBadge,
  discount: number | null,
  lowQty: number | null,
): string {
  if (badge === 'sale' && discount) return `-${discount}%`;
  if (badge === 'low' && lowQty !== null) return `Only ${lowQty} left`;
  if (badge === 'new') return 'New';
  return 'Out of stock';
}

/**
 * Shared shadcn product card — the single card foundation for home,
 * shop, search, category, collection, and related-product grids.
 *
 * Structure: shadcn `UICard` → media (image link + `UIBadge` + wishlist
 * overlay, all siblings — never nested interactives) → `UICardBody`
 * (meta, h3 title link, rating, colors, price, stock, action pinned via
 * `margin-top: auto`). All commerce state comes from the live catalogue
 * adapter (`lib/storefront.ts`); cart/wishlist live in the `*Actions` /
 * `WishlistButton` client islands. No mock data, no second product model.
 */
export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  // Per-instance id: the same product can appear twice on a page
  // (e.g. featured + new arrivals), so the raw product id is unsafe here.
  const titleId = useId();
  const [primaryImage, hoverImage] = product.images;
  const badge = cardBadge(product);
  const discount = discountPercent(product);
  const inStock = productInStock(product);
  // Category display name arrives resolved from live data; the department
  // pillar stays a static lookup.
  const categoryName = product.categoryName ?? product.category;
  const department = getDepartmentBySlug(product.department);
  const variantCount = product.variants.length;
  const rating = ratingSummary(product);
  const lowQty = lowStockQuantity(product);
  const colors = cardColors(product);
  const hint = variantHint(product);
  const productUrl = `/products/${product.slug}` as Route;

  const stockText = !inStock
    ? 'Out of stock'
    : lowQty !== null
      ? `Only ${lowQty} left`
      : `In stock${variantCount > 1 ? ` · ${variantCount} options` : ''}`;

  return (
    <UICard
      className={cn('product-card', 'flex h-full flex-col overflow-hidden')}
    >
      <article aria-labelledby={titleId} className="flex h-full flex-col">
        <div className="product-card__media">
          <Link href={productUrl} aria-label={`View ${product.name}`} className="product-card__media-link" tabIndex={-1}>
            {primaryImage ? (
              <>
                <ProductImage src={primaryImage} alt={product.name} eager={eager} />
                {hoverImage && hoverImage !== primaryImage ? (
                  <span className="product-card__hover" aria-hidden="true">
                    <ProductImage src={hoverImage} alt="" />
                  </span>
                ) : null}
              </>
            ) : (
              <div className="product-card__placeholder">Image unavailable</div>
            )}
          </Link>
          {badge ? (
            <UIBadge tone={BADGE_TONE[badge]} className="product-card__badge">
              {badgeLabel(badge, discount, lowQty)}
            </UIBadge>
          ) : null}
          <div className="product-card__wishlist">
            <WishlistButton productId={product.id} productName={product.name} />
          </div>
        </div>
        <UICardBody className="product-card__body">
          <p className="product-card__meta">
            {department ? <span className="product-card__dept">{department.name}</span> : null}
            {department ? ' · ' : null}
            {categoryName}
          </p>
          <h3 className="product-card__title" id={titleId}>
            <Link href={productUrl} title={product.name}>{product.name}</Link>
          </h3>
          {rating ? (
            <ProductRating average={rating.average} count={rating.count} productName={product.name} />
          ) : null}
          {colors.length > 0 ? (
            <p className="product-card__colors">
              <span className="product-card__swatches" aria-hidden="true">
                {colors.slice(0, 4).map((color) => (
                  <span
                    key={color}
                    className="product-card__swatch"
                    style={colorHex(color) ? { background: colorHex(color) as string } : undefined}
                    title={color}
                  />
                ))}
                {colors.length > 4 ? <span className="product-card__more">+{colors.length - 4}</span> : null}
              </span>
              <span className="visually-hidden">Available in {colors.join(', ')}</span>
            </p>
          ) : null}
          <PriceDisplay price={product.price} compareAtPrice={product.compareAtPrice} className="product-card__price" />
          <span className={`product-card__stock ${!inStock ? 'product-card__stock--out' : lowQty !== null ? 'product-card__stock--low' : 'product-card__stock--in'}`}>
            {stockText}
          </span>
          {hint ? <span className="product-card__hint">{hint}</span> : null}
          <ProductCardActions product={product} />
        </UICardBody>
      </article>
    </UICard>
  );
}
