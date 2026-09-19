import Link from 'next/link';

import { ProductCard } from '../../components/ProductCard';
import { getPublicProducts } from '../../lib/storefront-data';

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A–Z' },
] as const;

export default function ShopPage({ searchParams }: { searchParams?: { sort?: string } }) {
  const sort = searchParams?.sort ?? 'featured';
  const all = getPublicProducts();
  const products = [...all].sort((a, b) => {
    if (sort === 'price-asc') return a.price - b.price;
    if (sort === 'price-desc') return b.price - a.price;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return 0;
  });

  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Shop JB</p>
          <h1>All essentials</h1>
        </div>
      </div>

      <div className="toolbar">
        <span className="toolbar__count" role="status">
          {products.length} piece{products.length === 1 ? '' : 's'}
        </span>
        <form method="get" className="toolbar__controls" aria-label="Sort products">
          <label htmlFor="shop-sort" className="eyebrow">Sort</label>
          <select id="shop-sort" name="sort" defaultValue={sort} onChange={(e) => (e.currentTarget.form as HTMLFormElement).submit()}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <noscript><button type="submit" className="button button--secondary button--small">Apply</button></noscript>
        </form>
      </div>

      {products.length > 0 ? (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>Nothing here yet</h2>
          <p>New pieces are on the way. Check back soon or explore collections.</p>
          <Link href="/" className="button button--secondary">Back home</Link>
        </div>
      )}
    </main>
  );
}
