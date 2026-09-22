import Link from 'next/link';
import type { Metadata } from 'next';
import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { ProductCard } from '../../../components/ProductCard';
import { JBIcon } from '../../../components/JBIcons';
import { FilterPanel, FilterSheetHost, SortControl } from '../../../components/DiscoveryFilters';
import { discoveryQueryString, parseDiscoveryQuery } from '../../../lib/catalog';
import { discoverProducts, getCollectionBySlug } from '../../../lib/storefront';

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com').replace(/\/$/, '');

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const collection = await getCollectionBySlug(params.slug).catch(() => undefined);
  if (!collection) return { title: 'Collection not found | JB Mercantile' };
  return {
    title: `${collection.name} | JB Mercantile`,
    description: `${collection.description} Shop the ${collection.name} collection at JB Mercantile.`,
    alternates: { canonical: `${siteUrl}/collections/${collection.slug}` },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams?: SearchParams;
}) {
  const collection = await getCollectionBySlug(params.slug).catch(() => undefined);
  if (!collection) notFound();

  const raw = searchParams ?? {};
  const query = { ...parseDiscoveryQuery(raw), collection: collection.slug };
  const maxPriceRaw = Array.isArray(raw.maxPrice) ? raw.maxPrice[0] : raw.maxPrice;
  const maxPrice = maxPriceRaw && !Number.isNaN(Number(maxPriceRaw)) ? Number(maxPriceRaw) : null;

  // Full discovery scoped to the collection: facets, price buckets, sort
  // and pagination all come from the live API — same contract as
  // shop/category pages.
  const { items, facets, priceBuckets, page, totalPages, total } = await discoverProducts(query, { maxPrice });

  const basePath = `/collections/${collection.slug}`;
  const fixed = { collection: collection.slug };
  const panelProps = { facets, priceBuckets, query, basePath, fixed, selectedMaxPrice: maxPrice };

  const activeChips: Array<{ key: string; label: string; href: string }> = [];
  for (const [attribute, values] of Object.entries(query.attrs ?? {})) {
    for (const value of values) {
      const next = { ...query, attrs: { ...query.attrs, [attribute]: (query.attrs?.[attribute] ?? []).filter((v) => v !== value) } };
      const pms = new URLSearchParams(discoveryQueryString({ ...next, ...fixed }).slice(1));
      pms.delete('collection');
      const s = pms.toString();
      activeChips.push({ key: `${attribute}-${value}`, label: `${attribute}: ${value}`, href: `${basePath}${s ? `?${s}` : ''}` });
    }
  }
  if (query.inStockOnly) {
    const pms = new URLSearchParams(discoveryQueryString({ ...query, inStockOnly: false, ...fixed }).slice(1));
    pms.delete('collection');
    const s = pms.toString();
    activeChips.push({ key: 'instock', label: 'In stock only', href: `${basePath}${s ? `?${s}` : ''}` });
  }
  if (maxPrice !== null) {
    const pms = new URLSearchParams(discoveryQueryString({ ...query, ...fixed }).slice(1));
    pms.delete('collection');
    pms.delete('maxPrice');
    const s = pms.toString();
    activeChips.push({ key: 'maxprice', label: `Up to KES ${maxPrice.toLocaleString('en-KE')}`, href: `${basePath}${s ? `?${s}` : ''}` });
  }

  const pageHref = (p: number) => {
    const pms = new URLSearchParams(discoveryQueryString({ ...query, ...fixed, page: p }).slice(1));
    pms.delete('collection');
    if (maxPrice !== null) pms.set('maxPrice', String(maxPrice));
    const s = pms.toString();
    return `${basePath}${s ? `?${s}` : ''}` as Route;
  };

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
          {total} result{total === 1 ? '' : 's'}
        </span>
        <div className="toolbar__controls">
          <FilterSheetHost {...panelProps} />
          <SortControl value={query.sort ?? 'featured'} />
        </div>
      </div>

      {activeChips.length > 0 ? (
        <ul className="active-chips" aria-label="Active filters">
          {activeChips.map((chip) => (
            <li key={chip.key} className="chip">
              {chip.label}
              <Link href={chip.href as Route} aria-label={`Remove filter ${chip.label}`} className="chip__remove"><JBIcon name="close" size={14} /></Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="discovery-layout">
        <aside className="filter-panel filter-panel--desktop" aria-label="Product filters">
          <FilterPanel {...panelProps} />
        </aside>
        <section aria-label="Products">
          {items.length > 0 ? (
            <div className="product-grid">
              {items.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="empty-state">
              <h2>No products in {collection.name} yet</h2>
              <p>Try removing some filters, or browse everything instead.</p>
              <Link href="/shop" className="button">Browse all products</Link>
            </div>
          )}

          {totalPages > 1 ? (
            <nav className="pagination" aria-label="Product pages">
              {page > 1 ? <Link href={pageHref(page - 1)} className="button button--secondary button--small">← Previous</Link> : null}
              <span className="pagination__info" role="status">Page {page} of {totalPages} · {total} results</span>
              {page < totalPages ? <Link href={pageHref(page + 1)} className="button button--secondary button--small">Next →</Link> : null}
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
