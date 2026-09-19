import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ProductCard } from '../../../components/ProductCard';
import { SortControl } from '../../../components/DiscoveryFilters';
import { getCollectionBySlug, getProductsByCollection } from '../../../lib/catalog';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const collection = getCollectionBySlug(params.slug);
  if (!collection) return { title: 'Collection not found | JB Mercantile' };
  return {
    title: `${collection.name} | JB Mercantile`,
    description: `${collection.description} Shop the ${collection.name} collection at JB Mercantile.`,
  };
}

export default function CollectionPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: { sort?: string };
}) {
  const collection = getCollectionBySlug(params.slug);
  if (!collection) notFound();

  const sort = searchParams?.sort ?? 'featured';
  const all = getProductsByCollection(params.slug);
  const products = [...all].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'newest') return b.createdAt.localeCompare(a.createdAt);
    return 0;
  });

  return (
    <main className="container page-shell">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          <li><Link href="/">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/shop">Shop</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{collection.name}</li>
        </ol>
      </nav>

      <section className="hero hero--mercantile" style={{ minHeight: 'auto', padding: 'clamp(1.75rem, 3vw, 2.75rem)' }} aria-labelledby="collection-heading">
        <div className="hero__content">
          <p className="eyebrow">The {collection.name} collection</p>
          <h1 id="collection-heading" style={{ fontSize: 'clamp(1.9rem, 4vw, 2.75rem)' }}>{collection.name}</h1>
          <p>{collection.description}</p>
        </div>
      </section>

      <div className="toolbar" style={{ marginTop: '1.5rem' }}>
        <span className="toolbar__count" role="status">
          {products.length} piece{products.length === 1 ? '' : 's'}
        </span>
        <div className="toolbar__controls">
          <SortControl value={sort} />
        </div>
      </div>

      {products.length > 0 ? (
        <div className="product-grid">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No products in {collection.name} yet</h2>
          <p>This collection is being curated. Browse everything instead.</p>
          <Link href="/shop" className="button">Browse all products</Link>
        </div>
      )}
    </main>
  );
}
