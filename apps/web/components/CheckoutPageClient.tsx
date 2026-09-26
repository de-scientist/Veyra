'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { getCart, getCheckoutOptions, getSavedAddresses, placeCheckout, previewCheckout, type Cart, type CheckoutInput, type CheckoutOptions, type CheckoutPreview } from '../lib/shopping-api';
import { PriceDisplay } from './PriceDisplay';

const emptyAddress = { line1: '', city: '', state: '', postalCode: '', country: 'KE' };

export function CheckoutPageClient() {
  const router = useRouter();
  const [cart, setCart] = useState<Cart | null>(null);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [savedAddresses, setSavedAddresses] = useState<Array<{ id: string; label: string | null; line1: string; line2: string | null; city: string; state: string | null; postalCode: string | null; country: string }>>([]);
  const [preview, setPreview] = useState<CheckoutPreview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [idempotencyKey] = useState(() => `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [form, setForm] = useState({ customerName: '', customerEmail: '', customerPhone: '', deliveryMethodId: '', shippingZoneCode: '', addressId: '', ...emptyAddress, notes: '', confirmPriceChanges: false });

  useEffect(() => {
    Promise.all([getCart(), getCheckoutOptions()]).then(([loadedCart, loadedOptions]) => {
      setCart(loadedCart);
      setOptions(loadedOptions);
      setForm((current) => ({ ...current, deliveryMethodId: loadedOptions.methods[0]?.id ?? '', shippingZoneCode: loadedOptions.zones[0]?.code ?? '' }));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load checkout.'));
    getSavedAddresses().then(setSavedAddresses).catch(() => undefined);
  }, []);

  const selectedMethod = options?.methods.find((method) => method.id === form.deliveryMethodId);
  const needsAddress = selectedMethod?.type !== 'PICKUP';

  function update(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setPreview(null);
  }

  function input(): CheckoutInput {
    return {
      customerName: form.customerName,
      customerEmail: form.customerEmail,
      customerPhone: form.customerPhone,
      deliveryMethodId: form.deliveryMethodId,
      shippingZoneCode: form.shippingZoneCode,
      address: needsAddress ? { line1: form.line1, city: form.city, state: form.state, postalCode: form.postalCode, country: form.country } : undefined,
      addressId: form.addressId || undefined,
      notes: form.notes || undefined,
      confirmPriceChanges: Boolean(preview?.requiresPriceConfirmation && form.confirmPriceChanges),
    } as CheckoutInput & { confirmPriceChanges: boolean };
  }

  async function review(event: { preventDefault: () => void }) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { setPreview(await previewCheckout(input())); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to calculate checkout totals.'); } finally { setBusy(false); }
  }

  async function placeOrder() {
    setBusy(true);
    setError('');
    try {
      const result = await placeCheckout(input(), idempotencyKey);
      const token = result.confirmationToken ? `?token=${encodeURIComponent(result.confirmationToken)}` : '';
      router.push(`/order-confirmation/${result.order.orderNumber}${token}` as never);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to place the order. Please review your cart.'); } finally { setBusy(false); }
  }

  if (error && !cart) return <div className="empty-state"><h1>Checkout is unavailable</h1><p>{error}</p><Link className="button" href="/cart">Return to cart</Link></div>;
  if (!cart || !options) return <div className="empty-state"><p>Loading checkout...</p></div>;
  if (!cart.items.length) return <div className="empty-state"><h1>Your cart is empty</h1><p>Add something from the collection before checking out.</p><Link className="button" href="/shop">Shop now</Link></div>;

  return (
    <div className="checkout-layout">
      <form className="checkout-form" onSubmit={review}>
        <section className="checkout-section"><p className="eyebrow">01</p><h1>Customer information</h1><div className="form-grid"><label>Full name<input required value={form.customerName} onChange={(event) => update('customerName', (event.target as unknown as { value: string }).value)} /></label><label>Email<input required type="email" value={form.customerEmail} onChange={(event) => update('customerEmail', (event.target as unknown as { value: string }).value)} /></label><label>Phone<input required type="tel" placeholder="0712 345 678" value={form.customerPhone} onChange={(event) => update('customerPhone', (event.target as unknown as { value: string }).value)} /></label></div></section>
        <section className="checkout-section"><p className="eyebrow">02</p><h2>Delivery</h2><div className="choice-list">{options.methods.map((method) => <label className="choice" key={method.id}><input type="radio" name="deliveryMethod" checked={form.deliveryMethodId === method.id} onChange={() => update('deliveryMethodId', method.id)} /><span><strong>{method.name}</strong><small>{method.description ?? method.type}</small></span></label>)}</div><label>Delivery zone<select value={form.shippingZoneCode} onChange={(event) => update('shippingZoneCode', (event.target as unknown as { value: string }).value)}>{options.zones.map((zone) => <option key={zone.code} value={zone.code}>{zone.name}</option>)}</select></label>{savedAddresses.length ? <label>Saved address<select value={form.addressId} onChange={(event) => update('addressId', (event.target as unknown as { value: string }).value)}><option value="">Enter a new address</option>{savedAddresses.map((address) => <option key={address.id} value={address.id}>{address.label ?? address.line1}, {address.city}</option>)}</select></label> : null}{needsAddress && !form.addressId ? <div className="form-grid"><label>Address line<input required value={form.line1} onChange={(event) => update('line1', (event.target as unknown as { value: string }).value)} /></label><label>Town / city<input required value={form.city} onChange={(event) => update('city', (event.target as unknown as { value: string }).value)} /></label><label>County / state<input value={form.state} onChange={(event) => update('state', (event.target as unknown as { value: string }).value)} /></label><label>Postal code<input value={form.postalCode} onChange={(event) => update('postalCode', (event.target as unknown as { value: string }).value)} /></label></div> : needsAddress ? <p className="muted-copy">Using your selected saved address.</p> : <p className="muted-copy">Pickup details will be confirmed from the configured pickup method.</p>}<label>Delivery instructions <textarea maxLength={500} value={form.notes} onChange={(event) => update('notes', (event.target as unknown as { value: string }).value)} /></label></section>
        {error ? <p className="inline-message" role="alert">{error}</p> : null}
        {!preview ? <button type="submit" className="button" disabled={busy}>{busy ? 'Calculating...' : 'Review order'}</button> : <div className="review-actions"><button type="button" className="button" disabled={busy || (preview.requiresPriceConfirmation && !form.confirmPriceChanges)} onClick={placeOrder}>{busy ? 'Placing order...' : 'Place order'}</button>{preview.requiresPriceConfirmation ? <label className="confirm-price"><input type="checkbox" checked={Boolean(form.confirmPriceChanges)} onChange={(event) => {
                        const checked = (event.target as unknown as { checked: boolean }).checked;
                        setForm((current) => ({ ...current, confirmPriceChanges: checked }));
                      }} /> I have reviewed the updated prices.</label> : null}</div>}
      </form>
      <aside className="checkout-summary"><p className="eyebrow">Order summary</p>{(preview?.items ?? cart.items.map((item) => ({ id: item.id, productName: item.product.name, variant: item.variant.name, quantity: item.quantity, unitPrice: item.currentPrice, subtotal: item.currentPrice * item.quantity }))).map((item) => <div className="summary-line" key={item.id}><span>{item.productName}<small>{item.variant} × {item.quantity}</small></span><PriceDisplay price={item.subtotal} /></div>)}<div className="summary-total"><span>Subtotal</span><PriceDisplay price={preview?.subtotal ?? cart.subtotal} /></div>{preview ? <><div className="summary-line"><span>Delivery</span><PriceDisplay price={preview.shippingTotal} /></div><div className="summary-total"><span>Total</span><PriceDisplay price={preview.grandTotal} /></div></> : <p className="muted-copy">Review the order to calculate delivery and the authoritative total.</p>}</aside>
    </div>
  );
}
