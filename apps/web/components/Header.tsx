'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { categories } from '../lib/storefront-data';
import { getCart, getUnreadCount } from '../lib/shopping-api';

export function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    getCart().then((cart) => setCartCount(cart.itemCount)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getUnreadCount().then((result) => {
        if (mounted) setUnreadCount(result.unreadCount);
      }).catch(() => undefined);
    };
    refresh();
    const interval = setInterval(refresh, 60000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link href="/" className="brand" aria-label="Veyra home">
          VEYRA
        </Link>

        <nav aria-label="Main navigation" className="main-nav">
          <Link href="/shop">Shop</Link>
          {categories.slice(0, 3).map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`}>
              {category.name}
            </Link>
          ))}
          <Link href="/search">Search</Link>
        </nav>

        <div className="header-actions">
          <Link href="/search" aria-label="Search products">
            Search
          </Link>
          <Link href="/account" aria-label="Account">
            Account
          </Link>
          <Link href="/account/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <span aria-hidden="true">🔔</span> Notifications{unreadCount ? ` (${unreadCount})` : ''}
          </Link>
          <Link href="/wishlist" aria-label="Wishlist">
            Wishlist
          </Link>
          <Link href="/cart" aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`}>
            Cart{cartCount ? ` (${cartCount})` : ''}
          </Link>
        </div>
      </div>
    </header>
  );
}
