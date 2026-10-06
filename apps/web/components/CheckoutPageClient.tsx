'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { buildCheckoutInput, getCart, getCheckoutOptions, getSavedAddresses, notifyCartUpdated, placeCheckout, previewCheckout, type Cart, type CheckoutInput, type CheckoutOptions, type CheckoutPreview } from '../lib/shopping-api';
import { useSession } from '../lib/session';
import { JB_CONTACT_PHONE_DISPLAY, JB_CONTACT_PHONE_TEL, JB_DELIVERY_MESSAGE } from '../lib/business-contact';
import { JBIcon } from './JBIcons';
import { JBAlert, JBButtonLoader, JBLoading } from './JBLoading';
import { PriceDisplay } from './PriceDisplay';

const emptyAddress = { line1: '', city: '', state: '', postalCode: '', country: 'KE' };

/** Minimum branded-loader dwell so auth resolution never flashes past. */
const CHECKOUT_GUARD_MIN_MS = 350;

function checkoutLoginTarget(): Route {
  return `/login?redirect=${encodeURIComponent('/checkout')}` as Route;
}

function isUnauthenticated(reason: unknown) {
  return typeof reason === 'object' && reason !== null && (reason as { code?: string }).code === 'UNAUTHENTICATED';
}

type PayChoice = 'mpesa' | 'manual';

export function CheckoutPageClient() {
  const router = useRouter();
  // Single authoritative session (SessionProvider owns `/auth/me`): the
  // checkout form never renders until authentication is confirmed, and no
  // order API is touched before that — guests are sent to login instead.
  const { status } = useSession();
  const guardStartRef = useRef(0);
  if (guardStartRef.current === 0) guardStartRef.current = Date.now();
  const [cart, setCart] = useState<Cart | null>(null);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<Array<{ id: string; label: string | null; line1: string; line2: string | null; city: string; state: string | null; postalCode: string | null; country: string }>>([]);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [payChoice, setPayChoice] = useState<PayChoice>('mpesa');
  const [idempotencyKey] = useState(() => `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [form, setForm] = useState({ customerName: '', customerEmail: '', customerPhone: '', deliveryMethodId: '', shippingZoneCode: '', addressId: '', ...emptyAddress, notes: '', confirmPriceChanges: false });

  useEffect(() => {
    // Authentication unknown: keep the branded loader up, never redirect on
    // a session that simply hasn't resolved yet (prevents redirect flicker).
    if (status === 'loading') return;
    if (status === 'guest') {
      // `replace` keeps Cart → Checkout → Login history loop-free: after a
      // successful login the customer lands on checkout, and Back returns to
      // the cart — never to a stale checkout guard.
      const wait = Math.max(0, CHECKOUT_GUARD_MIN_MS - (Date.now() - guardStartRef.current));
      const timer = window.setTimeout(() => router.replace(checkoutLoginTarget()), wait);
      return () => window.clearTimeout(timer);
    }
    let cancelled = false;
    // Authenticated: the first cart read also merges any guest cart into the
    // user cart (backend `getOrCreateCart`) — nothing the shopper added is
    // lost by signing in at checkout time.
    Promise.all([getCart(), getCheckoutOptions()]).then(([loadedCart, loadedOptions]) => {
      if (cancelled) return;
      setCart(loadedCart);
      setOptions(loadedOptions);
      setForm((current) => ({ ...current, deliveryMethodId: loadedOptions.methods[0]?.id ?? '', shippingZoneCode: loadedOptions.zones[0]?.code ?? '' }));
    }).catch((reason) => {
      if (cancelled) return;
      // Session revoked/expired mid-checkout: send the customer through login
      // again instead of stranding them on a failing form.
      if (isUnauthenticated(reason)) {
        router.replace(checkoutLoginTarget());
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to load checkout.');
    });
    getSavedAddresses().then((addresses) => {
      if (!cancelled) setSavedAddresses(addresses);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [status, router]);

  const selectedMethod = options?.methods.find((method) => method.id === form.deliveryMethodId);
  const needsAddress = selectedMethod?.type !== 'PICKUP';

  function update(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setPreview(null);
  }

  function input(): CheckoutInput {
    return buildCheckoutInput(form, {
      needsAddress,
      confirmPriceChanges: Boolean(preview?.requiresPriceConfirmation && form.confirmPriceChanges),
    });
  }

  async function review(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!form.deliveryMethodId || !form.shippingZoneCode) {
      setError('Select a delivery method and delivery zone to calculate your totals.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      setPreview(await previewCheckout(input()));
    } catch (reason) {
      if (isUnauthenticated(reason)) {
        router.replace(checkoutLoginTarget());
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to calculate checkout totals.');
    } finally { setBusy(false); }
  }

  async function placeOrder() {
    setPlacing(true);
    setError('');
    try {
      const result = await placeCheckout(input(), idempotencyKey);
      // Backend finalized the cart (CHECKED_OUT) — sync header count before leaving.
      notifyCartUpdated();
      const token = result.confirmationToken ? `?token=${encodeURIComponent(result.confirmationToken)}` : '';
      const pay = `${token ? '&' : '?'}pay=${payChoice}`;
      router.push(`/order-confirmation/${result.order.orderNumber}${token}${pay}` as never);
    } catch (reason) {
      if (isUnauthenticated(reason)) {
        router.replace(checkoutLoginTarget());
        return;
      }
      setError(reason instanceof Error ? reason.message : 'Unable to place the order. Please review your cart.');
    } finally { setPlacing(false); }
  }

  // Auth gate first: no checkout form, no cart fetch, no order call is ever
  // exposed before the session is confirmed authenticated.
  if (status !== 'authenticated') return <JBLoading context="checkout" />;
  if (error && !cart) return <div className="empty-state"><h1>Checkout is unavailable</h1><p>{error}</p><Link className="button" href="/cart">Return to cart</Link></div>;
  if (!cart || !options) return <JBLoading context="checkout" />;
  if (!cart.items.length) return <div className="empty-state"><h1>Your cart is empty</h1><p>Add something from the collection before checking out.</p><Link className="button" href="/shop">Shop now</Link></div>;

  const summaryItems = preview?.items ?? cart.items.map((item) => ({ id: item.id, productName: item.product.name, variant: item.variant.name, sku: item.variant.sku, variantId: item.variantId, quantity: item.quantity, unitPrice: item.currentPrice, subtotal: item.currentPrice * item.quantity }));

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">Secure checkout</p>
          <h1>Checkout</h1>
          <p className="muted-copy">Delivery details, then payment. Your order is only marked as paid after payment is confirmed.</p>
        </div>
      </div>
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={review} aria-label="Checkout details">
          <section className="checkout-section" aria-labelledby="checkout-delivery-info">
            <p className="eyebrow">01</p>
            <h2 id="checkout-delivery-info">Delivery information</h2>
            <div className="form-grid">
              <label>Full name<input required autoComplete="name" value={form.customerName} onChange={(event) => update('customerName', (event.target as unknown as { value: string }).value)} /></label>
              <label>Email<input required autoComplete="email" type="email" value={form.customerEmail} onChange={(event) => update('customerEmail', (event.target as unknown as { value: string }).value)} /></label>
              <label>Phone<input required autoComplete="tel" type="tel" placeholder="0712 345 678" value={form.customerPhone} onChange={(event) => update('customerPhone', (event.target as unknown as { value: string }).value)} /><small>Used for your M-Pesa payment prompt.</small></label>
              <label>Order notes (optional)<input value={form.notes} placeholder="Delivery instructions" onChange={(event) => update('notes', (event.target as unknown as { value: string }).value)} /></label>
            </div>
          </section>

          <section className="checkout-section" aria-labelledby="checkout-delivery-method">
            <p className="eyebrow">02</p>
            <h2 id="checkout-delivery-method">Delivery method</h2>
            <div className="choice-list" role="radiogroup" aria-label="Delivery method">
              {options.methods.length === 0
                ? <JBAlert tone="warning" title="No delivery methods available" message="Please try again later." />
                : options.methods.map((method) => (
                  <label className="choice" key={method.id}>
                    <input type="radio" name="deliveryMethod" checked={form.deliveryMethodId === method.id} onChange={() => update('deliveryMethodId', method.id)} />
                    <span><strong>{method.name}</strong><small>{method.description ?? method.type}</small></span>
                  </label>
                ))}
            </div>
            {options.zones.length === 0
              ? <JBAlert tone="warning" title="No delivery zones available" message="Please try again later." />
              : (
                <label>Delivery zone
                  <select value={form.shippingZoneCode} onChange={(event) => update('shippingZoneCode', (event.target as unknown as { value: string }).value)}>
                    {options.zones.map((zone) => <option key={zone.code} value={zone.code}>{zone.name}</option>)}
                  </select>
                </label>
              )}
            {savedAddresses.length ? (
              <label>Saved address
                <select value={form.addressId} onChange={(event) => update('addressId', (event.target as unknown as { value: string }).value)}>
                  <option value="">Enter a new address</option>
                  {savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.label ?? address.line1}, {address.city}</option>)}
                </select>
              </label>
            ) : null}
            {needsAddress && !form.addressId ? (
              <div className="form-grid">
                <label>Address line<input required value={form.line1} onChange={(event) => update('line1', (event.target as unknown as { value: string }).value)} /></label>
                <label>Town / city<input required value={form.city} onChange={(event) => update('city', (event.target as unknown as { value: string }).value)} /></label>
                <label>County / state<input value={form.state} onChange={(event) => update('state', (event.target as unknown as { value: string }).value)} /></label>
                <label>Postal code<input value={form.postalCode} onChange={(event) => update('postalCode', (event.target as unknown as { value: string }).value)} /></label>
              </div>
            ) : null}
          </section>

          <section className="checkout-section" aria-labelledby="checkout-payment-method">
            <p className="eyebrow">03</p>
            <h2 id="checkout-payment-method">Payment method</h2>
            <div className="choice-list" role="radiogroup" aria-label="Payment method">
              <label className="choice">
                <input type="radio" name="paymentMethod" checked={payChoice === 'mpesa'} onChange={() => setPayChoice('mpesa')} />
                <span>
                  <strong>M-Pesa <span className="status-badge" style={{ background: 'var(--jb-success-bg)', color: 'var(--jb-success)' }}>Recommended</span></strong>
                  <small>Pay automatically with an M-Pesa prompt on your phone after you place the order.</small>
                </span>
              </label>
              <label className="choice">
                <input type="radio" name="paymentMethod" checked={payChoice === 'manual'} onChange={() => setPayChoice('manual')} />
                <span>
                  <strong>Manual M-Pesa</strong>
                  <small>Pay with Paybill or Pochi La Biashara if the automatic prompt does not work, then submit your transaction code for verification.</small>
                </span>
              </label>
            </div>
            <p className="muted-copy">You will pay on the next step, after your order is created. Payment is only confirmed by JB Mercantile — never instantly in this browser.</p>
          </section>

          {error ? <JBAlert tone="error" title="Checkout needs attention" message={error} /> : null}
          {!preview ? (
            <button type="submit" className="button" disabled={busy} aria-busy={busy}>
              {busy ? <JBButtonLoader label="Calculating…" /> : 'Review order'}
            </button>
          ) : (
            <div className="review-actions">
              <button type="button" className="button" disabled={placing || (preview.requiresPriceConfirmation && !form.confirmPriceChanges)} aria-busy={placing} onClick={placeOrder}>
                {placing ? <JBButtonLoader label="Creating your order…" /> : 'Place order'}
              </button>
              {preview.requiresPriceConfirmation ? (
                <label className="confirm-price">
                  <input type="checkbox" checked={Boolean(form.confirmPriceChanges)} onChange={(event) => {
                    const checked = (event.target as unknown as { checked: boolean }).checked;
                    setForm((current) => ({ ...current, confirmPriceChanges: checked }));
                  }} /> I have reviewed the updated prices.
                </label>
              ) : null}
            </div>
          )}
        </form>

        <div style={{ display: 'grid', gap: '1rem', alignContent: 'start' }}>
          <aside className="checkout-summary" aria-label="Order summary">
            <p className="eyebrow">04 · Order summary</p>
            <h2>Your order</h2>
            {summaryItems.map((item) => (
              <div className="summary-line" key={item.id}>
                <span>{item.productName}<small>{item.variant} × {item.quantity}</small><small>SKU {item.sku}</small></span>
                <PriceDisplay price={item.subtotal} />
              </div>
            ))}
            <div className="summary-total"><span>Subtotal</span><PriceDisplay price={preview?.subtotal ?? cart.subtotal} /></div>
            {preview ? (
              <>
                {preview.discountTotal ? <div className="summary-line"><span>Discount</span><span>−<PriceDisplay price={preview.discountTotal} /></span></div> : null}
                <div className="summary-line"><span>Delivery</span><PriceDisplay price={preview.shippingTotal} /></div>
                <div className="summary-total"><span>Total</span><PriceDisplay price={preview.grandTotal} /></div>
                <p className="muted-copy">Authoritative total from the backend — this is the exact amount you will pay.</p>
              </>
            ) : <p className="muted-copy">Review the order to calculate delivery and the authoritative total.</p>}
          </aside>

          <aside className="checkout-summary checkout-trust" aria-label="Delivery and payment information">
            <p className="eyebrow">05 · Good to know</p>
            <div className="trust-row">
              <JBIcon name="truck" size={18} />
              <div><strong>Delivery</strong><p className="muted-copy">{JB_DELIVERY_MESSAGE}.</p></div>
            </div>
            <div className="trust-row">
              <JBIcon name="lock" size={18} />
              <div><strong>Payment</strong><p className="muted-copy">M-Pesa available. Your order is only marked as paid after payment is confirmed.</p></div>
            </div>
            <div className="trust-row">
              <JBIcon name="phone" size={18} />
              <div><strong>Need help?</strong><p className="muted-copy"><a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a></p></div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
