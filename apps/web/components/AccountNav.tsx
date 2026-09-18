'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Route } from 'next';

const navigation: Array<{ href: Route; label: string; icon: string }> = [
  { href: '/account', label: 'Overview', icon: '🏠' },
  { href: '/account/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/account/profile', label: 'Profile', icon: '👤' },
  { href: '/account/addresses', label: 'Addresses', icon: '📍' },
  { href: '/account/orders', label: 'Orders', icon: '📦' },
  { href: '/account/wishlist', label: 'Wishlist', icon: '❤️' },
  { href: '/account/returns', label: 'Returns', icon: '↩️' },
  { href: '/account/refunds', label: 'Refunds', icon: '💰' },
  { href: '/account/payments', label: 'Payments', icon: '💳' },
  { href: '/account/security', label: 'Security', icon: '🔒' },
  { href: '/account/preferences', label: 'Preferences', icon: '⚙️' },
];

export function AccountNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button
        className="account-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-controls="account-nav"
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
      >
        ☰ Account
      </button>

      <nav id="account-nav" className={`account-nav ${mobileOpen ? 'open' : ''}`} role="navigation" aria-label="Account navigation">
        <ul className="account-nav-list">
          {navigation.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`account-nav-link ${pathname === item.href || (item.href !== '/account' && pathname.startsWith(item.href)) ? 'active' : ''}`}
                aria-current={pathname === item.href || (item.href !== '/account' && pathname.startsWith(item.href)) ? 'page' : undefined}
              >
                <span className="account-nav-icon" aria-hidden="true">{item.icon}</span>
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