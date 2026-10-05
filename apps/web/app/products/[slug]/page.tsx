import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PriceDisplay } from '../../../components/PriceDisplay';
import { ProductCard } from '../../../components/ProductCard';
import { ProductActions } from '../../../components/ProductActions';
import { ProductGallery } from '../../../components/ProductGallery';
import { ProductRating } from '../../../components/ProductRating';
import { ProductTabs } from '../../../components/ProductTabs';
import { TrustStrip } from '../../../components/TrustStrip';
import { StatusBadge } from '../../../components/jb-ui';
import { discountPercent, getDepartmentBySlug, productInStock } from '../../../lib/catalog';
import { ratingSummary } from '../../../lib/product-card';
import { discoverProducts, getCategoryBySlug, getProductBySlug } from '../../../lib/storefront';
import { toJsonLd } from '../../../lib/json-ld';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getProductBySlug(params.slug).catch(() => null);
  if (!product) return { title: 'Product not found | JB Mercantile' };
  return {
    title: `${product.name} | JB Mercantile`,
    description: product.shortDescription,
    alternates: { canonical: `${siteUrl}/products/${product.slug}` },
    openGraph: {
      title: `${product.name} | JB Mercantile`,
      description: product.shortDescription,
      type: 'website',
      images: product.images.slice(0, 1).map((url) => ({ url })),
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | JB Mercantile`,
      description: product.shortDescription,
    },
  };
}

export default async function ProductPage({ params }: { params: { slug: string } }) {
  const product = await getProductBySlug(params.slug).catch(() => null);
  if (!product) notFound();

  const category = await getCategoryBySlug(product.category).catch(() => undefined);
  const department = getDepartmentBySlug(product.department);
  const inStock = productInStock(product);
  const prices = product.variants.map((v) => v.price);
  const minPrice = prices.length ? Math.min(...prices) : product.price;
  const hasPriceRange = prices.length ? Math.max(...prices) !== minPrice : false;
  const discount = discountPercent(product);
  const rating = ratingSummary(product);
  const firstSku = product.variants.length === 1 ? product.variants[0].sku : null;

  // Related: same category first, then department; never the product itself.
  const related = await discoverProducts(
    { category: product.category, sort: 'featured' },
    { pageSize: 5 },
  )
    .then((result) => result.items.filter((item) => item.id !== product.id).slice(0, 4))
    .catch(() => []);
  const relatedProducts =
    related.length > 0
      ? related
      : await discoverProducts({ department: product.department, sort: 'featured' }, { pageSize: 5 })
        .then((result) => result.items.filter((item) => item.id !== product.id).slice(0, 4))
        .catch(() => []);

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription,
    image: product.images,
    brand: { '@type': 'Brand', name: product.brand },
    category: category?.name ?? department?.name,
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'KES',
      lowPrice: minPrice,
      highPrice: prices.length ? Math.max(...prices) : product.price,
      offerCount: product.variants.length,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
      { '@type': 'ListItem', position: 2, name: 'Shop', item: `${siteUrl}/shop` },
      ...(department ? [{ '@type': 'ListItem', position: 3, name: department.name, item: `${siteUrl}/shop?department=${department.slug}` }] : []),
      { '@type': 'ListItem', position: department ? 4 : 3, name: product.name, item: `${siteUrl}/products/${product.slug}` },
    ],
  };

  return (
    <main className="container page-shell product-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(breadcrumbJsonLd) }} />

      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          <li><Link href="/">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/shop">Shop</Link></li>
          <li aria-hidden="true">/</li>
          {department ? (
            <>
              <li><Link href={`/shop?department=${department.slug}`}>{department.name}</Link></li>
              <li aria-hidden="true">/</li>
            </>
          ) : null}
          {category ? (
            <>
              <li><Link href={`/categories/${category.slug}`}>{category.name}</Link></li>
              <li aria-hidden="true">/</li>
            </>
          ) : null}
          <li aria-current="page">{product.name}</li>
        </ol>
      </nav>

      <div className="product-layout">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="product-summary">
          <p className="eyebrow">
            {department ? `${department.name} · ` : ''}{category ? category.name : product.brand}
          </p>
          <h1>{product.name}</h1>
          {rating ? (
            <p className="product-summary__rating">
              <ProductRating average={rating.average} count={rating.count} productName={product.name} />
              <a href="#product-tab-Reviews" className="product-summary__reviews-link">
                {rating.count} {rating.count === 1 ? 'review' : 'reviews'}
              </a>
            </p>
          ) : null}
          <p className="muted-copy product-summary__meta">
            {firstSku ? <span>SKU {firstSku}</span> : <span>{product.variants.length} variants</span>}
            {' · '}
            <span>{product.brand}</span>
          </p>
          <p className="product-summary__price">
            {hasPriceRange ? <span className="muted-copy">From </span> : null}
            <PriceDisplay price={minPrice} compareAtPrice={product.compareAtPrice} />
            {discount !== null ? <span className="badge badge--current">Save {discount}%</span> : null}
          </p>
          <p>
            <StatusBadge status={inStock ? 'IN STOCK' : 'OUT OF STOCK'} />
          </p>
          {product.shortDescription && product.shortDescription !== product.description ? (
            <ul className="product-summary__highlights">
              <li>{product.shortDescription}</li>
            </ul>
          ) : null}
          <p className="product-summary__description">{product.description}</p>

          <ProductActions productId={product.id} productName={product.name} variants={product.variants} />

          <div className="delivery-panel" aria-label="Delivery and payment information">
            <h2>Delivery &amp; payment</h2>
            <ul>
              <li>We deliver across Kenya — pickup, local, and courier options at checkout.</li>
              <li>Delivery fees are calculated at checkout from your zone and method.</li>
              <li>Secure checkout with M-Pesa; only verified payments mark orders as paid.</li>
            </ul>
          </div>
        </div>
      </div>

      <ProductTabs product={product} />

      <TrustStrip />

      {relatedProducts.length > 0 ? (
        <section className="section-block" aria-labelledby="related-heading">
          <div className="section-heading">
            <h2 id="related-heading">You may also like</h2>
            <Link href={department ? `/shop?department=${department.slug}` : '/shop'}>More to explore</Link>
          </div>
          <div className="product-grid">
            {relatedProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
