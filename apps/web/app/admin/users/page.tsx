'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { getAdminUsers, getSessionUser, isSuperAdminRole, type AdminUser, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate } from '../../../components/admin';

const STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DELETED'];

/**
 * Super-admin user directory (Phase H): find any account for role
 * administration. Page-level gate mirrors the backend requireSuperAdmin
 * guard; the APIs re-authorize every request regardless.
 */
export default function AdminUsersPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', status: '', role: '' });

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
      const result = await getAdminUsers({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: params.status || undefined,
        role: params.role || undefined,
      });
      setUsers(result.users);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  if (allowed === null || (loading && users.length === 0)) return <div className="empty-state"><p>Loading users…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Users</h1>
          <p className="muted-copy">Super-admin directory — every role change is audited and guarded against self-lockout</p>
        </div>
        <Link href="/admin/roles" className="button button--secondary">View Roles</Link>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-filters">
        <form
          className="account-search"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setParams((prev) => ({ ...prev, page: 1, search: String(form.get('search') ?? '') }));
          }}
        >
          <input type="search" name="search" defaultValue={params.search} placeholder="Email or name…" aria-label="Search users" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Account status">
          {STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All'}
            </button>
          ))}
        </div>
        <label>
          <span className="muted-copy">Role</span>
          <select value={params.role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParams((prev) => ({ ...prev, page: 1, role: e.currentTarget.value }))}>
            <option value="">All roles</option>
            <option value="customer">Customer</option>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </select>
        </label>
      </section>

      {users.length === 0 ? (
        <AdminEmptyState title="No users" message="No accounts match the current filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.email}</strong></td>
                    <td>{user.firstName} {user.lastName}</td>
                    <td>{user.roles.join(', ') || '—'}</td>
                    <td><AdminStatusBadge status={user.status} /></td>
                    <td>{formatAdminDate(user.createdAt)}</td>
                    <td><Link href={`/admin/users/${user.id}`} className="text-button">Manage roles</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && <AdminPagination pagination={pagination} onPage={(page) => setParams((prev) => ({ ...prev, page }))} />}
        </>
      )}
    </div>
  );
}
