import Link from 'next/link';
import type { Route } from 'next';
import { useId } from 'react';

import { PriceDisplay } from './PriceDisplay';
import { ProductCardActions } from './ProductCardActions';
import { ProductImage } from './ProductImage';
import { ProductRating } from './ProductRating';
import { WishlistButton } from './WishlistButton';
import {
  cardBadge,
  cardColors,
  lowStockQuantity,
  ratingSummary,
} from '../lib/product-card';
import {
  colorHex,
  discountPercent,
  getDepartmentBySlug,
  productInStock,
  type Product,
} from '../lib/catalog';

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
  const productUrl = `/products/${product.slug}` as Route;

  const stockText = !inStock
    ? 'Out of stock'
    : lowQty !== null
      ? `Only ${lowQty} left`
      : `In stock${variantCount > 1 ? ` · ${variantCount} options` : ''}`;

  return (
    <article className="product-card" aria-labelledby={titleId}>
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
        {badge === 'sale' && discount ? <span className="badge badge--sale">-{discount}%</span> : null}
        {badge === 'new' ? <span className="badge">New</span> : null}
        {badge === 'out' ? <span className="badge badge--muted">Out of stock</span> : null}
        <div className="product-card__wishlist">
          <WishlistButton productId={product.id} productName={product.name} />
        </div>
      </div>
      <div className="product-card__body">
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
        <ProductCardActions product={product} />
      </div>
    </article>
  );
}
