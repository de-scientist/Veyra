'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { JBLogo } from './JBLogo';
import { ThemeToggle } from './ThemeProvider';
import { departments, getDepartmentCategories } from '../lib/catalog';
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
  const [megaOpen, setMegaOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!megaOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMegaOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (megaRef.current && !megaRef.current.contains(event.target as Node)) setMegaOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [megaOpen]);

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

        <Link href="/" className="brand" aria-label="JB Mercantile home" style={{ textDecoration: 'none' }}>
          <JBLogo size={34} />
        </Link>

        <nav aria-label="Main navigation" className="main-nav">
          <div className="nav-item" ref={megaRef}>
            <button
              type="button"
              aria-expanded={megaOpen}
              aria-haspopup="true"
              onClick={() => setMegaOpen((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minHeight: 44, padding: '0 0.75rem', borderRadius: 999, border: 0, background: 'transparent', color: 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
            >
              Shop <span aria-hidden="true" style={{ fontSize: '0.7rem' }}>▾</span>
            </button>
            {megaOpen ? (
              <div className="mega-menu" role="menu" aria-label="Shop departments">
                {departments.map((department) => (
                  <div key={department.slug} className="mega-menu__dept">
                    <h3>
                      <Link href={`/shop?department=${department.slug}`} role="menuitem" onClick={() => setMegaOpen(false)}>
                        {department.name}
                      </Link>
                    </h3>
                    <p>{department.tagline}</p>
                    <ul>
                      {getDepartmentCategories(department.slug).map((category) => (
                        <li key={category.slug}>
                          <Link href={`/categories/${category.slug}`} role="menuitem" onClick={() => setMegaOpen(false)}>
                            {category.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {departments.map((department) => (
            <Link key={department.slug} href={`/shop?department=${department.slug}`}>
              {department.name}
            </Link>
          ))}
          <Link href="/search">Search</Link>
        </nav>

        <div className="header-actions">
          <Link href="/search" aria-label="Search products">
            <Icon d={ICONS.search} /> <span className="header-label">Search</span>
          </Link>
          <Link href="/login" aria-label="Sign in to JB Mercantile">
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
          <ThemeToggle compact />
        </div>
      </div>

      <nav id="jb-mobile-nav" aria-label="Mobile navigation" className={`mobile-nav${menuOpen ? ' open' : ''}`}>
        <div className="container">
          <Link href="/shop" onClick={() => setMenuOpen(false)}>Shop all</Link>
          {departments.map((department) => (
            <details key={department.slug}>
              <summary style={{ display: 'flex', alignItems: 'center', minHeight: 48, padding: '0.5rem 0.75rem', borderRadius: 12, fontWeight: 600, cursor: 'pointer' }}>
                {department.name}
              </summary>
              <div style={{ display: 'grid', paddingLeft: '1rem' }}>
                <Link href={`/shop?department=${department.slug}`} onClick={() => setMenuOpen(false)}>
                  All {department.name}
                </Link>
                {getDepartmentCategories(department.slug).map((category) => (
                  <Link key={category.slug} href={`/categories/${category.slug}`} onClick={() => setMenuOpen(false)}>
                    {category.name}
                  </Link>
                ))}
              </div>
            </details>
          ))}
          <Link href="/collections/weekend-edit" onClick={() => setMenuOpen(false)}>Collections</Link>
          <Link href="/search" onClick={() => setMenuOpen(false)}>Search</Link>
          <Link href="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link href="/account" onClick={() => setMenuOpen(false)}>Account</Link>
          <Link href="/wishlist" onClick={() => setMenuOpen(false)}>Wishlist</Link>
          <Link href="/cart" onClick={() => setMenuOpen(false)}>Cart{cartCount ? ` (${cartCount})` : ''}</Link>
          <div style={{ padding: '0.5rem 0.75rem' }}>
            <span className="eyebrow">Appearance</span>
            <ThemeToggle />
          </div>
        </div>
      </nav>
    </header>
  );
}

