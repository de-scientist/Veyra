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
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span>{collection.name}</span>
      </nav>

      <div className="page-header">
        <div>
          <p className="eyebrow">Collection</p>
          <h1>{collection.name}</h1>
        </div>
      </div>

      <p>{collection.description}</p>

      <div className="product-grid">
        {products.length > 0 ? (
          products.map((product) => <ProductCard key={product.id} product={product} />)
        ) : (
          <p>No products are currently available in this collection.</p>
        )}
      </div>
    </main>
  );
}
