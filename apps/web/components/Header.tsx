'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { AccountMenu, AccountMenuSkeleton } from './AccountMenu';
import { JBIcon } from './JBIcons';
import { JBLogo } from './JBLogo';
import { SearchBar } from './SearchBar';
import { ThemeToggle } from './ThemeProvider';
import { Sheet } from './ui/sheet';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink } from './ui/navigation-menu';
import { JB_CONTACT_PHONE_DISPLAY, JB_CONTACT_PHONE_TEL, JB_DELIVERY_MESSAGE } from '../lib/business-contact';
import { can } from '../lib/admin-api';
import { departments } from '../lib/catalog';
import { useSession } from '../lib/session';
import {
  CART_UPDATED_EVENT,
  WISHLIST_UPDATED_EVENT,
  getCart,
  getUnreadCount,
  getWishlist,
} from '../lib/shopping-api';
import { getNavCategories, getNavCollections, type NavCategory } from '../lib/storefront-client';

/**
 * Seed-verified fallback: `weekend-edit` ships in `prisma/seed.catalogue.ts`.
 * The header prefers the first live collection and only falls back here when
 * the catalogue API is unreachable — never a dead link.
 */
const COLLECTIONS_FALLBACK_HREF = '/collections/weekend-edit';

export function Header() {
  const { status, session } = useSession();
  const pathname = usePathname();
  const [cartCount, setCartCount] = useState(0);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  // Live catalogue categories (grouped under the static department pillars).
  // Navigation degrades to department links alone if the fetch fails.
  const [navCategories, setNavCategories] = useState<NavCategory[]>([]);
  // Live collections for the Collections destination (fallback above).
  const [collectionsHref, setCollectionsHref] = useState(COLLECTIONS_FALLBACK_HREF);

  useEffect(() => {
    let mounted = true;
    getNavCategories().then((categories) => {
      if (mounted) setNavCategories(categories);
    }).catch(() => undefined);
    getNavCollections().then((collections) => {
      if (mounted && collections.length > 0 && collections[0]) {
        setCollectionsHref(`/collections/${collections[0].slug}`);
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  // Cart count revalidates from the authoritative backend cart on mount,
  // on session change (login/logout triggers server-side guest→user merge),
  // and whenever any component reports a cart mutation via CART_UPDATED_EVENT.
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getCart().then((cart) => {
        if (mounted) setCartCount(cart.itemCount);
      }).catch(() => undefined);
    };
    refresh();
    window.addEventListener(CART_UPDATED_EVENT, refresh);
    return () => {
      mounted = false;
      window.removeEventListener(CART_UPDATED_EVENT, refresh);
    };
  }, [status]);

  // Wishlist count follows the same backend-authoritative pattern so cards,
  // PDP, and the navbar stay in sync without a reload.
  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      getWishlist().then((wishlist) => {
        if (mounted) setWishlistCount(wishlist.items.length);
      }).catch(() => undefined);
    };
    refresh();
    window.addEventListener(WISHLIST_UPDATED_EVENT, refresh);
    return () => {
      mounted = false;
      window.removeEventListener(WISHLIST_UPDATED_EVENT, refresh);
    };
  }, [status]);

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

  // The inline search panel closes after navigation and on Escape.
  useEffect(() => {
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false);
        searchToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const departmentCategories = (pillar: string) =>
    navCategories.filter((category) => category.pillar === pillar && category.parentSlug === pillar);

  return (
    <>
      <div className="utility-bar" role="region" aria-label="Store information">
        <div className="container utility-bar__inner">
          <a className="utility-bar__link utility-bar__link--phone" href={JB_CONTACT_PHONE_TEL} aria-label={`Call JB Mercantile on ${JB_CONTACT_PHONE_DISPLAY}`}>
            <JBIcon name="phone" size={14} />
            {JB_CONTACT_PHONE_DISPLAY}
          </a>
          <span className="utility-bar__item">
            <JBIcon name="truck" size={14} />
            {JB_DELIVERY_MESSAGE}
          </span>
          <span className="utility-bar__item utility-bar__item--desktop">
            <JBIcon name="lock" size={14} />
            Secure M-Pesa payments
          </span>
          <Link href="/shop" className="utility-bar__link utility-bar__link--desktop">
            Shop new arrivals
          </Link>
        </div>
      </div>
      <header className="site-header">
        <div className="container site-header__inner">
          <button
            type="button"
            className="header-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="jb-mobile-nav"
            aria-label="Open navigation menu"
            onClick={() => setMenuOpen(true)}
          >
            <JBIcon name="menu" />
          </button>

          <Link href="/" className="brand" aria-label="JB Mercantile home" style={{ textDecoration: 'none' }}>
            <JBLogo variant="compact" alt="" />
          </Link>

          <Suspense fallback={<nav aria-label="Main navigation" className="main-nav" aria-busy="true" />}>
            <HeaderDeptNav
              pathname={pathname}
              navCategories={navCategories}
              departmentCategories={departmentCategories}
              collectionsHref={collectionsHref}
            />
          </Suspense>

          <div className="header-actions">
            {/* Single primary search control: expanding panel (mobile uses the drawer link). */}
            <button
              ref={searchToggleRef}
              type="button"
              aria-expanded={searchOpen}
              aria-controls="jb-header-search"
              aria-label={searchOpen ? 'Close search' : 'Search products'}
              onClick={() => setSearchOpen((v) => !v)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minHeight: 44, padding: '0 0.75rem', borderRadius: 999, border: 0, background: searchOpen ? 'var(--jb-primary-soft)' : 'transparent', color: searchOpen ? 'var(--jb-primary)' : 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
            >
              <JBIcon name={searchOpen ? 'close' : 'search'} /> <span className="header-label">Search</span>
            </button>
            {status === 'authenticated' && session ? (
              <AccountMenu session={session} />
            ) : status === 'loading' ? (
              <AccountMenuSkeleton />
            ) : (
              <Link href="/login" aria-label="Sign in to JB Mercantile">
                <JBIcon name="user" /> <span className="header-label">Sign in</span>
              </Link>
            )}
            <Link href="/account/notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}>
              <JBIcon name="bell" /> <span className="header-label">Notifications</span>
              {unreadCount ? <span className="header-count">{unreadCount}</span> : null}
            </Link>
            <Link href="/wishlist" aria-label={`Wishlist${wishlistCount ? `, ${wishlistCount} saved` : ''}`}>
              <JBIcon name="heart" /> <span className="header-label">Wishlist</span>
              {wishlistCount ? <span className="header-count">{wishlistCount}</span> : null}
            </Link>
            <Link href="/cart" aria-label={`Shopping cart${cartCount ? `, ${cartCount} items` : ''}`}>
              <JBIcon name="cart" /> <span className="header-label">Cart</span>
              {cartCount ? <span className="header-count">{cartCount}</span> : null}
            </Link>
            <ThemeToggle compact />
          </div>
        </div>
        {searchOpen ? (
          <div className="header-search-panel">
            <div className="container header-search-panel__inner" id="jb-header-search">
              <SearchBar autoFocus />
            </div>
          </div>
        ) : null}
      </header>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} label="Site navigation" className="mobile-drawer">
        <div id="jb-mobile-nav">
          <div className="mobile-drawer__header">
            <JBLogo variant="compact" alt="JB Mercantile" height={28} />
            <button
              type="button"
              className="header-menu-toggle header-menu-toggle--visible"
              aria-label="Close navigation menu"
              onClick={() => setMenuOpen(false)}
            >
              <JBIcon name="close" />
            </button>
          </div>
          <nav aria-label="Mobile navigation" className="mobile-drawer__nav">
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
                  {departmentCategories(department.slug).map((category) => (
                    <Link key={category.slug} href={`/categories/${category.slug}`} onClick={() => setMenuOpen(false)}>
                      {category.name}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
            <Link href={collectionsHref as Route} onClick={() => setMenuOpen(false)}>Collections</Link>
            <Link href="/search" onClick={() => setMenuOpen(false)}>Search</Link>
            {status === 'authenticated' && session ? (
              <>
                <Link href="/account" onClick={() => setMenuOpen(false)}>My Account</Link>
                <Link href="/account/orders" onClick={() => setMenuOpen(false)}>Orders</Link>
                <Link href="/account/profile" onClick={() => setMenuOpen(false)}>Profile</Link>
                {can('dashboard.read', session.roles) ? (
                  <Link href="/admin/dashboard" onClick={() => setMenuOpen(false)}>Admin Dashboard</Link>
                ) : null}
              </>
            ) : status === 'loading' ? (
              <span className="mobile-nav__loading" role="status" aria-label="Loading account">
                Loading account…
              </span>
            ) : (
              <Link href="/login" onClick={() => setMenuOpen(false)}>Sign in</Link>
            )}
            <Link href="/wishlist" onClick={() => setMenuOpen(false)}>Wishlist{wishlistCount ? ` (${wishlistCount})` : ''}</Link>
            <Link href="/cart" onClick={() => setMenuOpen(false)}>Cart{cartCount ? ` (${cartCount})` : ''}</Link>
            <div style={{ padding: '0.5rem 0.75rem' }}>
              <span className="eyebrow">Appearance</span>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      </Sheet>
    </>
  );
}

/**
 * Department navigation with active states. Split out (inside Suspense) because
 * the active department reads the `?department=` query parameter.
 */
function HeaderDeptNav({
  pathname,
  navCategories,
  departmentCategories,
  collectionsHref,
}: {
  pathname: string | null;
  navCategories: NavCategory[];
  departmentCategories: (pillar: string) => NavCategory[];
  collectionsHref: string;
}) {
  const searchParams = useSearchParams();
  const [megaOpen, setMegaOpen] = useState(false);
  const megaRef = useRef<HTMLLIElement>(null);

  const activeDept = searchParams.get('department');
  const onShop = pathname === '/shop';
  // A category page also lights up its department pillar.
  const categorySlug = pathname?.startsWith('/categories/') ? pathname.split('/')[2] : null;
  const categoryPillar = categorySlug ? navCategories.find((c) => c.slug === categorySlug)?.pillar : null;
  const isDeptActive = (slug: string) =>
    (onShop && activeDept === slug) || categoryPillar === slug;
  const collectionsActive = pathname?.startsWith('/collections') ?? false;

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

  // The mega menu closes on navigation (pathname change unmounts nothing here,
  // so close explicitly when the route moves).
  useEffect(() => {
    setMegaOpen(false);
  }, [pathname]);

  return (
    <NavigationMenu label="Main navigation" className="main-nav">
      <li className="nav-item" ref={megaRef}>
        <button
          type="button"
          aria-expanded={megaOpen}
          aria-haspopup="true"
          onClick={() => setMegaOpen((v) => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', minHeight: 44, padding: '0 0.75rem', borderRadius: 999, border: 0, background: megaOpen ? 'var(--jb-primary-soft)' : 'transparent', color: megaOpen ? 'var(--jb-primary)' : 'inherit', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}
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
                  {departmentCategories(department.slug).map((category) => (
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
      </li>
      {departments.map((department) => (
        <NavigationMenuItem key={department.slug}>
          <NavigationMenuLink href={`/shop?department=${department.slug}`} active={isDeptActive(department.slug)}>
            {department.name}
          </NavigationMenuLink>
        </NavigationMenuItem>
      ))}
      <NavigationMenuItem>
        <NavigationMenuLink href={collectionsHref} active={collectionsActive}>
          Collections
        </NavigationMenuLink>
      </NavigationMenuItem>
    </NavigationMenu>
  );
}
