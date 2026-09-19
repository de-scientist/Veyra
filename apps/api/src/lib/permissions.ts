import { prisma } from './prisma.js';

/**
 * Central RBAC catalog for JB Mercantile.
 *
 * This module is the single place where role slugs and permission slugs are
 * defined. Route layers must use the guards in `middleware/auth.ts`
 * (`requireOperationsAccess`, `requireFinancialAccess`, `requireAdminAccess`,
 * `requireSuperAdmin`, `requirePermission`) instead of re-implementing
 * role-string checks. The `super_admin` wildcard lives ONLY in
 * `userHasPermissionSlugs` below — never inline in routes.
 */

export const SUPER_ADMIN_SLUGS = ['super_admin', 'super-admin'] as const;

/** Roles permitted to access the operations area (`/admin`, `/api/v1/admin/*`). */
export const OPERATIONS_ROLE_SLUGS = ['staff', 'admin', 'super_admin', 'super-admin'] as const;

/** Roles permitted to perform financial/administrative completion. */
export const FINANCIAL_ROLE_SLUGS = ['admin', 'super_admin', 'super-admin'] as const;

/**
 * Canonical permission slugs. Seeded permissions (prisma/seed.ts) are the
 * authoritative store; this catalog documents the intended vocabulary so new
 * endpoints pick existing slugs instead of inventing new ones.
 */
export const PERMISSIONS = {
  DASHBOARD_READ: 'dashboard.read',
  PRODUCTS_MANAGE: 'products.manage',
  INVENTORY_MANAGE: 'inventory.manage',
  CATEGORIES_MANAGE: 'categories.manage',
  COLLECTIONS_MANAGE: 'collections.manage',
  ORDERS_MANAGE: 'orders.manage',
  FULFILLMENT_READ: 'fulfillment.view',
  FULFILLMENT_PROCESS: 'fulfillment.process',
  DELIVERY_MANAGE: 'delivery.manage',
  REFUNDS_PROCESS: 'refunds.process',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_MANAGE: 'customers.manage',
  USERS_MANAGE: 'users.manage',
  ROLES_MANAGE: 'roles.manage',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  AUDIT_READ: 'audit.read',
  ANALYTICS_READ: 'analytics.read',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type RoleEntry = { role?: { slug?: string | null } | null };

export function normalizeSlug(slug: string | null | undefined): string {
  return (slug ?? '').toLowerCase();
}

export function roleSlugsOf(roles: RoleEntry[]): string[] {
  return roles
    .map((entry) => normalizeSlug(entry.role?.slug))
    .filter((slug) => slug.length > 0);
}

export function isSuperAdminSlug(slug: string | null | undefined): boolean {
  const normalized = normalizeSlug(slug);
  return (SUPER_ADMIN_SLUGS as readonly string[]).includes(normalized);
}

export function isOperationsSlug(slug: string | null | undefined): boolean {
  return (OPERATIONS_ROLE_SLUGS as readonly string[]).includes(normalizeSlug(slug));
}

export function isFinancialSlug(slug: string | null | undefined): boolean {
  return (FINANCIAL_ROLE_SLUGS as readonly string[]).includes(normalizeSlug(slug));
}

/**
 * DB-authoritative permission slugs granted to a user through their roles.
 * SUPER_ADMIN short-circuits to `['*']` here — the ONLY wildcard in the
 * system. Every other role resolves strictly from `RolePermission` rows.
 */
export async function getUserPermissionSlugs(userId: string): Promise<string[]> {
  const memberships = await prisma.userRole.findMany({
    where: { userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  const slugs = roleSlugsOf(memberships.map((m) => ({ role: m.role })));
  if (slugs.some((slug) => isSuperAdminSlug(slug))) {
    return ['*'];
  }
  const granted = new Set<string>();
  for (const membership of memberships) {
    for (const rp of membership.role.permissions) {
      if (rp.permission?.slug) granted.add(rp.permission.slug.toLowerCase());
    }
  }
  return [...granted];
}

/** Pure check used by guards and unit tests. `'*'` grants everything. */
export function userHasPermissionSlugs(granted: string[], required: string[]): boolean {
  const normalized = granted.map((slug) => slug.toLowerCase());
  if (normalized.includes('*')) return true;
  return required.every((slug) => normalized.includes(slug.toLowerCase()));
}
