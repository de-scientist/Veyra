'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { Route } from 'next';

import { useModalFocus } from '../../components/a11y';
import { JBIcon } from '../../components/JBIcons';
import { JBLogo } from '../../components/JBLogo';
import { useConfirm } from '../../components/ConfirmDialog';
import { UserAvatar } from '../../components/UserAvatar';
import { isOperationsRole, logout } from '../../lib/admin-api';
import { isNavActive, primaryRoleLabel, visibleNavSections } from '../../lib/admin-nav';
import { getDisplayName } from '../../lib/avatar';
import { useSession } from '../../lib/session';

const COLLAPSED_KEY = 'jb-admin-sidebar-collapsed';
const SECTIONS_KEY = 'jb-admin-sidebar-sections';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function readSectionState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SECTIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Single authoritative session cache (SessionProvider owns `/auth/me`;
  // profile/avatar updates arrive via `notifySessionUpdated` — no reloads).
  const { status, session, clear } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, boolean>>({});
  const closeRef = useRef<HTMLButtonElement>(null);
  const identityRef = useRef<HTMLDivElement>(null);
  const identityTriggerRef = useRef<HTMLButtonElement>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  // Modal slide-over on mobile: trap, Escape, scroll-lock, focus restore.
  const navRef = useModalFocus({ active: mobileOpen, onClose: () => setMobileOpen(false), initialFocusRef: closeRef });

  const isUnauthorizedPage = pathname === '/admin/unauthorized';

  useEffect(() => {
    setCollapsed(readCollapsed());
    setSectionOverrides(readSectionState());
  }, []);

  // Identity dropdown: Escape closes + focus returns; click-outside closes.
  useEffect(() => {
    if (!identityOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIdentityOpen(false);
        identityTriggerRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (identityRef.current && !identityRef.current.contains(event.target as Node)) setIdentityOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [identityOpen]);

  // UX-only gate: backend authorization remains mandatory on every endpoint.
  useEffect(() => {
    if (isUnauthorizedPage) return;
    if (status === 'loading') return;
    if (!session) {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirect}` as Route);
      return;
    }
    if (!isOperationsRole(session.roles)) {
      router.replace('/admin/unauthorized');
    }
  }, [status, session, router, pathname, isUnauthorizedPage]);

  const sections = useMemo(
    () => (session ? visibleNavSections(session.roles) : []),
    [session],
  );

  // Active section auto-expands; the user can still collapse it manually
  // (manual choice persists in sessionStorage for the session).
  const isSectionOpen = (sectionId: string) => {
    if (sectionOverrides[sectionId] !== undefined) return sectionOverrides[sectionId];
    const section = sections.find((s) => s.id === sectionId);
    if (section && section.items.some((item) => isNavActive(pathname, item.href))) return true;
    // Default: catalogue-heavy ops sections start open, the rest start open
    // too on first paint (no hidden-by-default privileged nav surprises).
    return true;
  };

  const toggleSection = (sectionId: string) => {
    setSectionOverrides((prev) => {
      const current = prev[sectionId] ?? true;
      const next = { ...prev, [sectionId]: !current };
      try {
        window.sessionStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable (private mode) — state still works in-memory.
      }
      return next;
    });
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Ignore persistence failures; in-memory state still applies.
      }
      return next;
    });
  };

  const handleLogout = async () => {
    setIdentityOpen(false);
    const confirmed = await confirm({
      title: 'Log out of JB operations?',
      description: 'You will be signed out of the operations dashboard on this device.',
      confirmLabel: 'Log out',
      variant: 'default',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    try {
      // Server revocation first; client state clears so the sidebar updates.
      await logout();
    } finally {
      clear();
      router.replace('/login');
    }
  };

  if (isUnauthorizedPage) {
    return <main className="account-main admin-main"><div className="container page-shell">{children}</div></main>;
  }

  // Auth gate: protected children render only after the session is
  // confirmed (same as the previous shell). Rendering children while
  // loading would (a) flash unauthenticated API errors and (b) force
  // static prerendering of pages that use `useSearchParams` without a
  // Suspense boundary (e.g. /admin/orders, /admin/inventory), which
  // breaks `next build`. The skeleton keeps layout stable meanwhile.
  if (status === 'loading' || !session) {
    return (
      <div className="admin-layout jb-admin" data-collapsed="false">
        <div className="jb-sidebar__skeleton" role="status" aria-label="Checking admin access">
          <span className="skeleton" style={{ height: '2.5rem', width: '70%' }} />
          <span className="skeleton" style={{ height: '1rem' }} />
          <span className="skeleton" style={{ height: '1rem' }} />
          <span className="skeleton" style={{ height: '1rem', width: '80%' }} />
          <p className="muted-copy">Checking admin access…</p>
        </div>
        <main className="account-main admin-main">
          <div className="container page-shell" aria-hidden="true" />
        </main>
      </div>
    );
  }

  const displayName = getDisplayName(session.user);
  const roleLabel = primaryRoleLabel(session.roles);

  return (
    <div className="admin-layout jb-admin" data-collapsed={collapsed ? 'true' : 'false'}>
      {confirmDialog}
      <button
        type="button"
        className="account-mobile-toggle jb-admin__mobile-toggle"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-expanded={mobileOpen}
        aria-controls="admin-nav"
        aria-label={mobileOpen ? 'Close admin navigation' : 'Open admin navigation'}
      >
        <JBIcon name="menu" /> Admin
      </button>
      <nav id="admin-nav" ref={navRef} className={`account-nav admin-nav jb-sidebar ${mobileOpen ? 'open' : ''}`} aria-label="Admin navigation">
        {/* Brand header: horizontal lockup expanded, square mark collapsed. */}
        <div className="jb-sidebar__brand">
          <Link href="/admin/dashboard" className="jb-sidebar__brand-link" aria-label="JB Mercantile operations dashboard" onClick={() => setMobileOpen(false)}>
            {collapsed ? (
              <JBLogo variant="full" alt="" height={36} />
            ) : (
              <>
                <JBLogo variant="compact" alt="" height={30} />
                <span className="jb-sidebar__brand-text">
                  <strong>JB Mercantile</strong>
                  <span>Commerce Platform</span>
                </span>
              </>
            )}
          </Link>
          <button
            type="button"
            className="jb-sidebar__collapse"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="admin-nav"
            aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <JBIcon name={collapsed ? 'chevron-right' : 'chevron-left'} size={16} />
          </button>
        </div>
        {mobileOpen ? (
          <button ref={closeRef} type="button" className="button button--secondary button--small" onClick={() => setMobileOpen(false)} aria-label="Close admin navigation" style={{ marginBottom: '0.75rem' }}>
            <JBIcon name="close" /> Close
          </button>
        ) : null}

        {/* Identity: real avatar → initials fallback, real name, human role. */}
        <div className="jb-sidebar__identity" ref={identityRef}>
          <button
            ref={identityTriggerRef}
            type="button"
            className="jb-sidebar__identity-trigger"
            aria-haspopup="menu"
            aria-expanded={identityOpen}
            aria-label={`Account for ${displayName}, ${roleLabel}. Open account menu`}
            onClick={() => setIdentityOpen((v) => !v)}
            title={collapsed ? `${displayName} — ${roleLabel}` : undefined}
          >
            <UserAvatar user={session.user} size="md" decorative />
            {!collapsed && (
              <span className="jb-sidebar__identity-text">
                <strong title={displayName}>{displayName}</strong>
                <span className="jb-sidebar__role">{roleLabel}</span>
              </span>
            )}
            {!collapsed && <JBIcon name="chevron" size={14} />}
          </button>
          {identityOpen && !collapsed ? (
            <div className="jb-sidebar__identity-menu" role="menu" aria-label={`Account menu for ${displayName}`}>
              <div className="jb-sidebar__identity-meta" aria-hidden="true">
                <strong>{displayName}</strong>
                <span>{session.user.email}</span>
              </div>
              <Link href="/account/profile" role="menuitem" className="jb-sidebar__menu-item" onClick={() => { setIdentityOpen(false); setMobileOpen(false); }}>
                <JBIcon name="user" size={16} /> Profile
              </Link>
              <Link href="/account/security" role="menuitem" className="jb-sidebar__menu-item" onClick={() => { setIdentityOpen(false); setMobileOpen(false); }}>
                <JBIcon name="lock" size={16} /> Security
              </Link>
              <button type="button" role="menuitem" className="jb-sidebar__menu-item" onClick={handleLogout}>
                <JBIcon name="logout" size={16} /> Sign out
              </button>
            </div>
          ) : null}
        </div>

        <div className="jb-sidebar__scroll">
          {sections.map((section) => {
            const open = collapsed ? true : isSectionOpen(section.id);
            const sectionActive = section.items.some((item) => isNavActive(pathname, item.href));
            return (
              <section key={section.id} className="jb-sidebar__section" aria-label={section.label} data-active={sectionActive ? 'true' : undefined}>
                {collapsed ? (
                  <span className="visually-hidden" aria-hidden={false}>{section.label}</span>
                ) : (
                  <button
                    type="button"
                    className="jb-sidebar__section-toggle"
                    aria-expanded={open}
                    aria-controls={`jb-section-${section.id}`}
                    onClick={() => toggleSection(section.id)}
                  >
                    <span className="jb-sidebar__section-label">{section.label}</span>
                    <JBIcon name="chevron" size={14} />
                  </button>
                )}
                {open ? (
                  <ul className="account-nav-list jb-sidebar__list" id={`jb-section-${section.id}`}>
                    {section.items.map((item) => {
                      const active = isNavActive(pathname, item.href);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href as Route}
                            className={`account-nav-link jb-sidebar__link ${active ? 'active' : ''}`}
                            aria-current={active ? 'page' : undefined}
                            aria-label={collapsed ? item.label : undefined}
                            title={collapsed ? item.label : undefined}
                            onClick={() => setMobileOpen(false)}
                          >
                            <span className="account-nav-icon" aria-hidden="true"><JBIcon name={item.icon} /></span>
                            {!collapsed && <span className="jb-sidebar__link-label">{item.label}</span>}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>

        <div className="admin-nav__footer jb-sidebar__footer">
          {!collapsed ? (
            <>
              <p className="jb-sidebar__footer-name" title={displayName}>{displayName}</p>
              <p className="muted-copy jb-sidebar__footer-email" title={session.user.email}>{session.user.email}</p>
              <button type="button" className="text-button jb-sidebar__signout" onClick={handleLogout}>
                <JBIcon name="logout" size={14} /> Log out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="jb-sidebar__avatar-button"
              onClick={handleLogout}
              aria-label={`Log out ${displayName}`}
              title={`Log out ${displayName}`}
            >
              <UserAvatar user={session.user} size="sm" decorative />
            </button>
          )}
        </div>
      </nav>
      {mobileOpen && <div className="account-nav-overlay" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <main className="account-main admin-main">
        <div className="container page-shell">{children}</div>
      </main>
    </div>
  );
}
