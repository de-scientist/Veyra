import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Admin dashboard customer-statistics contract (source-level, no router):
 * the dashboard page and the AdminDashboard type must expose the same
 * per-status customer metrics the API returns, so Total/Active/Suspended/
 * Inactive/Deleted can never drift apart silently.
 */

const pagePath = resolve(process.cwd(), 'apps/web/app/admin/dashboard/page.tsx');
const apiPath = resolve(process.cwd(), 'apps/web/lib/admin-api.ts');
const pageSrc = readFileSync(pagePath, 'utf8');
const apiSrc = readFileSync(apiPath, 'utf8');

describe('admin dashboard customer statistics contract', () => {
  it('types every customer metric the API returns', () => {
    for (const field of [
      'totalCustomers',
      'activeCustomers',
      'suspendedCustomers',
      'inactiveCustomers',
      'deletedCustomers',
      'registeredCustomers',
      'guestOrders',
    ]) {
      expect(apiSrc).toContain(field);
    }
  });

  it('renders Total and per-status customer cards from the matching fields', () => {
    for (const [label, field] of [
      ['Total Customers', 'data.customers.totalCustomers'],
      ['Active Customers', 'data.customers.activeCustomers'],
      ['Suspended Customers', 'data.customers.suspendedCustomers'],
      ['Inactive Customers', 'data.customers.inactiveCustomers'],
      ['Deleted Customers', 'data.customers.deletedCustomers'],
      ['Guest Orders', 'data.customers.guestOrders'],
    ]) {
      expect(pageSrc).toContain(label);
      expect(pageSrc).toContain(field);
    }
  });

  it('deep-links each card to the compatible customer-directory filter', () => {
    for (const status of ['ACTIVE', 'SUSPENDED', 'INACTIVE', 'DELETED']) {
      expect(pageSrc).toContain(`/admin/customers?status=${status}`);
    }
  });
});
