import Link from 'next/link';

import { ProductCard } from '../../components/ProductCard';
import { getPublicProducts } from '../../lib/storefront-data';

export default function ShopPage() {
  const products = getPublicProducts();

  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <p className="eyebrow">Shop</p>
          <h1>All essentials</h1>
        </div>
        <p>{products.length} pieces</p>
      </div>

      <div className="product-grid">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      <div className="cta-row">
        <Link href="/" className="button button--secondary">Back home</Link>
      </div>
    </main>
  );
}
