'use client';

import { useRef, useState } from 'react';

import type { Product } from '../lib/catalog';
import { ratingSummary } from '../lib/product-card';
import { ProductRating } from './ProductRating';
import { ProductSpecifications } from './ProductSpecifications';

const TABS = ['Description', 'Specifications', 'Reviews'] as const;

/**
 * Accessible product information tabs (shadcn-Tabs pattern, JB tokens):
 * arrow-key navigation, aria-selected/tabpanel linkage, full content in the
 * DOM only for the active panel. Reviews reflect the authoritative backend
 * rating — no fabricated reviews, no submission form without an endpoint.
 */
export function ProductTabs({ product }: { product: Product }) {
  const [active, setActive] = useState<(typeof TABS)[number]>('Description');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rating = ratingSummary(product);
  const specCount = Object.keys(product.specs ?? {}).length + (product.brand ? 1 : 0);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
    setActive(TABS[next]);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="section-block product-tabs" aria-label="Product information">
      <div className="product-tabs__list" role="tablist" aria-label="Product information sections">
        {TABS.map((tab, index) => (
          <button
            key={tab}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`product-tab-${tab}`}
            aria-selected={active === tab}
            aria-controls={`product-panel-${tab}`}
            tabIndex={active === tab ? 0 : -1}
            className={`product-tabs__tab${active === tab ? ' is-active' : ''}`}
            onClick={() => setActive(tab)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab}
            {tab === 'Reviews' && rating ? ` (${rating.count})` : ''}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="product-panel-Description"
        aria-labelledby="product-tab-Description"
        hidden={active !== 'Description'}
        className="product-tabs__panel"
      >
        {active === 'Description' ? (
          <>
            <h2>About this product</h2>
            <p className="muted-copy" style={{ maxWidth: '70ch' }}>{product.description}</p>
          </>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id="product-panel-Specifications"
        aria-labelledby="product-tab-Specifications"
        hidden={active !== 'Specifications'}
        className="product-tabs__panel"
      >
        {active === 'Specifications' ? (
          specCount > 0 ? (
            <ProductSpecifications product={product} />
          ) : (
            <div>
              <h2>Specifications</h2>
              <p className="muted-copy">Detailed specifications have not been published for this product yet.</p>
            </div>
          )
        ) : null}
      </div>

      <div
        role="tabpanel"
        id="product-panel-Reviews"
        aria-labelledby="product-tab-Reviews"
        hidden={active !== 'Reviews'}
        className="product-tabs__panel"
      >
        {active === 'Reviews' ? (
          <>
            <h2>Reviews</h2>
            {rating ? (
              <div style={{ display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
                <ProductRating average={rating.average} count={rating.count} productName={product.name} />
                <p className="muted-copy">
                  Rated {rating.average.toFixed(1)} out of 5 from {rating.count} verified {rating.count === 1 ? 'review' : 'reviews'}.
                </p>
              </div>
            ) : (
              <p className="muted-copy">No reviews yet for {product.name}. Check back after fellow shoppers share their experience.</p>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}
