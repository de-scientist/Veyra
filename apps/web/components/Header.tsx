'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { JBIcon } from './JBIcons';
import { JBLogo } from './JBLogo';
import { ThemeToggle } from './ThemeProvider';
import { departments, getDepartmentCategories } from '../lib/catalog';
import { getCart, getUnreadCount } from '../lib/shopping-api';

export function Header() {
  const [cartCount, setCartCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const megaRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

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
      if (event.key === 'Escape') {
        setMegaOpen(false);
        (megaRef.current?.querySelector('button') as HTMLElement | null)?.focus();
      }
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

  // Mobile nav is a non-modal disclosure: Escape closes and focus returns
  // to the toggle (no trap — the rest of the page stays interactive).
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <button
          ref={menuToggleRef}
          type="button"
          className="header-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="jb-mobile-nav"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <JBIcon name={menuOpen ? 'close' : 'menu'} />
        </button>

        <Link href="/" className="brand" aria-label="JB Mercantile home" style={{ textDecoration: 'none' }}>
          <JBLogo variant="compact" alt="" />
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
              Shop <JBIcon name="chevron" size={14} />
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
            <JBIcon name="search" /> <span className="header-label">Search</span>
          </Link>
          <Link href="/login" aria-label="Sign in to JB Mercantile">
            <JBIcon name="user" /> <span className="header-label">Sign in</span>
          </Link>
          <Link href="/account/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
            <JBIcon name="bell" /> <span className="header-label">Notifications</span>
            {unreadCount ? <span className="header-count">{unreadCount}</span> : null}
          </Link>
          <Link href="/wishlist" aria-label="Wishlist">
            <JBIcon name="heart" /> <span className="header-label">Wishlist</span>
          </Link>
          <Link href="/cart" aria-label={`Cart${cartCount ? `, ${cartCount} items` : ''}`}>
            <JBIcon name="cart" /> <span className="header-label">Cart</span>
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
