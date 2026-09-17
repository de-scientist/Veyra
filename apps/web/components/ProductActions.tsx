'use client';

import { useState } from 'react';

import { addToCart } from '../lib/shopping-api';
import { WishlistButton } from './WishlistButton';
import type { ProductVariant } from '../lib/storefront-data';

type ProductActionsProps = { productId: string; variants: ProductVariant[] };

export function ProductActions({ productId, variants }: ProductActionsProps) {
  const firstAvailable = variants.find((variant) => variant.inStock);
  const [selectedVariantId, setSelectedVariantId] = useState(firstAvailable?.id ?? variants[0]?.id);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId);

  async function submit() {
    if (!selectedVariant?.inStock) return;
    setBusy(true);
    setMessage('');
    try {
      await addToCart(selectedVariant.id, quantity);
      setMessage('Added to your cart.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update your cart.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="product-actions">
      <div className="variant-panel">
        <h2>Available options</h2>
        <div className="variant-list" role="listbox" aria-label="Product variants">
          {variants.map((variant) => (
            <button key={variant.id} type="button" className={`variant-pill ${variant.id === selectedVariantId ? 'is-selected' : ''} ${variant.inStock ? '' : 'is-disabled'}`} disabled={!variant.inStock} onClick={() => setSelectedVariantId(variant.id)} aria-pressed={variant.id === selectedVariantId}>
              {variant.name}
            </button>
          ))}
        </div>
      </div>
      <div className="quantity-row">
        <label htmlFor="quantity">Quantity</label>
        <input id="quantity" type="number" min="1" max="20" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.min(20, Number((event.target as unknown as { value: string }).value) || 1)))} />
      </div>
      <div className="cta-row">
        <button type="button" className="button" disabled={!selectedVariant?.inStock || busy} onClick={submit}>
          {selectedVariant?.inStock ? 'Add to cart' : 'Out of stock'}
        </button>
        <WishlistButton productId={productId} />
      </div>
      {message ? <p className="inline-message" role="status">{message}</p> : null}
    </div>
  );
}
