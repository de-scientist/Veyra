'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';

import { quickAddVariant } from '../lib/product-card';
import type { Product } from '../lib/catalog';
import { addToCart, notifyCartUpdated } from '../lib/shopping-api';
import { JBIcon } from './JBIcons';
import { useToast } from './Toast';

/**
 * Card-level purchase action. Single-variant, in-stock products quick-add
 * through the existing cart API (`POST /cart/items` + `jb:cart-updated`
 * sync + toast — no second cart store). Anything needing configuration
 * links to the PDP ("Choose Options"); unavailable products render a
 * disabled action while wishlist + PDP navigation stay live.
 */
export function ProductCardActions({ product }: { product: Product }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const target = quickAddVariant(product);
  const inStock = product.variants.some((variant) => variant.inStock);

  async function quickAdd() {
    if (!target || busy) return;
    setBusy(true);
    try {
      await addToCart(target.id, 1);
      notifyCartUpdated();
      notify('success', `${product.name} added to cart.`);
      setAdded(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAdded(false), 2000);
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Unable to add to cart.');
    } finally {
      setBusy(false);
    }
  }

  if (!inStock) {
    return (
      <button type="button" className="button button--secondary product-card__action" disabled aria-disabled="true">
        Out of stock
      </button>
    );
  }

  if (!target) {
    return (
      <Link href={`/products/${product.slug}` as Route} className="button button--secondary product-card__action" aria-label={`Choose options for ${product.name}`}>
        Choose Options
      </Link>
    );
  }

  return (
    <button
      type="button"
      className="button product-card__action"
      onClick={quickAdd}
      disabled={busy}
      aria-busy={busy}
      aria-label={added ? `${product.name} added to cart` : `Add ${product.name} to cart`}
    >
      {busy ? 'Adding…' : added ? (<><JBIcon name="check" size={16} /> Added</>) : (<><JBIcon name="cart" size={16} /> Add to Cart</>)}
    </button>
  );
}
