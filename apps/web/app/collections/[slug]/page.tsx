import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductCard } from '../../../components/ProductCard';
import { getCollectionBySlug, getProductsByCollection } from '../../../lib/storefront-data';

export default function CollectionPage({ params }: { params: { slug: string } }) {
  const collection = getCollectionBySlug(params.slug);

  if (!collection) {
    notFound();
  }

  const products = getProductsByCollection(params.slug);

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

      <div className="page-header">
        <div>
          <p className="eyebrow">Collection</p>
          <h1>{collection.name}</h1>
        </div>
      </div>

      <p className="muted-copy">{collection.description}</p>

      <div className="toolbar">
        <span className="toolbar__count" role="status">
          {products.length} piece{products.length === 1 ? '' : 's'}
        </span>
      </div>

      {products.length > 0 ? (
        <div className="product-grid">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No products in {collection.name} yet</h2>
          <p>New pieces are on the way. Browse everything instead.</p>
          <Link href="/shop" className="button">Browse the shop</Link>
        </div>
      )}
    </main>
  );
}
