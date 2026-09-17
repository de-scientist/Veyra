import type { Metadata } from 'next';

import { WishlistPageClient } from '../../components/WishlistPageClient';

export const metadata: Metadata = { title: 'Wishlist | Veyra', robots: { index: false, follow: false } };

export default function WishlistPage() {
  return <main className="container page-shell"><nav aria-label="Breadcrumb" className="breadcrumbs"><a href="/">Home</a><span>/</span><span>Wishlist</span></nav><WishlistPageClient /></main>;
}
