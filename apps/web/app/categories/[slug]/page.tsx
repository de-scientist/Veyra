import Link from 'next/link';
import type { Metadata } from 'next';
import type { Route } from 'next';
import { notFound } from 'next/navigation';

import { ProductCard } from '../../../components/ProductCard';
import { FilterPanel, FilterSheetHost, SortControl } from '../../../components/DiscoveryFilters';
import { discoveryQueryString, getDepartmentBySlug, parseDiscoveryQuery } from '../../../lib/catalog';
import { discoverProducts, getCategoryBySlug, getSubcategories } from '../../../lib/storefront';

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const category = await getCategoryBySlug(params.slug).catch(() => undefined);
  if (!category) return { title: 'Category not found | JB Mercantile' };
  return {
    title: `${category.name} | JB Mercantile`,
    description: `${category.description} Shop ${category.name.toLowerCase()} at JB Mercantile with secure checkout and M-Pesa payments.`,
  };
}

export default async function CategoryPage({ params, searchParams }: { params: { slug: string }; searchParams?: SearchParams }) {
  const category = await getCategoryBySlug(params.slug).catch(() => undefined);
  if (!category) notFound();

  const raw = searchParams ?? {};
  const query = { ...parseDiscoveryQuery(raw), category: category.slug };
  const maxPriceRaw = Array.isArray(raw.maxPrice) ? raw.maxPrice[0] : raw.maxPrice;
  const maxPrice = maxPriceRaw && !Number.isNaN(Number(maxPriceRaw)) ? Number(maxPriceRaw) : null;

  const [{ items, facets, priceBuckets, page, totalPages, total }, children] = await Promise.all([
    discoverProducts(query, { maxPrice }),
    getSubcategories(category.slug).catch(() => []),
  ]);

  const department = getDepartmentBySlug(category.department);
  const basePath = `/categories/${category.slug}`;
  const fixed = { category: category.slug };
  const panelProps = { facets, priceBuckets, query, basePath, fixed, selectedMaxPrice: maxPrice };

  const pageHref = (p: number) => {
    const pms = new URLSearchParams(discoveryQueryString({ ...query, page: p }).slice(1));
    pms.delete('category');
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
          {department ? (
            <>
              <li><Link href={`/shop?department=${department.slug}`}>{department.name}</Link></li>
              <li aria-hidden="true">/</li>
            </>
          ) : null}
          <li aria-current="page">{category.name}</li>
        </ol>
      </nav>

      <div className="page-header">
        <div>
          <p className="eyebrow">{department ? department.name : 'Category'}</p>
          <h1>{category.name}</h1>
          <p className="muted-copy">{category.description}</p>
        </div>
      </div>

      {children.length > 0 ? (
        <ul className="pill-nav" aria-label="Subcategories">
          {children.map((child) => (
            <li key={child.slug}>
              <Link href={`/categories/${child.slug}`}>{child.name}</Link>
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
              <h2>No products in {category.name} yet</h2>
              <p>Try removing some filters{department ? <> or explore <Link href={`/shop?department=${department.slug}`}>all {department.name.toLowerCase()}</Link></> : null}.</p>
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
