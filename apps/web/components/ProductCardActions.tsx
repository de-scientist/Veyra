'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';

import { quickAddVariant } from '../lib/product-card';
import { PRODUCT_SUCCESS, toProductError } from '../lib/product-feedback';
import type { Product } from '../lib/catalog';
import { addToCart, notifyCartUpdated } from '../lib/shopping-api';
import { JBIcon } from './JBIcons';
import { useToast } from './Toast';
import { UIButton, uiButtonClasses } from './ui/button';
import { Tooltip } from './ui/tooltip';

/**
 * Card-level purchase action. Single-variant, in-stock products quick-add
 * through the existing cart API (`POST /cart/items` + `jb:cart-updated`
 * sync + toast — no second cart store). Anything needing configuration
 * links to the PDP ("Choose Options"); unavailable products render a
 * disabled action while wishlist + PDP navigation stay live.
 *
 * Feedback: exactly one toast per completed action, emitted here (the
 * mutation owner) — never in both the hook and the caller. Success toasts
 * fire only after the backend confirms; errors go through the shared
 * `toProductError` mapper so shoppers never see internals.
 */
export function ProductCardActions({ product }: { product: Product }) {
  const { notifyCard } = useToast();
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
      notifyCard('success', PRODUCT_SUCCESS.addedToCart.title, `${product.name} — ${PRODUCT_SUCCESS.addedToCart.description}`);
      setAdded(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setAdded(false), 2000);
    } catch (error) {
      const feedback = toProductError(error, 'cart');
      notifyCard('error', feedback.title, feedback.description);
    } finally {
      setBusy(false);
    }
  }

  if (!inStock) {
    return (
      <Tooltip label="This product is currently unavailable">
        <UIButton variant="secondary" size="md" className="product-card__action" disabled aria-disabled="true">
          Out of stock
        </UIButton>
      </Tooltip>
    );
  }

  if (!target) {
    return (
      <Link
        href={`/products/${product.slug}` as Route}
        className={uiButtonClasses({ variant: 'secondary', size: 'md', className: 'product-card__action' })}
        aria-label={`Choose options for ${product.name}`}
      >
        Choose Options
      </Link>
    );
  }

  return (
    <UIButton
      variant="primary"
      size="md"
      className="product-card__action"
      onClick={quickAdd}
      disabled={busy}
      loading={busy}
      aria-label={added ? `${product.name} added to cart` : `Add ${product.name} to cart`}
    >
      {busy ? 'Adding…' : added ? (<><JBIcon name="check" size={16} /> Added</>) : (<><JBIcon name="cart" size={16} /> Add to Cart</>)}
    </UIButton>
  );
}
