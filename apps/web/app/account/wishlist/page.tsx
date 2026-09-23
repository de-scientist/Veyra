'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountWishlist } from '../../../lib/shopping-api';

type WishlistSummary = {
  count: number;
  items: Array<{ id: string; productId: string; product: { name: string; slug: string; image: string | null } }>;
};

export default function AccountWishlistPage() {
  const [data, setData] = useState<WishlistSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAccountWishlist()
      .then((w) => {
        if (mounted) setData(w);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load wishlist');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="empty-state"><p>Loading wishlist…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load wishlist</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Wishlist</h1>
          <p className="muted-copy">{data?.count ?? 0} saved item{(data?.count ?? 0) !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/wishlist" className="button button--secondary">Manage Wishlist</Link>
      </header>

      {!data || data.items.length === 0 ? (
        <div className="empty-state">
          <h2>Your wishlist is empty</h2>
          <p>Save products you love to find them quickly later.</p>
          <Link href="/shop" className="button">Discover Products</Link>
        </div>
      ) : (
        <section className="wishlist-grid" aria-label="Saved products">
          {data.items.map((item) => (
            <Link key={item.id} href={`/products/${item.product.slug}`} className="wishlist-item">
              {item.product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.product.image} alt={item.product.name} loading="lazy" />
              ) : (
                <div className="cart-item__placeholder">No image</div>
              )}
              <div className="wishlist-item__body">
                <h2>{item.product.name}</h2>
              </div>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
