/**
 * Route-level loading skeletons for catalogue discovery (Phase G).
 * Server-safe (no client hooks): static markup mirroring the toolbar +
 * product-grid layout so navigation never shows a blank screen and layout
 * shift is minimal. Uses the existing `.skeleton` theme tokens (light/dark
 * aware, reduced-motion safe via the global rule).
 */
export function DiscoverySkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <main className="container page-shell" aria-busy="true" aria-label="Loading products">
      <div className="skeleton" style={{ width: '40%', height: '2rem' }} aria-hidden="true" />
      <div className="toolbar" aria-hidden="true">
        <span className="skeleton" style={{ width: '8rem', height: '1.25rem' }} />
        <span className="skeleton" style={{ width: '12rem', height: '2.25rem' }} />
      </div>
      <div className="product-grid" aria-hidden="true">
        {Array.from({ length: cards }, (_, index) => (
          <div key={index} className="skeleton skeleton--card" />
        ))}
      </div>
      <span className="visually-hidden" role="status">Loading products…</span>
    </main>
  );
}

/** PDP-shaped skeleton: gallery slot + summary lines. */
export function ProductDetailSkeleton() {
  return (
    <main className="container page-shell" aria-busy="true" aria-label="Loading product">
      <div className="skeleton" style={{ width: '55%', height: '1.25rem', marginBottom: '1.5rem' }} aria-hidden="true" />
      <div className="product-layout" aria-hidden="true">
        <div className="skeleton" style={{ minHeight: '24rem', borderRadius: 'var(--jb-radius-lg)' }} />
        <div>
          <div className="skeleton" style={{ width: '70%', height: '2.25rem', marginBottom: '1rem' }} />
          <div className="skeleton" style={{ width: '40%', height: '1.5rem', marginBottom: '1rem' }} />
          <div className="skeleton" style={{ width: '90%', height: '4rem', marginBottom: '1.5rem' }} />
          <div className="skeleton" style={{ width: '12rem', height: '2.75rem' }} />
        </div>
      </div>
      <span className="visually-hidden" role="status">Loading product…</span>
    </main>
  );
}
