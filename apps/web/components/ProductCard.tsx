import Link from 'next/link';
import Image from 'next/image';

import { PriceDisplay } from './PriceDisplay';
import type { Product } from '../lib/storefront-data';

type ProductCardProps = {
  product: Product;
};

export function ProductCard({ product }: ProductCardProps) {
  const primaryImage = product.images[0];
  const hasDiscount = !!product.compareAtPrice && product.compareAtPrice > product.price;

  return (
    <article className="product-card">
      <Link href={`/products/${product.slug}`} aria-label={`View ${product.name}`} className="product-card__link">
        <div className="product-card__media">
          {primaryImage ? (
            <Image src={primaryImage} alt={product.name} width={800} height={1000} priority={false} />
          ) : (
            <div className="product-card__placeholder">Image unavailable</div>
          )}
          {hasDiscount ? <span className="badge badge--sale">Sale</span> : null}
        </div>
        <div className="product-card__body">
          <div className="product-card__meta">{product.brand}</div>
          <h3>{product.name}</h3>
          <p>{product.shortDescription}</p>
          <PriceDisplay price={product.price} compareAtPrice={product.compareAtPrice} className="product-card__price" />
        </div>
      </Link>
    </article>
  );
}
