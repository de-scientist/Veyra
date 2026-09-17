import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { PriceDisplay } from '../../../components/PriceDisplay';
import { ProductCard } from '../../../components/ProductCard';
import { getProductBySlug, getPublicProducts } from '../../../lib/storefront-data';

export default function ProductPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = getPublicProducts().filter((item) => item.id !== product.id).slice(0, 3);
  const selectedVariant = product.variants[0];

  return (
    <main className="container page-shell product-page">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span>{product.name}</span>
      </nav>

      <div className="product-layout">
        <div className="product-gallery">
          {product.images.map((image, index) => (
            <div key={image} className="product-gallery__item">
              <Image src={image} alt={`${product.name} ${index + 1}`} width={800} height={1000} />
            </div>
          ))}
        </div>

        <div className="product-summary">
          <p className="eyebrow">{product.brand}</p>
          <h1>{product.name}</h1>
          <PriceDisplay price={selectedVariant?.price ?? product.price} compareAtPrice={selectedVariant?.compareAtPrice ?? product.compareAtPrice} />
          <p className="product-summary__description">{product.description}</p>

          <div className="variant-panel">
            <h2>Available options</h2>
            <div className="variant-list">
              {product.variants.map((variant) => (
                <button key={variant.id} type="button" className={`variant-pill ${variant.inStock ? '' : 'is-disabled'}`} disabled={!variant.inStock}>
                  {variant.name}
                </button>
              ))}
            </div>
          </div>

          <div className="cta-row">
            <button type="button" className="button" disabled={!selectedVariant?.inStock}>
              {selectedVariant?.inStock ? 'Add to cart' : 'Out of stock'}
            </button>
            <button type="button" className="button button--secondary">Save for later</button>
          </div>
        </div>
      </div>

      <section className="section-block">
        <h2>More from the collection</h2>
        <div className="product-grid">
          {relatedProducts.map((item) => (
            <ProductCard key={item.id} product={item} />
          ))}
        </div>
      </section>
    </main>
  );
}
