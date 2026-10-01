import { describe, expect, it } from 'vitest';

import { ADMIN_NAV_SECTIONS, formatRoleLabel, isNavActive, primaryRoleLabel, visibleNavSections } from './admin-nav';

describe('formatRoleLabel', () => {
  it('humanizes snake_case identifiers', () => {
    expect(formatRoleLabel('super_admin')).toBe('Super Admin');
  });

  it('humanizes kebab-case identifiers', () => {
    expect(formatRoleLabel('super-admin')).toBe('Super Admin');
  });

  it('capitalizes plain roles', () => {
    expect(formatRoleLabel('staff')).toBe('Staff');
    expect(formatRoleLabel('admin')).toBe('Admin');
  });

  it('never leaks raw identifiers for empty input', () => {
    expect(formatRoleLabel('')).toBe('Staff');
    expect(formatRoleLabel(null)).toBe('Staff');
    expect(formatRoleLabel(undefined)).toBe('Staff');
  });

  it('never returns snake_case or kebab-case output', () => {
    for (const role of ['super_admin', 'super-admin', 'staff', 'admin']) {
      expect(formatRoleLabel(role)).not.toMatch(/[_-]/);
    }
  });
});

describe('primaryRoleLabel', () => {
  it('uses the first role', () => {
    expect(primaryRoleLabel(['super_admin', 'admin'])).toBe('Super Admin');
  });

  it('falls back to Staff when roles are missing', () => {
    expect(primaryRoleLabel([])).toBe('Staff');
    expect(primaryRoleLabel(null)).toBe('Staff');
    expect(primaryRoleLabel(undefined)).toBe('Staff');
  });
});

describe('visibleNavSections', () => {
  it('hides super-admin items from staff and admins', () => {
    const sections = visibleNavSections(['staff']);
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).not.toContain('/admin/users');
    expect(hrefs).not.toContain('/admin/roles');
  });

  it('shows every section to super admins', () => {
    const sections = visibleNavSections(['super_admin']);
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/admin/users');
    expect(hrefs).toContain('/admin/roles');
    expect(sections.length).toBe(ADMIN_NAV_SECTIONS.length);
  });

  it('keeps operational sections for staff', () => {
    const sections = visibleNavSections(['staff']);
    const labels = sections.map((s) => s.label);
    expect(labels).toContain('Orders & Fulfillment');
    expect(labels).toContain('Catalogue');
  });
});

describe('isNavActive', () => {
  it('matches exact routes', () => {
    expect(isNavActive('/admin/products', '/admin/products')).toBe(true);
  });

  it('matches nested routes via prefix', () => {
    expect(isNavActive('/admin/products/abc', '/admin/products')).toBe(true);
  });

  it('keeps the dashboard exact-only', () => {
    expect(isNavActive('/admin/dashboard', '/admin/dashboard')).toBe(true);
    expect(isNavActive('/admin/products', '/admin/dashboard')).toBe(false);
  });

  it('rejects partial segment matches', () => {
    expect(isNavActive('/admin/productivity', '/admin/products')).toBe(false);
  });
});
