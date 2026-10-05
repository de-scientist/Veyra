'use client';

import { useEffect, useState } from 'react';

import { addToWishlist, getWishlist, notifyWishlistUpdated, removeWishlistItem } from '../lib/shopping-api';
import { JBIcon } from './JBIcons';
import { useToast } from './Toast';

/**
 * Burst-safe wishlist read: every card on a grid mounts at once, so the
 * in-flight `GET /wishlist` is shared instead of firing N identical
 * requests. Results are never cached — each mount revalidates through the
 * single shared flight, and toggles write through the server response.
 */
let wishlistFlight: Promise<{ id: string; items: Array<{ id: string; productId: string }> }> | null = null;

function sharedWishlist() {
  if (!wishlistFlight) {
    wishlistFlight = getWishlist().finally(() => {
      wishlistFlight = null;
    });
  }
  return wishlistFlight;
}

type WishlistButtonProps = { productId: string; productName: string };

export function WishlistButton({ productId, productName }: WishlistButtonProps) {
  const { notify } = useToast();
  const [itemId, setItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    sharedWishlist().then((wishlist) => {
      if (mounted) setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [productId]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (itemId) {
        const wishlist = await removeWishlistItem(itemId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
        notifyWishlistUpdated();
        notify('info', `Removed ${productName} from your wishlist.`);
      } else {
        const wishlist = await addToWishlist(productId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
        notifyWishlistUpdated();
        notify('success', `Saved ${productName} to your wishlist.`);
      }
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Sign in to save products.');
    } finally {
      setBusy(false);
    }
  }

  const saved = itemId !== null;
  return (
    <button
      type="button"
      className={`wishlist-button${saved ? ' wishlist-button--active' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-busy={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`}
      title={saved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`}
    >
      <JBIcon name="heart" size={18} />
      <span className="wishlist-button__text" aria-hidden="true">{saved ? 'Saved' : 'Save'}</span>
    </button>
  );
}
