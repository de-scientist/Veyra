'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

import { useModalFocus } from './a11y';
import { JBIcon, type JBIconName } from './JBIcons';
import { can } from '../lib/admin-api';
import { useSession } from '../lib/session';

const accountNavigation: Array<{ href: Route; label: string; icon: JBIconName }> = [
  { href: '/account', label: 'Overview', icon: 'home' },
  { href: '/account/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/account/profile', label: 'Profile', icon: 'user' },
  { href: '/account/addresses', label: 'Addresses', icon: 'pin' },
  { href: '/account/orders', label: 'Orders', icon: 'box' },
  { href: '/account/wishlist', label: 'Wishlist', icon: 'heart' },
  { href: '/account/returns', label: 'Returns', icon: 'refresh' },
  { href: '/account/refunds', label: 'Refunds', icon: 'cash' },
  { href: '/account/payments', label: 'Payments', icon: 'card' },
  { href: '/account/security', label: 'Security', icon: 'lock' },
  { href: '/account/preferences', label: 'Preferences', icon: 'sliders' },
];

const adminEntry: { href: Route; label: string; icon: JBIconName } = {
  href: '/admin/dashboard' as Route,
  label: 'Admin Dashboard',
  icon: 'grid',
};

export function AccountNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // Modal slide-over on mobile: trap, Escape, scroll-lock, focus restore.
  const navRef = useModalFocus({ active: mobileOpen, onClose: () => setMobileOpen(false), initialFocusRef: closeRef });

  // Authorization-driven entry point: shown only when the shared session
  // carries dashboard permission. UX-only; `/admin/*` APIs re-authorize.
  // No per-component `/auth/me` request — the SessionProvider owns fetching.
  const { session } = useSession();
  const showAdmin = session ? can('dashboard.read', session.roles) : false;

  const navigation = showAdmin ? [...accountNavigation, adminEntry] : accountNavigation;

  return (
    <>
      <button
        className="account-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-controls="account-nav"
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
      >
        <JBIcon name="menu" /> Account
      </button>

      <nav
        id="account-nav"
        ref={navRef}
        className={`account-nav ${mobileOpen ? 'open' : ''}`}
        aria-label="Account navigation"
      >
        {mobileOpen ? (
          <button ref={closeRef} type="button" className="button button--secondary button--small" onClick={() => setMobileOpen(false)} aria-label="Close navigation" style={{ marginBottom: '0.75rem' }}>
            <JBIcon name="close" /> Close
          </button>
        ) : null}
        <ul className="account-nav-list">
          {navigation.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`account-nav-link ${pathname === item.href || (item.href !== '/account' && pathname.startsWith(item.href)) ? 'active' : ''}`}
                aria-current={pathname === item.href || (item.href !== '/account' && pathname.startsWith(item.href)) ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
              >
                <span className="account-nav-icon" aria-hidden="true"><JBIcon name={item.icon} /></span>
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {mobileOpen && (
        <div className="account-nav-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />
      )}
    </>
  );
}
