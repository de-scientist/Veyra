'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';

import { can, logout, type SessionUser } from '../lib/admin-api';
import { useSession } from '../lib/session';
import { getAvatarMenuLabel, getDisplayName } from '../lib/avatar';
import { JBIcon, type JBIconName } from './JBIcons';
import { UserAvatar } from './UserAvatar';
import { useToast } from './Toast';

type MenuEntry = { href: Route; label: string; icon: JBIconName };

const ACCOUNT_ENTRIES: MenuEntry[] = [
  { href: '/account', label: 'My Account', icon: 'home' },
  { href: '/account/orders', label: 'Orders', icon: 'box' },
  { href: '/account/wishlist', label: 'Wishlist', icon: 'heart' },
  { href: '/account/profile', label: 'Profile', icon: 'user' },
  { href: '/account/addresses', label: 'Addresses', icon: 'pin' },
  { href: '/account/preferences', label: 'Preferences', icon: 'sliders' },
];

const ADMIN_ENTRY: MenuEntry = { href: '/admin/dashboard' as Route, label: 'Admin Dashboard', icon: 'grid' };

/**
 * Authenticated account control: avatar trigger + accessible dropdown menu.
 * Permission checks here are UX-only; every backend endpoint re-authorizes.
 */
export function AccountMenu({ session }: { session: SessionUser }) {
  const router = useRouter();
  const { clear } = useSession();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showAdmin = can('dashboard.read', session.roles);
  const entries = showAdmin ? [...ACCOUNT_ENTRIES, ADMIN_ENTRY] : ACCOUNT_ENTRIES;
  const displayName = getDisplayName(session.user);

  useEffect(() => {
    if (!open) return;
    // Focus the first item on open for keyboard/screen-reader users.
    menuRef.current?.querySelector<HTMLElement>('a,button')?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && menuRef.current) {
        event.preventDefault();
        const items = Array.from(menuRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next =
          event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
        items[next]?.focus();
      }
      // Tab leaves the menu: dismiss instead of stranding an open menu.
      if (event.key === 'Tab' && menuRef.current && !menuRef.current.contains(document.activeElement)) {
        setOpen(false);
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !triggerRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open ]);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // Server revocation first; client state clears only on success so a
      // failed logout never pretends the session ended.
      await logout();
      setOpen(false);
      clear();
      notify('success', 'You have been signed out.');
      router.push('/');
      router.refresh();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Sign out failed. Please try again.');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="account-menu">
      <button
        ref={triggerRef}
        type="button"
        className="account-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={getAvatarMenuLabel(session.user)}
        onClick={() => setOpen((v) => !v)}
      >
        <UserAvatar user={session.user} size="sm" decorative />
        <span className="header-label account-menu__name" aria-hidden="true">
          {session.user.firstName || displayName}
        </span>
      </button>
      {open ? (
        <div ref={menuRef} className="account-menu__panel" role="menu" aria-label={`Account menu for ${displayName}`}>
          <div className="account-menu__header" aria-hidden="true">
            <UserAvatar user={session.user} size="md" decorative />
            <div className="account-menu__identity">
              <strong>{displayName}</strong>
              <span>{session.user.email}</span>
            </div>
          </div>
          <ul className="account-menu__list">
            {entries.map((entry) => (
              <li key={entry.href} role="none">
                <Link
                  href={entry.href}
                  role="menuitem"
                  className="account-menu__item"
                  onClick={() => setOpen(false)}
                >
                  <JBIcon name={entry.icon} />
                  {entry.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="account-menu__footer">
            <button
              type="button"
              role="menuitem"
              className="account-menu__item account-menu__signout"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              <JBIcon name="logout" />
              {loggingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
          {/* Screen-reader access to identity without duplicating visible text. */}
          <span className="visually-hidden">
            {displayName}, {session.user.email}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/** Stable placeholder while session state loads — prevents Sign In ↔ avatar flicker. */
export function AccountMenuSkeleton() {
  return (
    <span className="account-menu__skeleton" role="status" aria-label="Loading account">
      <span className="jb-avatar jb-avatar--sm jb-avatar--skeleton" aria-hidden="true" />
    </span>
  );
}
