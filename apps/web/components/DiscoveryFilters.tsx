'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { useModalFocus } from './a11y';
import { FacetControl } from './AttributeControls';
import {
  discoveryQueryString,
  type DepartmentSlug,
  type DiscoveryQuery,
  type Facet,
  type PriceBucket,
} from '../lib/catalog';

export type FixedParams = { department?: DepartmentSlug; category?: string; q?: string };

type FilterProps = {
  facets: Facet[];
  priceBuckets: PriceBucket[];
  query: DiscoveryQuery;
  basePath: string;
  /** Params preserved across filter changes (department/category/q). */
  fixed: FixedParams;
  selectedMaxPrice?: number | null;
  /** Prefix for control ids (avoids duplicates between sidebar + sheet instances). */
  idPrefix?: string;
};

function pushQuery(router: ReturnType<typeof useRouter>, basePath: string, fixed: FixedParams, query: DiscoveryQuery) {
  router.push(`${basePath}${discoveryQueryString({ ...query, ...fixed, page: 1 })}` as never, { scroll: false });
}

export function FilterPanel({ facets, priceBuckets, query, basePath, fixed, selectedMaxPrice, idPrefix = '' }: FilterProps) {
  const router = useRouter();
  const attrs = query.attrs ?? {};

  function toggleFacet(attribute: string, value: string) {
    const current = attrs[attribute] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    pushQuery(router, basePath, fixed, { ...query, attrs: { ...attrs, [attribute]: next } });
  }

  function toggleStock() {
    pushQuery(router, basePath, fixed, { ...query, inStockOnly: !query.inStockOnly });
  }

  function selectPrice(max: number | null) {
    const params = new URLSearchParams(discoveryQueryString({ ...query, ...fixed, page: 1 }).slice(1));
    params.delete('maxPrice');
    if (max !== null) params.set('maxPrice', String(max));
    const s = params.toString();
    router.push(`${basePath}${s ? `?${s}` : ''}` as never, { scroll: false });
  }

  function clearAll() {
    const params = new URLSearchParams();
    if (fixed.department) params.set('department', fixed.department);
    if (fixed.category) params.set('category', fixed.category);
    if (fixed.q) params.set('q', fixed.q);
    const s = params.toString();
    router.push(`${basePath}${s ? `?${s}` : ''}` as never, { scroll: false });
  }

  const activeCount =
    Object.values(attrs).reduce((n, v) => n + v.length, 0) + (query.inStockOnly ? 1 : 0) + (selectedMaxPrice ? 1 : 0);

  return (
    <div>
      <div className="filter-panel__header">
        <h2>Filters</h2>
        {activeCount > 0 ? (
          <button type="button" className="text-button" onClick={clearAll}>
            Clear all ({activeCount})
          </button>
        ) : null}
      </div>

      <div className="filter-group">
        <h3>Availability</h3>
        <label className="facet-option" htmlFor={`${idPrefix}facet-instock`}>
          <input id={`${idPrefix}facet-instock`} type="checkbox" checked={!!query.inStockOnly} onChange={toggleStock} />
          <span>In stock only</span>
        </label>
      </div>

      {priceBuckets.length > 0 ? (
        <div className="filter-group">
          <h3>Price</h3>
          <div role="group" aria-label="Filter by price">
            {priceBuckets.map((bucket) => {
              const id = `${idPrefix}price-${bucket.min}-${bucket.max ?? 'max'}`;
              return (
                <label key={id} className="facet-option" htmlFor={id}>
                  <input
                    id={id}
                    type="radio"
                    name="maxPrice"
                    checked={selectedMaxPrice === bucket.max}
                    onChange={() => selectPrice(bucket.max)}
                  />
                  <span>{bucket.label}</span>
                </label>
              );
            })}
            {selectedMaxPrice ? (
              <button type="button" className="text-button" onClick={() => selectPrice(null)}>
                Clear price filter
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {facets.map((facet) => (
        <div className="filter-group" key={facet.attribute}>
          <h3>{facet.attribute}</h3>
          <FacetControl facet={facet} selected={attrs[facet.attribute] ?? []} onToggle={(value) => toggleFacet(facet.attribute, value)} idPrefix={idPrefix} />
        </div>
      ))}

      {facets.length === 0 && priceBuckets.length === 0 ? (
        <p className="muted-copy">No further filters for this selection.</p>
      ) : null}
    </div>
  );
}

/** Mobile filter entry point: toggle button + bottom sheet reusing the same panel. */
export function FilterSheetHost(props: FilterProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Modal bottom sheet: trap, Escape, scroll-lock, focus restore to Filters button.
  const sheetRef = useModalFocus({ active: open, onClose: () => setOpen(false), initialFocusRef: closeRef });
  return (
    <>
      <button
        type="button"
        className="button button--secondary button--small filter-drawer-toggle"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="jb-filter-sheet"
      >
        Filters
      </button>
      {open ? (
        <>
          <div className="sheet-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div ref={sheetRef} id="jb-filter-sheet" className="sheet" role="dialog" aria-modal="true" aria-label="Product filters">
            <div className="sheet__handle" aria-hidden="true" />
            <div className="sheet__header">
              <h2>Filters</h2>
              <button ref={closeRef} type="button" className="button button--secondary button--small" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <FilterPanel {...props} idPrefix="sheet-" />
            <div className="sheet__footer">
              <button type="button" className="button" onClick={() => setOpen(false)}>
                Show results
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A–Z' },
] as const;

export function SortControl({ value }: { value: string }) {
  const router = useRouter();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem' }}>
      <label htmlFor="discovery-sort" className="eyebrow">Sort</label>
      <select
        id="discovery-sort"
        value={value}
        onChange={(e) => {
          const params = new URLSearchParams(window.location.search);
          params.set('sort', e.target.value);
          params.delete('page');
          router.push(`${window.location.pathname}?${params.toString()}` as never, { scroll: false });
        }}
      >
        {SORTS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </span>
  );
}
