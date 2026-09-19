'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';

import { getSessionUser, isOperationsRole, logout, type SessionUser } from '../../lib/admin-api';

const NAVIGATION: Array<{ href: Route; label: string; icon: string }> = [
  { href: '/admin', label: 'Dashboard', icon: '📊' },
  { href: '/admin/analytics', label: 'Analytics', icon: '📈' },
  { href: '/admin/orders', label: 'Orders', icon: '📦' },
  { href: '/admin/payments', label: 'Payments', icon: '💳' },
  { href: '/admin/fulfillment', label: 'Fulfillment', icon: '🚚' },
  { href: '/admin/products', label: 'Products', icon: '👕' },
  { href: '/admin/inventory', label: 'Inventory', icon: '📋' },
  { href: '/admin/returns', label: 'Returns', icon: '↩️' },
  { href: '/admin/customers', label: 'Customers', icon: '👥' },
  { href: '/admin/reviews', label: 'Reviews', icon: '⭐' },
  { href: '/admin/coupons', label: 'Coupons', icon: '🎟️' },
  { href: '/admin/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: '📝' },
  { href: '/admin/settings', label: 'Settings', icon: '⚙️' },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSessionUser()
      .then((result) => {
        if (!mounted) return;
        // UX-only gate: backend authorization remains mandatory on every endpoint.
        if (!isOperationsRole(result.roles)) {
          router.replace('/');
          return;
        }
        setSession(result);
      })
      .catch(() => {
        if (mounted) router.replace('/');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      router.replace('/');
    }
  };

  if (loading) return <div className="empty-state"><p>Checking admin access…</p></div>;
  if (!session) return <div className="empty-state"><p>Redirecting…</p></div>;

  return (
    <div className="admin-layout">
      <button
        type="button"
        className="account-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-controls="admin-nav"
        aria-label={mobileOpen ? 'Close admin navigation' : 'Open admin navigation'}
      >
        ☰ Admin
      </button>
      <nav id="admin-nav" className={`account-nav admin-nav ${mobileOpen ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="admin-nav__brand">
          <Link href="/admin" className="brand" aria-label="JB operations dashboard">
            <Image src="/jb-logo.png" alt="" width={30} height={30} />
            <span>JB OPS</span>
          </Link>
          <span className="badge badge--current">{session.roles[0] ?? 'staff'}</span>
        </div>
        <ul className="account-nav-list">
          {NAVIGATION.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link href={item.href} className={`account-nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)}>
                  <span className="account-nav-icon" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="admin-nav__footer">
          <p className="muted-copy">{session.user.firstName} {session.user.lastName}</p>
          <p className="muted-copy">{session.user.email}</p>
          <button type="button" className="text-button" onClick={handleLogout}>Log out</button>
        </div>
      </nav>
      {mobileOpen && <div className="account-nav-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <main className="account-main admin-main" role="main">
        <div className="container page-shell">{children}</div>
      </main>
    </div>
  );
}
