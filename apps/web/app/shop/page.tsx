import Link from 'next/link';
import type { Metadata } from 'next';
import type { Route } from 'next';

import { ProductCard } from '../../components/ProductCard';
import { JBIcon } from '../../components/JBIcons';
import { FilterPanel, FilterSheetHost, SortControl } from '../../components/DiscoveryFilters';
import { discoveryQueryString, getDepartmentBySlug, parseDiscoveryQuery } from '../../lib/catalog';
import { discoverProducts, getDepartmentCategories } from '../../lib/storefront';

type SearchParams = Record<string, string | string[] | undefined>;

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com').replace(/\/$/, '');

export async function generateMetadata({ searchParams }: { searchParams?: SearchParams }): Promise<Metadata> {
  const query = parseDiscoveryQuery(searchParams ?? {});
  const department = query.department ? getDepartmentBySlug(query.department) : undefined;
  const title = department ? `${department.name} | JB Mercantile` : 'Shop All | JB Mercantile';
  const description = department
    ? `Shop ${department.name.toLowerCase()} at JB Mercantile — ${department.description}`
    : 'Shop fashion, footwear and kitchen & home essentials at JB Mercantile.';
  return {
    title,
    description,
    alternates: { canonical: department ? `${siteUrl}/shop?department=${department.slug}` : `${siteUrl}/shop` },
  };
}

export default async function ShopPage({ searchParams }: { searchParams?: SearchParams }) {
  const raw = searchParams ?? {};
  const query = parseDiscoveryQuery(raw);
  const maxPriceRaw = Array.isArray(raw.maxPrice) ? raw.maxPrice[0] : raw.maxPrice;
  const maxPrice = maxPriceRaw && !Number.isNaN(Number(maxPriceRaw)) ? Number(maxPriceRaw) : null;

  // Server-side discovery: facets and buckets derive from the live scope,
  // items are filtered/sorted/paginated by the API.
  const [{ items, facets, priceBuckets, page, totalPages, total }, subcategories] = await Promise.all([
    discoverProducts(query, { maxPrice }),
    query.department ? getDepartmentCategories(query.department).catch(() => []) : Promise.resolve([]),
  ]);

  const department = query.department ? getDepartmentBySlug(query.department) : undefined;
  const fixed = {
    ...(query.department ? { department: query.department } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.q ? { q: query.q } : {}),
  };
  const panelProps = { facets, priceBuckets, query, basePath: '/shop', fixed, selectedMaxPrice: maxPrice };

  const activeChips: Array<{ key: string; label: string; href: string }> = [];
  for (const [attribute, values] of Object.entries(query.attrs ?? {})) {
    for (const value of values) {
      const next = { ...query, attrs: { ...query.attrs, [attribute]: (query.attrs?.[attribute] ?? []).filter((v) => v !== value) } };
      activeChips.push({ key: `${attribute}-${value}`, label: `${attribute}: ${value}`, href: `/shop${discoveryQueryString({ ...next, ...fixed })}` });
    }
  }
  if (query.inStockOnly) {
    activeChips.push({ key: 'instock', label: 'In stock only', href: `/shop${discoveryQueryString({ ...query, inStockOnly: false, ...fixed })}` });
  }
  if (maxPrice !== null) {
    const params = new URLSearchParams(discoveryQueryString({ ...query, ...fixed }).slice(1));
    params.delete('maxPrice');
    const s = params.toString();
    activeChips.push({ key: 'maxprice', label: `Up to KES ${maxPrice.toLocaleString('en-KE')}`, href: `/shop${s ? `?${s}` : ''}` });
  }

  const pageHref = (p: number) => {
    const params = new URLSearchParams(discoveryQueryString({ ...query, ...fixed, page: p }).slice(1));
    if (maxPrice !== null) params.set('maxPrice', String(maxPrice));
    const s = params.toString();
    return `/shop${s ? `?${s}` : ''}` as Route;
  };

  return (
    <main className="container page-shell">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          <li><Link href="/">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Shop{department ? ` · ${department.name}` : ''}</li>
        </ol>
      </nav>

      <div className="page-header">
        <div>
          <p className="eyebrow">{department ? department.tagline : 'JB Mercantile'}</p>
          <h1>{department ? department.name : 'Shop all'}</h1>
          {department ? <p className="muted-copy">{department.description}</p> : null}
        </div>
      </div>

      {subcategories.length > 0 ? (
        <ul className="pill-nav" aria-label="Subcategories">
          <li><Link href={`/shop?department=${query.department}`} aria-current={query.category ? undefined : 'page'}>All</Link></li>
          {subcategories.map((category) => (
            <li key={category.slug}>
              <Link href={`/categories/${category.slug}`} aria-current={query.category === category.slug ? 'page' : undefined}>
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="toolbar">
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
              {items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>No products found</h2>
              <p>Try removing some filters or explore another department.</p>
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
