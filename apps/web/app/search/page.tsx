import { getProductsByQuery } from '../../lib/storefront-data';

export default function SearchPage({ searchParams }: { searchParams?: { q?: string } }) {
  const query = searchParams?.q ?? '';
  const products = getProductsByQuery(query);

  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Search</p>
          <h1>{query ? `Results for “${query}”` : 'Find your next piece'}</h1>
        </div>
      </div>

      <form method="get" className="search-form">
        <input name="q" defaultValue={query} placeholder="Search products, categories, or styles" aria-label="Search products" />
        <button type="submit" className="button">Search</button>
      </form>

      <div className="product-grid">
        {products.length > 0 ? (
          products.map((product) => (
            <div key={product.id}>{product.name}</div>
          ))
        ) : (
          <p>No products matched your search.</p>
        )}
      </div>
    </main>
  );
}
