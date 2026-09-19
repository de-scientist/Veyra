import Link from 'next/link';

import { ProductCard } from '../../components/ProductCard';
import { getProductsByQuery } from '../../lib/storefront-data';

export default function SearchPage({ searchParams }: { searchParams?: { q?: string } }) {
  const query = searchParams?.q ?? '';
  const products = getProductsByQuery(query);

  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Search JB</p>
          <h1>{query ? `Results for “${query}”` : 'Find your next piece'}</h1>
        </div>
      </div>

      <form method="get" className="search-form" role="search">
        <input name="q" defaultValue={query} placeholder="Search products, categories, or styles" aria-label="Search products" />
        <button type="submit" className="button">Search</button>
      </form>

      {query ? (
        <div className="toolbar">
          <span className="toolbar__count" role="status">
            {products.length} result{products.length === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}

      {products.length > 0 ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>{query ? 'No matches found' : 'Start your search'}</h2>
          <p>
            {query
              ? `Nothing matched “${query}”. Try a different keyword, or browse the full collection.`
              : 'Search by product name, style, or category to find what you need.'}
          </p>
          <Link className="button" href="/shop">Browse the shop</Link>
        </div>
      )}
    </main>
  );
}
