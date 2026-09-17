import type { Metadata } from 'next';

import { CheckoutPageClient } from '../../components/CheckoutPageClient';

export const metadata: Metadata = { title: 'Checkout | Veyra', robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return <main className="container page-shell"><nav aria-label="Breadcrumb" className="breadcrumbs"><a href="/">Home</a><span>/</span><a href="/cart">Cart</a><span>/</span><span>Checkout</span></nav><CheckoutPageClient /></main>;
}
