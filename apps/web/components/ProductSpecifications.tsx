import type { Product } from '../lib/catalog';

/**
 * Schema-driven specifications: the same table renders apparel facts
 * (Material/Fit/Care) and appliance facts (Capacity/Power/Voltage)
 * with no category special-casing.
 */
export function ProductSpecifications({ product }: { product: Product }) {
  const rows: Array<[string, string]> = [];
  if (product.brand) rows.push(['Brand', product.brand]);
  for (const [key, value] of Object.entries(product.specs ?? {})) {
    rows.push([key, value]);
  }
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="product-specs-heading">
      <h2 id="product-specs-heading">Specifications</h2>
      <div className="spec-table">
        <dl>
          {rows.map(([term, detail]) => (
            <div key={term} className="spec-table__row">
              <dt>{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
