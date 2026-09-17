import Link from 'next/link';

import { ProductCard } from '../components/ProductCard';
import { categories, collections, getFeaturedProducts, getNewArrivals } from '../lib/storefront-data';

export default function HomePage() {
  const featuredProducts = getFeaturedProducts();
  const newArrivals = getNewArrivals();

  return (
    <main className="container page-shell">
      <section className="hero">
        <div className="hero__content">
          <p className="eyebrow">Kenya-first essentials</p>
          <h1>Refined everyday style for movement.</h1>
          <p>
            Shop elevated staples, modern layers, and versatile essentials designed for the rhythm of everyday life.
          </p>
          <div className="cta-row">
            <Link href="/shop" className="button">Shop new arrivals</Link>
            <Link href="/collections/weekend-edit" className="button button--secondary">Explore collection</Link>
          </div>
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Shop by category</h2>
          <Link href="/shop">Browse all</Link>
        </div>
        <div className="category-grid">
          {categories.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`} className="category-card">
              <div>
                <p className="eyebrow">Collection</p>
                <h3>{category.name}</h3>
              </div>
              <p>{category.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>Featured products</h2>
          <Link href="/shop">See more</Link>
        </div>
        <div className="product-grid">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      <section className="section-block promo-grid">
        {collections.map((collection) => (
          <Link key={collection.slug} href={`/collections/${collection.slug}`} className="promo-card">
            <p className="eyebrow">Featured</p>
            <h3>{collection.name}</h3>
            <p>{collection.description}</p>
          </Link>
        ))}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <h2>New arrivals</h2>
          <Link href="/shop">View all</Link>
        </div>
        <div className="product-grid">
          {newArrivals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </main>
  );
}
