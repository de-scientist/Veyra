'use client';

import { useEffect, useState } from 'react';

import { addToWishlist, getWishlist, removeWishlistItem } from '../lib/shopping-api';
import { useToast } from './Toast';

type WishlistButtonProps = { productId: string };

export function WishlistButton({ productId }: WishlistButtonProps) {
  const { notify } = useToast();
  const [itemId, setItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWishlist().then((wishlist) => {
      setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
    }).catch(() => undefined);
  }, [productId]);

  async function toggle() {
    setBusy(true);
    try {
      if (itemId) {
        const wishlist = await removeWishlistItem(itemId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
        notify('info', 'Removed from your wishlist.');
      } else {
        const wishlist = await addToWishlist(productId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
        notify('success', 'Saved to your wishlist.');
      }
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Sign in to save products.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <button type="button" className="button button--secondary wishlist-button" onClick={toggle} disabled={busy} aria-busy={busy} aria-label={itemId ? 'Remove from wishlist' : 'Add to wishlist'}>
        {itemId ? 'Saved ✓' : 'Save'}
      </button>
    </span>
  );
}
