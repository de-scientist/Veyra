'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { addToCart, notifyCartUpdated } from '../lib/shopping-api';
import { attributeDef, type ProductVariant } from '../lib/catalog';
import { OptionButton, Swatch } from './AttributeControls';
import { JBButtonLoader, QuantityStepper } from './JBLoading';
import { PriceDisplay } from './PriceDisplay';
import { useToast } from './Toast';
import { WishlistButton } from './WishlistButton';

type ProductActionsProps = { productId: string; productName: string; variants: ProductVariant[] };

/**
 * Schema-driven variant selection. Attribute groups render by control type
 * (Color → swatches, sizes/capacities → buttons); the matching variant is
 * resolved from the selected combination, so invalid combos can't be chosen.
 * Buy Now reuses the existing cart + checkout architecture (add selected
 * items, then route to `/checkout`) — no separate immediate-checkout API.
 */
export function ProductActions({ productId, productName, variants }: ProductActionsProps) {
  const { notify } = useToast();
  const router = useRouter();

  const groups = useMemo(() => {
    const order: string[] = [];
    const values = new Map<string, Set<string>>();
    for (const variant of variants) {
      for (const [attr, value] of Object.entries(variant.attributes)) {
        if (!values.has(attr)) {
          values.set(attr, new Set());
          order.push(attr);
        }
        values.get(attr)!.add(value);
      }
    }
    return order
      .map((attribute) => ({ attribute, values: [...values.get(attribute)!].sort() }))
      .filter((group) => group.values.length > 1 || variants.length > 1);
  }, [variants]);

  const firstAvailable = variants.find((variant) => variant.inStock);
  const [selection, setSelection] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (firstAvailable) {
      for (const [attr, value] of Object.entries(firstAvailable.attributes)) initial[attr] = value;
    }
    return initial;
  });
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'cart' | 'buy' | null>(null);

  const selectedVariant =
    variants.find((variant) =>
      Object.entries(selection).every(([attr, value]) => variant.attributes[attr] === value),
    ) ?? firstAvailable;

  // Authoritative per-variant ceiling when the backend exposes it; the
  // backend still validates on write, this only keeps the UI honest.
  const maxQuantity = selectedVariant?.availableQuantity && selectedVariant.availableQuantity > 0
    ? Math.min(selectedVariant.availableQuantity, 20)
    : 20;

  function isAvailable(attribute: string, value: string): boolean {
    const combo = { ...selection, [attribute]: value };
    return variants.some(
      (variant) =>
        variant.inStock && Object.entries(combo).every(([attr, val]) => variant.attributes[attr] === val),
    );
  }

  async function submit() {
    if (!selectedVariant?.inStock || busy) return;
    setBusy('cart');
    setError('');
    try {
      await addToCart(selectedVariant.id, quantity);
      notifyCartUpdated();
      notify('success', `${productName} added to cart.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update your cart.');
    } finally {
      setBusy(null);
    }
  }

  async function buyNow() {
    if (!selectedVariant?.inStock || busy) return;
    setBusy('buy');
    setError('');
    try {
      await addToCart(selectedVariant.id, quantity);
      notifyCartUpdated();
      router.push('/checkout');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start checkout.');
      setBusy(null);
    }
  }

  return (
    <div className="product-actions">
      {groups.map(({ attribute, values }) => {
        const def = attributeDef(attribute);
        return (
          <div className="variant-panel" key={attribute}>
            <h2 className="attr-label">
              {attribute}
              <span className="attr-label__value">{selection[attribute] ?? 'Select an option'}</span>
            </h2>
            {def.control === 'swatch' ? (
              <div className="filter-swatches" role="group" aria-label={`Select ${attribute}`}>
                {values.map((value) => (
                  <Swatch
                    key={value}
                    value={value}
                    selected={selection[attribute] === value}
                    disabled={!isAvailable(attribute, value)}
                    onSelect={() => setSelection((current) => ({ ...current, [attribute]: value }))}
                  />
                ))}
              </div>
            ) : (
              <div className="variant-list" role="group" aria-label={`Select ${attribute}`}>
                {values.map((value) => (
                  <OptionButton
                    key={value}
                    value={value}
                    selected={selection[attribute] === value}
                    disabled={!isAvailable(attribute, value)}
                    onSelect={() => setSelection((current) => ({ ...current, [attribute]: value }))}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {selectedVariant ? (
        <div className="product-actions__selection" role="status">
          <PriceDisplay price={selectedVariant.price} compareAtPrice={selectedVariant.compareAtPrice} />
          <p className="muted-copy">
            SKU {selectedVariant.sku} · {selectedVariant.inStock ? 'In stock' : 'Out of stock'}
            {selectedVariant.inventoryLabel ? ` · ${selectedVariant.inventoryLabel}` : null}
          </p>
        </div>
      ) : null}

      <QuantityStepper
        value={quantity}
        max={maxQuantity}
        disabled={!selectedVariant?.inStock || busy !== null}
        onChange={setQuantity}
      />
      <div className="cta-row">
        <button
          type="button"
          className="button"
          disabled={!selectedVariant?.inStock || busy !== null}
          onClick={submit}
          aria-busy={busy === 'cart'}
        >
          {busy === 'cart' ? <JBButtonLoader label="Adding…" /> : selectedVariant?.inStock ? 'Add to cart' : 'Out of stock'}
        </button>
        {selectedVariant?.inStock ? (
          <button
            type="button"
            className="button button--secondary"
            disabled={busy !== null}
            onClick={buyNow}
            aria-busy={busy === 'buy'}
          >
            {busy === 'buy' ? <JBButtonLoader label="Starting checkout…" /> : 'Buy now'}
          </button>
        ) : null}
        <WishlistButton productId={productId} productName={productName} />
      </div>
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </div>
  );
}
