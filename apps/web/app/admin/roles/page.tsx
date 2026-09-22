'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { getAdminRoles, getSessionUser, isSuperAdminRole, type AdminRole } from '../../../lib/admin-api';
import { AdminEmptyState } from '../../../components/admin';

/**
 * Super-admin role matrix (Phase H): every role with member counts and the
 * permission slugs attached to it. Read-only — roles and permissions are
 * seeded platform concepts; assignment happens per-user under Users.
 * Page-level gate mirrors the backend requireSuperAdmin guard.
 */
export default function AdminRolesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getSessionUser()
      .then((session) => {
        if (!mounted) return;
        if (!isSuperAdminRole(session.roles)) {
          router.replace('/admin/unauthorized');
          return;
        }
        setAllowed(true);
      })
      .catch(() => {
        if (mounted) router.replace('/admin/unauthorized');
      });
    return () => {
      mounted = false;
    };
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminRoles();
      setRoles(result.roles);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (allowed === null || (loading && roles.length === 0)) return <div className="empty-state"><p>Loading roles…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Roles</h1>
          <p className="muted-copy">Platform roles and their permission grants — assignment happens per user</p>
        </div>
        <Link href="/admin/users" className="button button--secondary">Manage Users</Link>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      {roles.length === 0 ? (
        <AdminEmptyState title="No roles" message="No roles are defined." />
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Slug</th>
                <th>Members</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id}>
                  <td><strong>{role.name}</strong></td>
                  <td>{role.slug}</td>
                  <td>{role.memberCount}</td>
                  <td>{role.permissions.length > 0 ? role.permissions.join(', ') : <span className="muted-copy">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
