'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';

import { useModalFocus } from '../../components/a11y';
import { JBIcon, type JBIconName } from '../../components/JBIcons';
import { JBLogo } from '../../components/JBLogo';
import { useConfirm } from '../../components/ConfirmDialog';
import { getSessionUser, isOperationsRole, isSuperAdminRole, logout, type SessionUser } from '../../lib/admin-api';

const NAVIGATION: Array<{ href: Route; label: string; icon: JBIconName; superAdminOnly?: boolean }> = [
  { href: '/admin/dashboard' as Route, label: 'Dashboard', icon: 'grid' },
  { href: '/admin/analytics', label: 'Analytics', icon: 'chart' },
  { href: '/admin/orders', label: 'Orders', icon: 'box' },
  { href: '/admin/payments', label: 'Payments', icon: 'card' },
  { href: '/admin/fulfillment', label: 'Fulfillment', icon: 'truck' },
  { href: '/admin/products', label: 'Products', icon: 'tag' },
  { href: '/admin/categories' as Route, label: 'Categories', icon: 'filter' },
  { href: '/admin/collections' as Route, label: 'Collections', icon: 'heart' },
  { href: '/admin/attributes' as Route, label: 'Attributes', icon: 'sliders' },
  { href: '/admin/inventory', label: 'Inventory', icon: 'clipboard' },
  { href: '/admin/returns', label: 'Returns', icon: 'refresh' },
  { href: '/admin/customers', label: 'Customers', icon: 'users' },
  { href: '/admin/reviews', label: 'Reviews', icon: 'star' },
  { href: '/admin/coupons', label: 'Coupons', icon: 'ticket' },
  { href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: 'doc' },
  { href: '/admin/settings', label: 'Settings', icon: 'sliders' },
  // Super-admin only (mirrors the backend requireSuperAdmin guards exactly;
  // hiding is UX-only — the APIs re-authorize every request).
  { href: '/admin/users' as Route, label: 'Users', icon: 'users', superAdminOnly: true },
  { href: '/admin/roles' as Route, label: 'Roles', icon: 'lock', superAdminOnly: true },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  // Modal slide-over on mobile: trap, Escape, scroll-lock, focus restore.
  const navRef = useModalFocus({ active: mobileOpen, onClose: () => setMobileOpen(false), initialFocusRef: closeRef });

  const isUnauthorizedPage = pathname === '/admin/unauthorized';

  useEffect(() => {
    // The 403 page must render without a session gate; otherwise
    // authenticated-but-forbidden users would loop back to `/login`.
    if (isUnauthorizedPage) {
      setLoading(false);
      return;
    }
    let mounted = true;
    getSessionUser()
      .then((result) => {
        if (!mounted) return;
        // UX-only gate: backend authorization remains mandatory on every endpoint.
        if (!isOperationsRole(result.roles)) {
          router.replace('/admin/unauthorized');
          return;
        }
        setSession(result);
      })
      .catch((error: unknown) => {
        if (!mounted) return;
        const code = (error as { code?: string } | null)?.code;
        // Authenticated-but-forbidden sessions surface here when the account
        // is suspended/deleted; anything else unauthenticated goes to login.
        if (code && code !== 'UNAUTHENTICATED') {
          router.replace('/admin/unauthorized');
          return;
        }
        const redirect = encodeURIComponent(pathname);
        router.replace(`/login?redirect=${redirect}` as Route);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [router, pathname, isUnauthorizedPage]);

  const handleLogout = async () => {
    const confirmed = await confirm({
      title: 'Log out of JB operations?',
      description: 'You will be signed out of the operations dashboard on this device.',
      confirmLabel: 'Log out',
      variant: 'default',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  };

  if (isUnauthorizedPage) {
    return <main className="account-main admin-main"><div className="container page-shell">{children}</div></main>;
  }

  if (loading) return <div className="empty-state"><p>Checking admin access…</p></div>;
  if (!session) return <div className="empty-state"><p>Redirecting…</p></div>;

  return (
    <div className="admin-layout">
      {confirmDialog}
      <button
        type="button"
        className="account-mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-controls="admin-nav"
        aria-label={mobileOpen ? 'Close admin navigation' : 'Open admin navigation'}
      >
        <JBIcon name="menu" /> Admin
      </button>
      <nav id="admin-nav" ref={navRef} className={`account-nav admin-nav ${mobileOpen ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="admin-nav__brand">
            <Link href="/admin/dashboard" className="brand" aria-label="JB operations dashboard">
            <JBLogo variant="full" alt="" height={30} />
            <span>JB OPS</span>
          </Link>
          <span className="badge badge--current">{session.roles[0] ?? 'staff'}</span>
        </div>
        {mobileOpen ? (
          <button ref={closeRef} type="button" className="button button--secondary button--small" onClick={() => setMobileOpen(false)} aria-label="Close admin navigation" style={{ marginBottom: '0.75rem' }}>
            <JBIcon name="close" /> Close
          </button>
        ) : null}
        <ul className="account-nav-list">
          {NAVIGATION.filter((item) => !item.superAdminOnly || isSuperAdminRole(session.roles)).map((item) => {
            const active = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link href={item.href} className={`account-nav-link ${active ? 'active' : ''}`} aria-current={active ? 'page' : undefined} onClick={() => setMobileOpen(false)}>
                  <span className="account-nav-icon" aria-hidden="true"><JBIcon name={item.icon} /></span>
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
      <main className="account-main admin-main">
        <div className="container page-shell">{children}</div>
      </main>
    </div>
  );
}
