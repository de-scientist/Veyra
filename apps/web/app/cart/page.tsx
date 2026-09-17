import type { Metadata } from 'next';

import { CartPageClient } from '../../components/CartPageClient';

export const metadata: Metadata = { title: 'Cart | Veyra', robots: { index: false, follow: false } };

export default function CartPage() {
  return <main className="container page-shell"><nav aria-label="Breadcrumb" className="breadcrumbs"><a href="/">Home</a><span>/</span><span>Cart</span></nav><CartPageClient /></main>;
}
