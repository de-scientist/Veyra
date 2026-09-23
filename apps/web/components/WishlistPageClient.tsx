'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getWishlist, removeWishlistItem, type WishlistItem } from '../lib/shopping-api';
import { PriceDisplay } from './PriceDisplay';

export function WishlistPageClient() {
  const [items, setItems] = useState<WishlistItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getWishlist().then((wishlist) => setItems(wishlist.items)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Sign in to view your wishlist.'));
  }, []);

  if (error) return <div className="empty-state"><h1>Your wishlist is private</h1><p>{error}</p><Link className="button" href="/account">Sign in</Link></div>;
  if (!items) return <div className="empty-state"><p>Loading your wishlist...</p></div>;
  if (!items.length) return <div className="empty-state"><h1>Your wishlist is waiting</h1><p>Save products you want to revisit when you are ready.</p><Link className="button" href="/shop">Explore the shop</Link></div>;

  return <div><div className="section-heading"><h1>Your wishlist</h1><span>{items.length} saved</span></div><div className="wishlist-grid">{items.map((item) => <article className="wishlist-item" key={item.id}>{item.product.image ? <img src={item.product.image} alt={item.product.name} /> : <div className="cart-item__placeholder">No image</div>}<div className="wishlist-item__body"><p className="eyebrow">{item.product.availability === 'AVAILABLE' ? 'Available' : item.product.availability === 'OUT_OF_STOCK' ? 'Out of stock' : 'No longer available'}</p><h2>{item.product.name}</h2><PriceDisplay price={item.product.price} /><div className="cta-row"><Link className="button" href={`/products/${item.product.slug}`}>{item.product.hasVariantSelection ? 'Choose options' : 'View product'}</Link><button type="button" className="text-button" onClick={() => removeWishlistItem(item.id).then((wishlist) => setItems(wishlist.items)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to remove item.'))}>Remove</button></div></div></article>)}</div></div>;
}
