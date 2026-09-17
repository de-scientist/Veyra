import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProductCard } from '../../../components/ProductCard';
import { getCategoryBySlug, getProductsByCategory } from '../../../lib/storefront-data';

export default function CategoryPage({ params }: { params: { slug: string } }) {
  const category = getCategoryBySlug(params.slug);

  if (!category) {
    notFound();
  }

  const products = getProductsByCategory(params.slug);

  return (
    <main className="container page-shell">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/shop">Shop</Link>
        <span>/</span>
        <span>{category.name}</span>
      </nav>

      <div className="page-header">
        <div>
          <p className="eyebrow">Category</p>
          <h1>{category.name}</h1>
        </div>
      </div>

      <p>{category.description}</p>

      <div className="product-grid">
        {products.length > 0 ? (
          products.map((product) => <ProductCard key={product.id} product={product} />)
        ) : (
          <p>No products currently available in this category.</p>
        )}
      </div>
    </main>
  );
}
