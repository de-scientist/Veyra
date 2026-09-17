'use client';

import { useEffect, useState } from 'react';

import { addToWishlist, getWishlist, removeWishlistItem } from '../lib/shopping-api';

type WishlistButtonProps = { productId: string };

export function WishlistButton({ productId }: WishlistButtonProps) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWishlist().then((wishlist) => {
      setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
    }).catch(() => undefined);
  }, [productId]);

  async function toggle() {
    setBusy(true);
    setMessage('');
    try {
      if (itemId) {
        const wishlist = await removeWishlistItem(itemId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
      } else {
        const wishlist = await addToWishlist(productId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign in to save products.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button type="button" className="button button--secondary wishlist-button" onClick={toggle} disabled={busy} aria-label={itemId ? 'Remove from wishlist' : 'Add to wishlist'}>
        {itemId ? 'Saved' : 'Save'}
      </button>
      {message ? <span className="inline-message" role="status">{message}</span> : null}
    </span>
  );
}
