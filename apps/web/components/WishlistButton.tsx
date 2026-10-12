'use client';

import { useEffect, useState } from 'react';

import { PRODUCT_SUCCESS, toProductError } from '../lib/product-feedback';
import { addToWishlist, getWishlist, notifyWishlistUpdated, removeWishlistItem } from '../lib/shopping-api';
import { JBIcon } from './JBIcons';
import { useToast } from './Toast';
import { Tooltip } from './ui/tooltip';

/**
 * Burst-safe wishlist read: every card on a grid mounts at once, so the
 * in-flight `GET /wishlist` is shared instead of firing N identical
 * requests. Results are never cached — each mount revalidates through the
 * single shared flight, and toggles write through the server response.
 *
 * Feedback ownership: exactly one toast per completed toggle, emitted here.
 * Success only after the backend confirms; failures go through the shared
 * `toProductError` mapper (guest/401 → "Sign in required").
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
  const { notifyCard } = useToast();
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
        notifyCard('success', PRODUCT_SUCCESS.wishlistRemoved.title, `${productName} — ${PRODUCT_SUCCESS.wishlistRemoved.description}`);
      } else {
        const wishlist = await addToWishlist(productId);
        setItemId(wishlist.items.find((item) => item.productId === productId)?.id ?? null);
        notifyWishlistUpdated();
        notifyCard('success', PRODUCT_SUCCESS.wishlistAdded.title, `${productName} — ${PRODUCT_SUCCESS.wishlistAdded.description}`);
      }
    } catch (error) {
      const feedback = toProductError(error, 'wishlist');
      notifyCard('error', feedback.title, feedback.description);
    } finally {
      setBusy(false);
    }
  }

  const saved = itemId !== null;
  const label = saved ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`;
  return (
    <Tooltip label={label}>
      <button
        type="button"
        className={`wishlist-button${saved ? ' wishlist-button--active' : ''}`}
        onClick={toggle}
        disabled={busy}
        aria-busy={busy}
        aria-pressed={saved}
        aria-label={label}
      >
        <JBIcon name="heart" size={18} />
        <span className="wishlist-button__text" aria-hidden="true">{saved ? 'Saved' : 'Save'}</span>
      </button>
    </Tooltip>
  );
}
