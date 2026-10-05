import type { Metadata } from 'next';

import { CartPageClient } from '../../components/CartPageClient';

export const metadata: Metadata = { title: 'Cart | JB Mercantile', robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <main className="container page-shell">
      <nav aria-label="Breadcrumb" className="breadcrumbs">
        <ol>
          <li><a href="/">Home</a></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Cart</li>
        </ol>
      </nav>
      <CartPageClient />
    </main>
  );
}
