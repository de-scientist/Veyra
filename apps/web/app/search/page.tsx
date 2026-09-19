import Link from 'next/link';
import type { Metadata } from 'next';

import { ProductCard } from '../../components/ProductCard';
import { SearchBar } from '../../components/SearchBar';
import { FilterPanel, FilterSheetHost, SortControl } from '../../components/DiscoveryFilters';
import {
  applyDiscovery,
  deriveFacets,
  derivePriceBuckets,
  paginate,
  parseDiscoveryQuery,
  scopeProducts,
} from '../../lib/catalog';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams?: SearchParams }): Promise<Metadata> {
  const q = typeof searchParams?.q === 'string' ? searchParams.q : '';
  return {
    title: q ? `Search: ${q} | JB Mercantile` : 'Search | JB Mercantile',
    description: 'Search fashion, footwear and kitchen & home essentials at JB Mercantile.',
  };
}

export default function SearchPage({ searchParams }: { searchParams?: SearchParams }) {
  const raw = searchParams ?? {};
  const query = parseDiscoveryQuery(raw);
  const maxPriceRaw = Array.isArray(raw.maxPrice) ? raw.maxPrice[0] : raw.maxPrice;
  const maxPrice = maxPriceRaw && !Number.isNaN(Number(maxPriceRaw)) ? Number(maxPriceRaw) : null;

  const hasQuery = !!query.q?.trim();
  const facetScope = scopeProducts({ q: query.q });
  const facets = hasQuery ? deriveFacets(facetScope) : [];
  const priceBuckets = hasQuery ? derivePriceBuckets(facetScope) : [];

  let scoped = scopeProducts(query);
  if (maxPrice !== null) scoped = scoped.filter((p) => p.price <= maxPrice);
  const filtered = hasQuery ? applyDiscovery(scoped, query) : [];
  const { items, page, totalPages, total } = paginate(filtered, query.page ?? 1);

  const fixed = hasQuery && query.q ? { q: query.q } : {};
  const panelProps = { facets, priceBuckets, query, basePath: '/search', fixed, selectedMaxPrice: maxPrice };

  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Search JB Mercantile</p>
          <h1>{hasQuery ? `Results for “${query.q}”` : 'Find your next essential'}</h1>
        </div>
      </div>

      <SearchBar initialQuery={query.q ?? ''} autoFocus={!hasQuery} />

      {hasQuery ? (
        <>
          <div className="toolbar" style={{ marginTop: '1.5rem' }}>
            <span className="toolbar__count" role="status">
              {total} result{total === 1 ? '' : 's'}
            </span>
            <div className="toolbar__controls">
              <FilterSheetHost {...panelProps} />
              <SortControl value={query.sort ?? 'featured'} />
            </div>
          </div>

          <div className="discovery-layout">
            <aside className="filter-panel filter-panel--desktop" aria-label="Search filters">
              <FilterPanel {...panelProps} />
            </aside>
            <section aria-label="Search results">
              {items.length > 0 ? (
                <div className="product-grid">
                  {items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <h2>No matches found</h2>
                  <p>Nothing matched “{query.q}”. Try a different keyword — “sneakers”, “kettle” or “shirt” — or remove filters.</p>
                  <Link className="button" href="/shop">Browse all products</Link>
                </div>
              )}

              {totalPages > 1 ? (
                <nav className="pagination" aria-label="Search pages">
                  {page > 1 ? <Link href={`/search?q=${encodeURIComponent(query.q ?? '')}&page=${page - 1}`} className="button button--secondary button--small">← Previous</Link> : null}
                  <span className="pagination__info" role="status">Page {page} of {totalPages}</span>
                  {page < totalPages ? <Link href={`/search?q=${encodeURIComponent(query.q ?? '')}&page=${page + 1}`} className="button button--secondary button--small">Next →</Link> : null}
                </nav>
              ) : null}
            </section>
          </div>
        </>
      ) : (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <h2>Start your search</h2>
          <p>Search by product name, style or category — try “sneakers”, “blender” or “shirt”. Filters adapt to what you search for.</p>
          <Link className="button" href="/shop">Browse all products</Link>
        </div>
      )}
    </main>
  );
}
