'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { categories } from '../lib/storefront-data';
import { getCart, getUnreadCount } from '../lib/shopping-api';

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  account: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M10.3 21a2 2 0 0 0 3.4 0',
  heart: 'M19 14c1.5-1.5 3-3.3 3-5.5A4.5 4.5 0 0 0 17.5 4c-1.8 0-3.4 1-4.5 2.5C11.9 5 10.3 4 8.5 4A4.5 4.5 0 0 0 4 8.5c0 2.2 1.5 4 3 5.5l5 5Z',
  cart: 'M6 7h15l-1.5 9h-12ZM6 7 5 4H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
};

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
            <Icon d={ICONS.search} /> <span className="header-label">Search</span>
          </Link>
          <Link href="/login" aria-label="Sign in to JB">
            <Icon d={ICONS.account} /> <span className="header-label">Sign in</span>
          </Link>
          <Link href="/account/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <Icon d={ICONS.bell} /> <span className="header-label">Notifications</span>
            {unreadCount ? <span className="header-count">{unreadCount}</span> : null}
          </Link>
          <Link href="/wishlist" aria-label="Wishlist">
            <Icon d={ICONS.heart} /> <span className="header-label">Wishlist</span>
          </Link>
          <Link href="/cart" aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`}>
            <Icon d={ICONS.cart} /> <span className="header-label">Cart</span>
            {cartCount ? <span className="header-count">{cartCount}</span> : null}
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
          <Link href="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link href="/account" onClick={() => setMenuOpen(false)}>Account</Link>
          <Link href="/wishlist" onClick={() => setMenuOpen(false)}>Wishlist</Link>
          <Link href="/cart" onClick={() => setMenuOpen(false)}>Cart{cartCount ? ` (${cartCount})` : ''}</Link>
        </div>
      </nav>
    </header>
  );
}
