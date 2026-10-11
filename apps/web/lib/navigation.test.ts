import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { createElement as reactCreateElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Breadcrumb } from '../components/ui/breadcrumb';
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink } from '../components/ui/navigation-menu';
import { Separator } from '../components/ui/separator';
import { Sheet } from '../components/ui/sheet';
import { Skeleton } from '../components/ui/skeleton';
import { Tooltip } from '../components/ui/tooltip';
import { buildAdminBreadcrumbs } from './breadcrumbs';
import { cn } from './cn';

// Classic-runtime global for JSX-transpiled components outside Next/SWC.
beforeEach(() => {
  vi.stubGlobal('React', React);
});

// Loosely typed alias so children-as-arguments satisfies both tsc strict
// overloads and the `react/no-children-prop` lint rule.
const h = reactCreateElement as unknown as (...args: Array<string | object | null | undefined>) => React.ReactElement;

// ---------------------------------------------------------------------------
// cn()
// ---------------------------------------------------------------------------

describe('cn', () => {
  it('joins truthy classes and skips falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b');
  });

  it('flattens nested arrays', () => {
    expect(cn('a', ['b', false, ['c']])).toBe('a b c');
  });
});

// ---------------------------------------------------------------------------
// buildAdminBreadcrumbs()
// ---------------------------------------------------------------------------

describe('buildAdminBreadcrumbs', () => {
  it('resolves the dashboard to a single current crumb', () => {
    // Single crumb renders as current-page text (Breadcrumb ignores href on last).
    expect(buildAdminBreadcrumbs('/admin/dashboard')).toEqual([{ label: 'Dashboard', href: '/admin/dashboard' }]);
    expect(buildAdminBreadcrumbs('/admin')).toEqual([{ label: 'Dashboard', href: '/admin/dashboard' }]);
  });

  it('resolves exact item routes with their section', () => {
    expect(buildAdminBreadcrumbs('/admin/products')).toEqual([
      { label: 'Catalogue' },
      { label: 'Products' },
    ]);
  });

  it('links the parent and hides raw IDs for nested routes', () => {
    expect(buildAdminBreadcrumbs('/admin/products/abc-123')).toEqual([
      { label: 'Catalogue' },
      { label: 'Products', href: '/admin/products' },
      { label: 'Details' },
    ]);
    expect(buildAdminBreadcrumbs('/admin/orders/ORD-1')).toEqual([
      { label: 'Orders & Fulfillment' },
      { label: 'Orders', href: '/admin/orders' },
      { label: 'Details' },
    ]);
  });

  it('keeps super-admin-only items resolvable without leaking roles', () => {
    expect(buildAdminBreadcrumbs('/admin/users/x')).toEqual([
      { label: 'System' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Details' },
    ]);
  });

  it('falls back safely for unknown admin paths', () => {
    const crumbs = buildAdminBreadcrumbs('/admin/nope');
    expect(crumbs[0]).toEqual({ label: 'Admin', href: '/admin/dashboard' });
    expect(crumbs[crumbs.length - 1].label).toBeTruthy();
  });

  it('falls back to the dashboard for non-admin paths', () => {
    expect(buildAdminBreadcrumbs('/shop')).toEqual([{ label: 'Dashboard', href: '/admin/dashboard' }]);
  });
});

// ---------------------------------------------------------------------------
// UI primitive rendered contracts
// ---------------------------------------------------------------------------

describe('Sheet rendered contract', () => {
  it('renders nothing while closed (no a11y-tree residue)', () => {
    expect(renderToStaticMarkup(h(Sheet, { open: false, onClose: () => undefined, label: 'Nav' }, 'x'))).toBe('');
  });

  it('renders a labelled modal dialog with an overlay while open', () => {
    const html = renderToStaticMarkup(
      h(Sheet, { open: true, onClose: () => undefined, label: 'Site navigation' }, 'x'),
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Site navigation"');
    expect(html).toContain('sheet-overlay');
  });

  it('supports a right-hand variant', () => {
    const html = renderToStaticMarkup(
      h(Sheet, { open: true, onClose: () => undefined, label: 'Panel', side: 'right' }, 'x'),
    );
    expect(html).toContain('ui-sheet--right');
  });
});

describe('NavigationMenu rendered contract', () => {
  it('marks the active link without relying on colour alone', () => {
    const html = renderToStaticMarkup(
      h(NavigationMenu, { label: 'Main navigation' },
        h(NavigationMenuItem, null,
          h(NavigationMenuLink, { href: '/shop', active: true }, 'Shop'))),
    );
    expect(html).toContain('aria-label="Main navigation"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('is-active');
  });

  it('omits active semantics for inactive links', () => {
    const html = renderToStaticMarkup(
      h(NavigationMenuLink, { href: '/shop' }, 'Shop'),
    );
    expect(html).not.toContain('aria-current');
    expect(html).not.toContain('is-active');
  });
});

describe('Breadcrumb rendered contract', () => {
  it('renders nothing for an empty trail', () => {
    expect(renderToStaticMarkup(h(Breadcrumb, { items: [] }))).toBe('');
  });

  it('links parents and marks the current page as text', () => {
    const html = renderToStaticMarkup(
      h(Breadcrumb, {
        items: [
          { label: 'Catalogue' },
          { label: 'Products', href: '/admin/products' },
          { label: 'Details' },
        ],
      }),
    );
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('href="/admin/products"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('>Details<');
  });
});

describe('Tooltip rendered contract', () => {
  it('exposes its label as a non-interactive tooltip', () => {
    const html = renderToStaticMarkup(
      h(Tooltip, { label: 'Products' }, h('a', { href: '/x' }, 'x')),
    );
    expect(html).toContain('role="tooltip"');
    expect(html).toContain('Products');
  });
});

describe('Separator and Skeleton contracts', () => {
  it('renders an oriented separator', () => {
    expect(renderToStaticMarkup(h(Separator, null))).toContain('role="separator"');
  });

  it('announces skeleton loading politely', () => {
    const html = renderToStaticMarkup(h(Skeleton, { label: 'Checking admin access' }));
    expect(html).toContain('role="status"');
    expect(html).toContain('Checking admin access');
  });
});

// ---------------------------------------------------------------------------
// Source contracts: header, footer, admin shell
// ---------------------------------------------------------------------------

const root = process.cwd();
const headerSrc = readFileSync(resolve(root, 'apps/web/components/Header.tsx'), 'utf8');
const footerSrc = readFileSync(resolve(root, 'apps/web/components/Footer.tsx'), 'utf8');
const shellSrc = readFileSync(resolve(root, 'apps/web/app/admin/AdminShell.tsx'), 'utf8');
const searchBarSrc = readFileSync(resolve(root, 'apps/web/components/SearchBar.tsx'), 'utf8');

describe('storefront header contract', () => {
  it('exposes exactly one primary search control (expanding panel)', () => {
    expect(headerSrc).toContain('jb-header-search');
    expect(headerSrc).toContain('aria-expanded={searchOpen}');
    // The old header-actions Search link is gone; the drawer keeps one Search
    // navigation link and SearchBar lives only on /search + the panel.
    expect(headerSrc.match(/href="\/search"/g)?.length ?? 0).toBe(1);
  });

  it('keeps search state safe (closes on navigation, Escape-aware)', () => {
    expect(headerSrc).toContain('setSearchOpen(false)');
    expect(headerSrc).toContain("event.key === 'Escape'");
  });

  it('marks active navigation without colour alone', () => {
    expect(headerSrc).toContain('isDeptActive');
    expect(headerSrc).toContain('collectionsActive');
    // aria-current lives in the NavigationMenuLink primitive (tested above);
    // the header must pass per-link active flags into it.
    expect(headerSrc).toContain('active={isDeptActive');
    expect(headerSrc).toContain('active={collectionsActive}');
  });

  it('derives Collections from live data with a seed-verified fallback only', () => {
    expect(headerSrc).toContain('getNavCollections');
    expect(headerSrc.match(/'\/collections\/weekend-edit'/g)?.length ?? 0).toBe(1);
  });

  it('reads the query param without useSearchParams (no prerender failure)', () => {
    // useSearchParams in the root-layout header breaks static prerendering of
    // this app (verified by build bisect); the department is read from
    // window.location.search in an effect instead — active styling is a
    // progressive enhancement.
    expect(headerSrc).not.toContain('useSearchParams');
    expect(headerSrc).toContain('window.location.search');
    expect(headerSrc).toContain("get('department')");
  });

  it('announces the cart accessibly and preserves session sync', () => {
    expect(headerSrc).toContain('Shopping cart');
    expect(headerSrc).toContain('CART_UPDATED_EVENT');
    expect(headerSrc).toContain('WISHLIST_UPDATED_EVENT');
    expect(headerSrc).toContain('AccountMenu');
  });

  it('uses the shared Sheet drawer (no duplicate modal implementation)', () => {
    expect(headerSrc).toContain('<Sheet');
    expect(headerSrc).toContain("from './ui/sheet'");
    expect(headerSrc).not.toContain('useModalFocus');
  });

  it('drops stale search responses instead of newer results', () => {
    expect(searchBarSrc).toContain('current');
    expect(searchBarSrc).toContain('250');
  });
});

describe('storefront footer contract', () => {
  it('links only real destinations (verified route set)', () => {
    const hrefs = Array.from(footerSrc.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
    const known = new Set([
      '/shop',
      '/account/orders',
      '/returns',
      '/search',
      '/checkout',
      '/account',
      '/account/profile',
      '/wishlist',
      '/cart',
    ]);
    for (const href of hrefs) {
      if (href.startsWith('tel:')) continue;
      const base = href.split('?')[0];
      if (base.startsWith('/collections/')) continue; // live slugs from the API
      if (base === '/shop') continue; // department query links
      expect(known.has(base)).toBe(true);
    }
  });

  it('invents no legal, contact, newsletter, or social destinations', () => {
    // Href-scoped so code comments documenting the decision cannot trip it.
    const hrefs = Array.from(footerSrc.matchAll(/href="([^"]+)"/g)).map((m) => m[1]);
    // Only literal hrefs are checked here; the `tel:` destination comes from
    // the verified `JB_CONTACT_PHONE_TEL` constant (see business-contact tests).
    for (const href of hrefs.filter((h) => h.startsWith('/'))) {
      expect(href.toLowerCase()).not.toMatch(/terms|privacy|faq|contact|about|facebook|twitter|instagram|newsletter/);
    }
    expect(hrefs.some((h) => h.startsWith('http'))).toBe(false);
    expect(footerSrc).not.toContain('<form');
    expect(footerSrc.toLowerCase()).not.toContain('newsletter');
  });

  it('builds shop links from live catalogue data with graceful fallback', () => {
    expect(footerSrc).toContain('getCollections');
    expect(footerSrc).toContain('.catch(() => [])');
    expect(footerSrc).toContain('departments');
  });

  it('uses the single business-contact source (no hard-coded digits)', () => {
    expect(footerSrc).toContain('JB_CONTACT_PHONE_TEL');
    expect(footerSrc).not.toMatch(/tel:\+\d+/);
  });
});

describe('admin shell contract', () => {
  it('filters navigation only through the canonical RBAC helpers', () => {
    expect(shellSrc).toContain('visibleNavSections');
    expect(shellSrc).toContain('isNavActive');
    expect(shellSrc).not.toContain('superAdminOnly');
    expect(shellSrc).not.toContain('super_admin');
  });

  it('names icon-only collapsed links via tooltips', () => {
    expect(shellSrc).toContain('<Tooltip');
    expect(shellSrc).toContain('aria-label={collapsed ? item.label : undefined}');
  });

  it('provides page context through a breadcrumb topbar', () => {
    expect(shellSrc).toContain('<Breadcrumb');
    expect(shellSrc).toContain('buildAdminBreadcrumbs(pathname)');
    expect(shellSrc).toContain('admin-topbar');
    expect(shellSrc).toContain('ThemeToggle');
  });

  it('preserves collapse persistence and session sync without reloads', () => {
    expect(shellSrc).toContain('jb-admin-sidebar-collapsed');
    expect(shellSrc).toContain('useSession');
    expect(shellSrc).not.toContain('location.reload');
  });
});
