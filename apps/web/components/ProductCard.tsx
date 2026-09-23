import Link from 'next/link';

import { PriceDisplay } from './PriceDisplay';
import { ProductImage } from './ProductImage';
import { WishlistButton } from './WishlistButton';
import {
  discountPercent,
  getDepartmentBySlug,
  productInStock,
  type Product,
} from '../lib/catalog';

export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const [primaryImage, hoverImage] = product.images;
  const discount = discountPercent(product);
  const inStock = productInStock(product);
  // Category display name arrives resolved from live data; the department
  // pillar stays a static lookup.
  const categoryName = product.categoryName ?? product.category;
  const department = getDepartmentBySlug(product.department);
  const variantCount = product.variants.length;

  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`} className="product-card__link">
        <div className="product-card__media">
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
          {discount ? <span className="badge badge--sale">-{discount}%</span> : null}
        </div>
        <div className="product-card__body">
          <div className="product-card__meta">
            {department ? <span className="product-card__dept">{department.name}</span> : null}
            {' · '}
            {categoryName}
          </div>
          <h3>{product.name}</h3>
          <p>{product.shortDescription}</p>
          <PriceDisplay price={product.price} compareAtPrice={product.compareAtPrice} className="product-card__price" />
          <span className={`product-card__stock ${inStock ? 'product-card__stock--in' : 'product-card__stock--out'}`}>
            {inStock ? 'In stock' : 'Out of stock'}
            {inStock && variantCount > 1 ? ` · ${variantCount} options` : null}
          </span>
        </div>
      </Link>
      <div className="product-card__wishlist"><WishlistButton productId={product.id} /></div>
    </article>
  );
}
