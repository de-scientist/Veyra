import type { JBIconName } from '../components/JBIcons';

import { isSuperAdminRole } from './admin-api';

/**
 * Canonical admin navigation information architecture.
 *
 * Every `href` below maps to a real route directory under
 * `apps/web/app/admin/*` — no invented links. Visibility filtering is
 * UX-only; every backend endpoint re-authorizes each request.
 * No second RBAC system lives here: super-admin gating reuses the shared
 * `isSuperAdminRole` helper from `admin-api`.
 */

export type AdminNavItem = {
  href: string;
  label: string;
  icon: JBIconName;
  superAdminOnly?: boolean;
};

export type AdminNavSection = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ href: '/admin/dashboard', label: 'Dashboard', icon: 'grid' }],
  },
  {
    id: 'catalogue',
    label: 'Catalogue',
    items: [
      { href: '/admin/products', label: 'Products', icon: 'tag' },
      { href: '/admin/categories', label: 'Categories', icon: 'filter' },
      { href: '/admin/collections', label: 'Collections', icon: 'heart' },
      { href: '/admin/attributes', label: 'Attributes', icon: 'sliders' },
      { href: '/admin/inventory', label: 'Inventory', icon: 'clipboard' },
    ],
  },
  {
    id: 'orders',
    label: 'Orders & Fulfillment',
    items: [
      { href: '/admin/orders', label: 'Orders', icon: 'box' },
      { href: '/admin/payments', label: 'Payments', icon: 'card' },
      { href: '/admin/fulfillment', label: 'Fulfillment', icon: 'truck' },
      { href: '/admin/returns', label: 'Returns', icon: 'refresh' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    items: [
      { href: '/admin/customers', label: 'Customers', icon: 'users' },
      { href: '/admin/reviews', label: 'Reviews', icon: 'star' },
    ],
  },
  {
    id: 'commerce',
    label: 'Commerce',
    items: [
      { href: '/admin/coupons', label: 'Coupons', icon: 'ticket' },
      { href: '/admin/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [{ href: '/admin/analytics', label: 'Analytics', icon: 'chart' }],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { href: '/admin/audit-logs', label: 'Audit Logs', icon: 'doc' },
      { href: '/admin/settings', label: 'Settings', icon: 'sliders' },
      { href: '/admin/users', label: 'Users', icon: 'users', superAdminOnly: true },
      { href: '/admin/roles', label: 'Roles', icon: 'lock', superAdminOnly: true },
    ],
  },
];

/**
 * Convert an internal role identifier (`super_admin`, `super-admin`,
 * `staff`) into a human-readable label (`Super Admin`, `Staff`).
 * Unknown/empty input falls back to `Staff` — never leaks raw identifiers.
 */
export function formatRoleLabel(role: string | null | undefined): string {
  const cleaned = (role ?? '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!cleaned) return 'Staff';
  return cleaned
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

/** Primary (first) role rendered next to the user identity. */
export function primaryRoleLabel(roles: string[] | null | undefined): string {
  if (!roles || roles.length === 0) return 'Staff';
  return formatRoleLabel(roles[0]);
}

/**
 * UX-only visibility filter. Users without the super-admin role never see
 * `superAdminOnly` items; empty sections are dropped so no orphan headings
 * render. Backend authorization remains authoritative.
 */
export function visibleNavSections(roles: string[]): AdminNavSection[] {
  const superAdmin = isSuperAdminRole(roles);
  const sections: AdminNavSection[] = [];
  for (const section of ADMIN_NAV_SECTIONS) {
    const items = section.items.filter((item) => !item.superAdminOnly || superAdmin);
    if (items.length > 0) sections.push({ ...section, items });
  }
  return sections;
}

/**
 * Active-route matcher shared by the sidebar (single source of truth so
 * parent sections and links agree). Exact match, plus prefix match for
 * nested admin pages — except the dashboard, which is exact-only so it is
 * not highlighted for every `/admin/*` route.
 */
export function isNavActive(pathname: string, href: string): boolean {
  if (!pathname || !href) return false;
  if (pathname === href) return true;
  if (href === '/admin/dashboard') return false;
  return pathname.startsWith(`${href}/`) || pathname === href;
}
