import Link from 'next/link';

import { ProductCard } from '../components/ProductCard';
import { categories, collections, getFeaturedProducts, getNewArrivals } from '../lib/storefront-data';

export default function HomePage() {
  const featuredProducts = getFeaturedProducts();
  const newArrivals = getNewArrivals();

  return (
    <main className="container page-shell">
      <section className="hero" aria-labelledby="jb-hero-heading">
        <div className="hero__content">
          <p className="eyebrow">JB · Kenya-first essentials</p>
          <h1 id="jb-hero-heading">Refined everyday style, made for movement.</h1>
          <p>
            Shop elevated staples, modern layers, and versatile essentials — with secure checkout and M-Pesa payments.
          </p>
          <div className="cta-row">
            <Link href="/shop" className="button">Shop new arrivals</Link>
            <Link href="/collections/weekend-edit" className="button button--secondary">Explore the collection</Link>
          </div>
        </div>
      </section>

      <section className="section-block" aria-labelledby="jb-categories-heading">
        <div className="section-heading">
          <h2 id="jb-categories-heading">Shop by category</h2>
          <Link href="/shop">Browse all</Link>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`} className="category-card">
              <div>
                <p className="eyebrow">Category</p>
                <h3>{category.name}</h3>
              </div>
              <p>{category.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="jb-featured-heading">
        <div className="section-heading">
          <h2 id="jb-featured-heading">Featured products</h2>
          <Link href="/shop">See more</Link>
        </div>
        <div className="product-grid">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="section-block promo-grid" aria-label="Collections">
        {collections.map((collection) => (
          <Link key={collection.slug} href={`/collections/${collection.slug}`} className="promo-card">
            <p className="eyebrow">Collection</p>
            <h3>{collection.name}</h3>
            <p>{collection.description}</p>
          </Link>
        ))}
      </section>

      <section className="section-block" aria-labelledby="jb-new-heading">
        <div className="section-heading">
          <h2 id="jb-new-heading">New arrivals</h2>
          <Link href="/shop">View all</Link>
        </div>
        <div className="product-grid">
          {newArrivals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="trust-strip" aria-label="Why shop with JB">
        <div className="trust-strip__item">
          <strong>Secure checkout</strong>
          <span>Your order totals are always calculated by our backend — never in the browser.</span>
        </div>
        <div className="trust-strip__item">
          <strong>M-Pesa payments</strong>
          <span>Pay with M-Pesa and track confirmation right on your order.</span>
        </div>
        <div className="trust-strip__item">
          <strong>Easy returns</strong>
          <span>Request returns or exchanges from your account and follow each step.</span>
        </div>
      </section>
    </main>
  );
}
