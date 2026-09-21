import Image from 'next/image';
import Link from 'next/link';

import { ProductCard } from '../components/ProductCard';
import { departments } from '../lib/catalog';
import {
  getCollections,
  getFeaturedProducts,
  getNewArrivals,
  getProductsByDepartment,
} from '../lib/storefront';

export default async function HomePage() {
  const [collections, featuredProducts, newArrivals, fashionPicks, footwearPicks, kitchenPicks] = await Promise.all([
    getCollections().catch(() => []),
    getFeaturedProducts().catch(() => []),
    getNewArrivals().catch(() => []),
    getProductsByDepartment('fashion').catch(() => []),
    getProductsByDepartment('footwear').catch(() => []),
    getProductsByDepartment('kitchen-home').catch(() => []),
  ]);

  return (
    <main className="container page-shell">
      <section className="hero hero--mercantile" aria-labelledby="jb-hero-heading">
        <div className="hero__content">
          <p className="eyebrow">JB Mercantile · Nairobi, Kenya</p>
          <h1 id="jb-hero-heading">Fashion. Footwear. Kitchen &amp; Home.</h1>
          <p>
            One store for the way you live — everyday clothing, shoes for every step,
            and kitchen essentials, with secure checkout and M-Pesa payments.
          </p>
          <div className="cta-row">
            <Link href="/shop" className="button">Shop now</Link>
            <Link href="#jb-departments" className="button button--secondary">Explore categories</Link>
          </div>
        </div>
        <div className="hero__media" aria-hidden="true">
          {departments.map((department) => (
            <span key={department.slug} className="hero__media-item">
              <Image src={department.image} alt="" width={300} height={380} priority />
              <span className="hero__media-label">{department.name}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="section-block" aria-labelledby="jb-departments" id="jb-departments">
        <div className="section-heading">
          <h2 id="jb-departments-heading">Shop by department</h2>
          <Link href="/shop">Browse all</Link>
        </div>
        <div className="dept-grid">
          {departments.map((department) => (
            <Link key={department.slug} href={`/shop?department=${department.slug}`} className="dept-card">
              <span className="dept-card__media">
                <Image src={department.image} alt="" width={640} height={360} />
              </span>
              <span className="dept-card__body">
                <h3>{department.name}</h3>
                <p>{department.description}</p>
                <span className="dept-card__cta">Shop {department.tagline.toLowerCase()} →</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {featuredProducts.length > 0 ? (
        <section className="section-block" aria-labelledby="jb-featured-heading">
          <div className="section-heading">
            <h2 id="jb-featured-heading">Featured products</h2>
            <Link href="/shop">See more</Link>
          </div>
          <div className="product-grid">
            {featuredProducts.map((product, index) => (
              <ProductCard key={product.id} product={product} eager={index < 2} />
            ))}
          </div>
        </section>
      ) : null}

      {fashionPicks.length >= 2 ? (
        <section className="section-block" aria-labelledby="jb-fashion-heading">
          <div className="section-heading">
            <h2 id="jb-fashion-heading">Fashion picks</h2>
            <Link href="/shop?department=fashion">All fashion</Link>
          </div>
          <div className="product-grid">
            {fashionPicks.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {footwearPicks.length >= 2 ? (
        <section className="section-block" aria-labelledby="jb-footwear-heading">
          <div className="section-heading">
            <h2 id="jb-footwear-heading">Footwear essentials</h2>
            <Link href="/shop?department=footwear">All footwear</Link>
          </div>
          <div className="product-grid">
            {footwearPicks.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      {kitchenPicks.length >= 2 ? (
        <section className="section-block" aria-labelledby="jb-kitchen-heading">
          <div className="section-heading">
            <h2 id="jb-kitchen-heading">Kitchen &amp; home essentials</h2>
            <Link href="/shop?department=kitchen-home">All kitchen &amp; home</Link>
          </div>
          <div className="product-grid">
            {kitchenPicks.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section-block" aria-labelledby="jb-collections-heading">
        <div className="section-heading">
          <h2 id="jb-collections-heading">Collections</h2>
        </div>
        <div className="promo-grid">
          {collections.map((collection) => (
            <Link key={collection.slug} href={`/collections/${collection.slug}`} className="promo-card">
              <p className="eyebrow">Collection</p>
              <h3>{collection.name}</h3>
              <p>{collection.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {newArrivals.length > 0 ? (
        <section className="section-block" aria-labelledby="jb-new-heading">
          <div className="section-heading">
            <h2 id="jb-new-heading">New arrivals</h2>
            <Link href="/shop?sort=newest">View all</Link>
          </div>
          <div className="product-grid">
            {newArrivals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="trust-strip" aria-label="Why shop with JB Mercantile">
        <div className="trust-strip__item">
          <strong>Secure checkout</strong>
          <span>Order totals are always calculated by our backend — never in the browser.</span>
        </div>
        <div className="trust-strip__item">
          <strong>M-Pesa payments</strong>
          <span>Pay with M-Pesa and track confirmation right on your order.</span>
        </div>
        <div className="trust-strip__item">
          <strong>Flexible delivery</strong>
          <span>Flexible delivery across our zones, with pickup options at checkout.</span>
        </div>
        <div className="trust-strip__item">
          <strong>Easy returns</strong>
          <span>Request returns or exchanges from your account and follow each step.</span>
        </div>
      </section>
    </main>
  );
}
