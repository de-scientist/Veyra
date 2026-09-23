import { describe, expect, it } from 'vitest';

import { isOperationsRoleSlug, paginate, validateAuditReason, validateInventoryAdjustment, validateRestockQuantity } from './admin.js';

describe('admin inventory guards', () => {
  it('accepts adjustments that preserve invariants', () => {
    expect(validateInventoryAdjustment(100, 10, -20)).toBe(80);
    expect(validateInventoryAdjustment(100, 10, 50)).toBe(150);
  });

  it('rejects zero, fractional, and oversized deltas', () => {
    expect(() => validateInventoryAdjustment(100, 0, 0)).toThrow('non-zero');
    expect(() => validateInventoryAdjustment(100, 0, 1.5)).toThrow();
    expect(() => validateInventoryAdjustment(100, 0, 200000)).toThrow('maximum');
  });

  it('rejects negative stock and uncovered reservations', () => {
    try {
      validateInventoryAdjustment(5, 0, -10);
      expect.unreachable('expected negative-stock rejection');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('INVALID_INVENTORY_ADJUSTMENT');
    }
    try {
      validateInventoryAdjustment(10, 8, -5);
      expect.unreachable('expected reserved-stock rejection');
    } catch (error) {
      expect((error as { code?: string }).code).toBe('RESERVED_STOCK_CONFLICT');
    }
  });

  it('validates restock quantities', () => {
    expect(() => validateRestockQuantity(10)).not.toThrow();
    expect(() => validateRestockQuantity(0)).toThrow();
    expect(() => validateRestockQuantity(-3)).toThrow();
    expect(() => validateRestockQuantity(1.5)).toThrow();
  });
});

describe('admin audit reasons', () => {
  it('requires a meaningful reason', () => {
    expect(validateAuditReason('damaged goods')).toBe('damaged goods');
    for (const bad of ['  ', undefined, 'x'.repeat(201), 'ab']) {
      try {
        validateAuditReason(bad);
        expect.unreachable('expected REASON_REQUIRED');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('REASON_REQUIRED');
      }
    }
  });
});

describe('admin pagination', () => {
  it('bounds page size and computes skip', () => {
    expect(paginate(2, 20, 95)).toEqual({ page: 2, pageSize: 20, total: 95, totalPages: 5, skip: 20 });
    expect(paginate(1, 500, 10).pageSize).toBe(50);
    expect(paginate(0, 0, 0)).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 1, skip: 0 });
  });
});

describe('operations role slugs', () => {
  it('recognises staff, admin, and super-admin variants', () => {
    expect(isOperationsRoleSlug('staff')).toBe(true);
    expect(isOperationsRoleSlug('ADMIN')).toBe(true);
    expect(isOperationsRoleSlug('super_admin')).toBe(true);
    expect(isOperationsRoleSlug('customer')).toBe(false);
    expect(isOperationsRoleSlug(null)).toBe(false);
    expect(isOperationsRoleSlug(undefined)).toBe(false);
  });
});
