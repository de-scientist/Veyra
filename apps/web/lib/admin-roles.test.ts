import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Role-management UI contract (source-level, no router): the overview and
 * detail pages must expose super-admin-gated create/rename/grant/revoke/
 * delete flows with confirmation, and the API client must carry every
 * role-management call with credentials included.
 */

const overviewPath = resolve(process.cwd(), 'apps/web/app/admin/roles/page.tsx');
const detailPath = resolve(process.cwd(), 'apps/web/app/admin/roles/[id]/page.tsx');
const apiPath = resolve(process.cwd(), 'apps/web/lib/admin-api.ts');
const overviewSrc = readFileSync(overviewPath, 'utf8');
const detailSrc = readFileSync(detailPath, 'utf8');
const apiSrc = readFileSync(apiPath, 'utf8');

describe('role-management UI contract', () => {
  it('gates both pages on the super-admin session role', () => {
    for (const src of [overviewSrc, detailSrc]) {
      expect(src).toContain('isSuperAdminRole(session.roles)');
      expect(src).toContain('/admin/unauthorized');
    }
  });

  it('overview creates custom roles and deletes only empty ones with confirmation', () => {
    expect(overviewSrc).toContain('Create custom role');
    expect(overviewSrc).toContain('createAdminRole');
    expect(overviewSrc).toContain('isSystemRole');
    expect(overviewSrc).toContain('System role — protected');
    expect(overviewSrc).toContain('confirm(');
    expect(overviewSrc).toContain('deleteAdminRole');
  });

  it('detail renames, grants, and revokes with confirmed, audited messaging', () => {
    expect(detailSrc).toContain('updateAdminRole');
    expect(detailSrc).toContain('grantRolePermission');
    expect(detailSrc).toContain('revokeRolePermission');
    expect(detailSrc).toContain('confirm(');
    expect(detailSrc).toContain('notify(');
    expect(detailSrc).toContain('immutable');
  });

  it('client carries every role-management call over the cookie session', () => {
    for (const fn of [
      'getAdminPermissions',
      'createAdminRole',
      'updateAdminRole',
      'deleteAdminRole',
      'grantRolePermission',
      'revokeRolePermission',
    ]) {
      expect(apiSrc).toContain(`export function ${fn}`);
    }
    expect(apiSrc).toContain("credentials: 'include'");
  });
});
