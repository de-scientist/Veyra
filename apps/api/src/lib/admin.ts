import { HttpError } from './errors.js';

export const ADMIN_PAGE_SIZE_MAX = 50;
export const RESTOCK_QUANTITY_MAX = 100000;
export const ADJUST_DELTA_MAX = 100000;

export function paginate(page: number, pageSize: number, total: number) {
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeSize = Math.min(ADMIN_PAGE_SIZE_MAX, Math.max(1, Math.floor(pageSize) || 20));
  return { page: safePage, pageSize: safeSize, total, totalPages: Math.max(1, Math.ceil(total / safeSize)), skip: (safePage - 1) * safeSize };
}

/**
 * Validate a manual stock adjustment against inventory invariants. Pure and
 * unit-tested; the route layer re-checks inside the transaction.
 */
export function validateInventoryAdjustment(quantityOnHand: number, quantityReserved: number, delta: number): number {
  if (!Number.isInteger(delta) || delta === 0) {
    throw new HttpError(400, 'INVALID_INVENTORY_ADJUSTMENT', 'Adjustment delta must be a non-zero whole number.');
  }
  if (Math.abs(delta) > ADJUST_DELTA_MAX) {
    throw new HttpError(400, 'INVALID_INVENTORY_ADJUSTMENT', 'Adjustment delta exceeds the allowed maximum.');
  }
  const nextQuantity = quantityOnHand + delta;
  if (nextQuantity < 0) {
    throw new HttpError(400, 'INVALID_INVENTORY_ADJUSTMENT', 'Inventory cannot be negative.');
  }
  if (nextQuantity < quantityReserved) {
    throw new HttpError(409, 'RESERVED_STOCK_CONFLICT', 'Adjustment would leave reserved stock uncovered. Release or fulfil reservations first.');
  }
  return nextQuantity;
}

export function validateRestockQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > RESTOCK_QUANTITY_MAX) {
    throw new HttpError(400, 'INVALID_RESTOCK_QUANTITY', 'Restock quantity must be a positive whole number within limits.');
  }
}

export function validateAuditReason(reason: string | undefined, field = 'reason'): string {
  const trimmed = (reason ?? '').trim();
  if (trimmed.length < 3 || trimmed.length > 200) {
    throw new HttpError(400, 'REASON_REQUIRED', `A ${field} of 3–200 characters is required.`);
  }
  return trimmed.slice(0, 200);
}

const OPERATIONS_ROLES = new Set(['staff', 'admin', 'super_admin', 'super-admin']);

export function isOperationsRoleSlug(slug: string | null | undefined): boolean {
  return !!slug && OPERATIONS_ROLES.has(slug.toLowerCase());
}
