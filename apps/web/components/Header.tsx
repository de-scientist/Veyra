'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { categories } from '../lib/storefront-data';
import { getCart, getUnreadCount } from '../lib/shopping-api';

export function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

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
        <button
          type="button"
          className="header-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="jb-mobile-nav"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
        </button>

        <Link href="/" className="brand" aria-label="JB home">
          <Image src="/jb-navbar.png" alt="" width={120} height={32} className="brand__logo" priority />
          <span className="brand__wordmark">JB</span>
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
            <span aria-hidden="true">⌕</span> <span className="header-label">Search</span>
          </Link>
          <Link href="/account" aria-label="Your JB account">
            <span aria-hidden="true">◉</span> <span className="header-label">Account</span>
          </Link>
          <Link href="/account/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <span aria-hidden="true">🔔</span> <span className="header-label">Notifications</span>
            {unreadCount ? <span className="header-count" aria-hidden="true">{unreadCount}</span> : null}
          </Link>
          <Link href="/wishlist" aria-label="Wishlist">
            <span aria-hidden="true">♡</span> <span className="header-label">Wishlist</span>
          </Link>
          <Link href="/cart" aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`}>
            <span aria-hidden="true">🛒</span> <span className="header-label">Cart</span>
            {cartCount ? <span className="header-count" aria-hidden="true">{cartCount}</span> : null}
          </Link>
        </div>
      </div>

      <nav id="jb-mobile-nav" aria-label="Mobile navigation" className={`mobile-nav${menuOpen ? ' open' : ''}`}>
        <div className="container">
          <Link href="/shop" onClick={() => setMenuOpen(false)}>Shop all</Link>
          {categories.map((category) => (
            <Link key={category.slug} href={`/categories/${category.slug}`} onClick={() => setMenuOpen(false)}>
              {category.name}
            </Link>
          ))}
          <Link href="/search" onClick={() => setMenuOpen(false)}>Search</Link>
          <Link href="/account" onClick={() => setMenuOpen(false)}>Account</Link>
          <Link href="/wishlist" onClick={() => setMenuOpen(false)}>Wishlist</Link>
          <Link href="/cart" onClick={() => setMenuOpen(false)}>Cart{cartCount ? ` (${cartCount})` : ''}</Link>
        </div>
      </nav>
    </header>
  );
}
