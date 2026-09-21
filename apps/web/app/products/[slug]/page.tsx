import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PriceDisplay } from '../../../components/PriceDisplay';
import { ProductCard } from '../../../components/ProductCard';
import { ProductActions } from '../../../components/ProductActions';
import { ProductGallery } from '../../../components/ProductGallery';
import { ProductSpecifications } from '../../../components/ProductSpecifications';
import { StatusBadge } from '../../../components/jb-ui';
import { getDepartmentBySlug, productInStock } from '../../../lib/catalog';
import { discoverProducts, getCategoryBySlug, getProductBySlug } from '../../../lib/storefront';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getProductBySlug(params.slug).catch(() => null);
  if (!product) return { title: 'Product not found | JB Mercantile' };
  return {
    title: `${product.name} | JB Mercantile`,
    description: product.shortDescription,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

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
          <p className="muted-copy">
            {hasPriceRange ? 'From ' : ''}
            <PriceDisplay price={minPrice} compareAtPrice={product.compareAtPrice} />
          </p>
          <p>
            <StatusBadge status={inStock ? 'IN STOCK' : 'OUT OF STOCK'} />
          </p>
          <p className="product-summary__description">{product.description}</p>

          <ProductActions productId={product.id} productName={product.name} variants={product.variants} />

          <div className="status-row" style={{ marginTop: '1.5rem' }}>
            <span>Delivery<small>Flexible delivery options across our zones — calculated at checkout.</small></span>
            <span>Payment<small>Secure checkout with M-Pesa support.</small></span>
          </div>
        </div>
      </div>

      <section className="section-block" aria-labelledby="product-description-heading">
        <h2 id="product-description-heading">About this product</h2>
        <p className="muted-copy" style={{ maxWidth: '70ch' }}>{product.description}</p>
      </section>

      <div className="section-block">
        <ProductSpecifications product={product} />
      </div>

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
