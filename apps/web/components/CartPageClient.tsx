'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { clearCart, getCart, removeCartItem, updateCartItem, type Cart } from '../lib/shopping-api';
import { PriceDisplay } from './PriceDisplay';

export function CartPageClient() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState('');
  const [busyItem, setBusyItem] = useState<string | null>(null);

  useEffect(() => {
    getCart().then(setCart).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load your cart.'));
  }, []);

  async function update(itemId: string, quantity: number) {
    setBusyItem(itemId);
    try { setCart(await updateCartItem(itemId, quantity)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update your cart.'); } finally { setBusyItem(null); }
  }

  async function remove(itemId: string) {
    setBusyItem(itemId);
    try { setCart(await removeCartItem(itemId)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove that item.'); } finally { setBusyItem(null); }
  }

  if (error && !cart) return <div className="empty-state"><h1>We could not load your cart</h1><p>{error}</p><Link className="button" href="/shop">Continue shopping</Link></div>;
  if (!cart) return <div className="empty-state"><p>Loading your cart...</p></div>;
  if (!cart.items.length) return <div className="empty-state"><h1>Your cart is empty</h1><p>Explore the latest JB collection and find something for your everyday rotation.</p><Link className="button" href="/shop">Shop now</Link></div>;

  return (
    <div className="cart-layout">
      <section>
        <div className="section-heading"><h1>Your cart</h1><span>{cart.itemCount} item{cart.itemCount === 1 ? '' : 's'}</span></div>
        {error ? <p className="inline-message" role="alert">{error}</p> : null}
        <div className="cart-items">
          {cart.items.map((item) => (
            <article key={item.id} className="cart-item">
              {item.product.image ? <img src={item.product.image} alt="" /> : <div className="cart-item__placeholder">No image</div>}
              <div className="cart-item__content">
                <Link href={`/products/${item.product.slug}`}><h2>{item.product.name}</h2></Link>
                <p>{item.variant.name}</p>
                {item.priceChanged ? <p className="inline-message">The price has changed since you added this item.</p> : null}
                {item.availability !== 'AVAILABLE' ? <p className="inline-message">{item.availability === 'OUT_OF_STOCK' ? 'Currently out of stock.' : item.availability === 'LIMITED' ? `Only ${item.availableQuantity} currently available.` : 'This item is no longer available.'}</p> : null}
                <div className="cart-item__footer"><PriceDisplay price={item.currentPrice} /><label>Quantity <input type="number" min="1" max="20" value={item.quantity} disabled={busyItem === item.id} onChange={(event) => update(item.id, Number((event.target as unknown as { value: string }).value))} /></label><button type="button" className="text-button" onClick={() => remove(item.id)} disabled={busyItem === item.id}>Remove</button></div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <aside className="cart-summary"><p className="eyebrow">Summary</p><h2>Subtotal</h2><PriceDisplay price={cart.subtotal} /><p className="muted-copy">Delivery and the final total are calculated securely at checkout.</p><Link href="/checkout" className="button">Continue to checkout</Link><button type="button" className="button button--secondary" onClick={() => clearCart().then(setCart).catch(() => setError('Unable to clear your cart.'))}>Clear cart</button><Link href="/shop" className="text-button">Continue shopping</Link></aside>
    </div>
  );
}
