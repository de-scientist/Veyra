'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  addToWishlist,
  clearCart,
  getCart,
  notifyCartUpdated,
  notifyWishlistUpdated,
  removeCartItem,
  updateCartItem,
  type Cart,
} from '../lib/shopping-api';
import { JBAlert, CartSkeleton, JBButtonLoader, QuantityStepper } from './JBLoading';
import { JBConfirmDialog } from './ConfirmDialog';
import { JBLogo } from './JBLogo';
import { PriceDisplay } from './PriceDisplay';
import { useToast } from './Toast';

/**
 * Cart page client: backend-authoritative quantities and totals, accessible
 * steppers with per-item busy guards, move-to-wishlist, and a branded
 * empty state. Never reloads the page; checkout recalculates final totals.
 */
export function CartPageClient() {
  const { notify } = useToast();
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState('');
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    getCart().then(setCart).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load your cart.'));
  }, []);

  function refresh(next: Cart) {
    setCart(next);
    notifyCartUpdated();
  }

  async function update(itemId: string, quantity: number) {
    if (busyItem) return;
    setBusyItem(itemId);
    setError('');
    try {
      refresh(await updateCartItem(itemId, quantity));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update your cart.');
    } finally {
      setBusyItem(null);
    }
  }

  async function remove(itemId: string, productName: string) {
    if (busyItem) return;
    setBusyItem(itemId);
    setError('');
    try {
      refresh(await removeCartItem(itemId));
      notify('info', `Removed ${productName} from your cart.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to remove that item.');
    } finally {
      setBusyItem(null);
    }
  }

  async function moveToWishlist(itemId: string, productId: string, productName: string) {
    if (busyItem) return;
    setBusyItem(itemId);
    setError('');
    try {
      await addToWishlist(productId);
      notifyWishlistUpdated();
      refresh(await removeCartItem(itemId));
      notify('success', `Moved ${productName} to your wishlist.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to move that item.');
    } finally {
      setBusyItem(null);
    }
  }

  async function clear() {
    setClearing(true);
    try {
      const next = await clearCart();
      setCart(next);
      notifyCartUpdated();
      setConfirmClear(false);
      notify('info', 'Your cart is now empty.');
    } catch {
      setError('Unable to clear your cart.');
    } finally {
      setClearing(false);
    }
  }

  function proceedToCheckout() {
    if (!cart || cart.items.length === 0 || checkingOut) return;
    setCheckingOut(true);
    router.push('/checkout');
  }

  if (error && !cart) {
    return (
      <JBAlert
        tone="error"
        title="We could not load your cart"
        message={error}
        actionLabel="Try again"
        onAction={() => {
          setError('');
          getCart().then(setCart).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load your cart.'));
        }}
      />
    );
  }
  if (!cart) return <CartSkeleton />;
  if (!cart.items.length) {
    return (
      <div className="empty-state empty-state--branded">
        <span aria-hidden="true"><JBLogo variant="compact" alt="" height={36} /></span>
        <h1>Your cart is empty</h1>
        <p>Looks like you haven&apos;t added anything yet. Explore fashion, footwear, and kitchen &amp; home essentials to get started.</p>
        <div className="cta-row" style={{ justifyContent: 'center' }}>
          <Link className="button" href="/shop">Start shopping</Link>
          <Link className="button button--secondary" href="/wishlist">View wishlist</Link>
        </div>
      </div>
    );
  }

  const hasAvailabilityIssue = cart.items.some((item) => item.availability !== 'AVAILABLE' || item.priceChanged);

  return (
    <div className="cart-layout">
      <section aria-labelledby="cart-heading">
        <div className="section-heading">
          <h1 id="cart-heading">Shopping cart</h1>
          <span role="status">{cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}</span>
        </div>
        {error ? <JBAlert tone="error" title="Cart update failed" message={error} /> : null}
        {hasAvailabilityIssue ? (
          <JBAlert
            tone="warning"
            title="Review items before checkout"
            message="Some prices or availability changed since you added these items. Final totals are recalculated at checkout."
          />
        ) : null}
        <div className="cart-items">
          {cart.items.map((item) => (
            <article key={item.id} className="cart-item" aria-label={`${item.product.name}, ${item.variant.name}`}>
              {item.product.image ? (
                <img src={item.product.image} alt="" loading="lazy" />
              ) : (
                <div className="cart-item__placeholder">No image</div>
              )}
              <div className="cart-item__content">
                <Link href={`/products/${item.product.slug}`}><h2>{item.product.name}</h2></Link>
                <p>{item.variant.name}</p>
                <p className="muted-copy">
                  SKU {item.variant.sku}
                  {Object.keys(item.variant.attributes).length > 0 ? ` • ${Object.values(item.variant.attributes).join(' / ')}` : ''}
                </p>
                {item.priceChanged ? <p className="inline-message">The price has changed since you added this item.</p> : null}
                {item.availability !== 'AVAILABLE' ? (
                  <p className="inline-message" role="alert">
                    {item.availability === 'OUT_OF_STOCK'
                      ? 'Currently out of stock.'
                      : item.availability === 'LIMITED'
                        ? `Only ${item.availableQuantity} currently available.`
                        : 'This item is no longer available.'}
                  </p>
                ) : null}
                <div className="cart-item__footer">
                  <PriceDisplay price={item.currentPrice} />
                  <span className="cart-item__line-total" aria-label={`Line total ${(item.currentPrice * item.quantity).toLocaleString('en-KE')}`}>
                    <PriceDisplay price={item.subtotal} />
                  </span>
                  <QuantityStepper
                    id={`qty-${item.id}`}
                    value={item.quantity}
                    min={1}
                    max={Math.min(Math.max(item.availableQuantity, 1), 20)}
                    disabled={busyItem === item.id}
                    onChange={(next) => {
                      if (next !== item.quantity) update(item.id, next);
                    }}
                  />
                  <div className="cart-item__actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => moveToWishlist(item.id, item.product.id, item.product.name)}
                      disabled={busyItem === item.id}
                    >
                      {busyItem === item.id ? 'Working…' : 'Move to wishlist'}
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => remove(item.id, item.product.name)}
                      disabled={busyItem === item.id}
                      aria-label={`Remove ${item.product.name} from cart`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="cart-summary" aria-labelledby="order-summary-heading">
        <p className="eyebrow">Summary</p>
        <h2 id="order-summary-heading">Order summary</h2>
        <dl className="summary-lines">
          <div className="summary-line">
            <dt>Subtotal ({cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'})</dt>
            <dd><PriceDisplay price={cart.subtotal} /></dd>
          </div>
          <div className="summary-line">
            <dt>Delivery</dt>
            <dd>Calculated at checkout</dd>
          </div>
        </dl>
        <div className="summary-total">
          <span>Total</span>
          <PriceDisplay price={cart.subtotal} />
        </div>
        <p className="muted-copy">Cart prices are provisional. Checkout recalculates authoritative totals, delivery, and discounts.</p>
        <button type="button" className="button" onClick={proceedToCheckout} disabled={checkingOut} aria-busy={checkingOut}>
          {checkingOut ? <JBButtonLoader label="Checking…" /> : 'Proceed to checkout'}
        </button>
        <button type="button" className="button button--secondary" onClick={() => setConfirmClear(true)}>
          Clear cart
        </button>
        <Link href="/shop" className="text-button">Continue shopping</Link>
      </aside>
      <JBConfirmDialog
        open={confirmClear}
        title="Clear your cart?"
        description="This removes every item from your cart. Saved wishlist items are not affected."
        confirmLabel="Clear cart"
        variant="destructive"
        loading={clearing}
        onConfirm={clear}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
