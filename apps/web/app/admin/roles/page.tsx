'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { createAdminRole, deleteAdminRole, getAdminRoles, getSessionUser, isSuperAdminRole, isSystemRole, type AdminRole } from '../../../lib/admin-api';
import { AdminEmptyState } from '../../../components/admin';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';

/**
 * Super-admin role management (overview): every role with member counts and
 * permission grants, create/delete for custom roles, detail links for
 * permission grants. System roles are badged and never editable here.
 * Page-level gate mirrors the backend requireSuperAdmin guard.
 */
export default function AdminRolesPage() {
  const router = useRouter();
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);

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

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await createAdminRole({ name: name.trim(), slug: slug.trim().toLowerCase() });
      setName('');
      setSlug('');
      notify('success', 'Role created.');
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Role creation failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (role: AdminRole) => {
    if (busy) return;
    const confirmed = await confirm({
      title: `Delete the ${role.name} role?`,
      description: `Only empty custom roles can be deleted. ${role.memberCount} account(s) currently hold this role — deletion fails while any member remains.`,
      confirmLabel: 'Delete role',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAdminRole(role.id);
      notify('success', 'Role deleted.');
      await load();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Role deletion failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null || (loading && roles.length === 0)) return <div className="empty-state"><p>Loading roles…</p></div>;

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <h1>Roles</h1>
          <p className="muted-copy">Platform roles and their permission grants — assignment happens per user</p>
        </div>
        <Link href={'/admin/users' as Route} className="button button--secondary">Manage Users</Link>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-section" aria-label="Create role">
        <h2>Create custom role</h2>
        <p className="muted-copy">System roles (super admin, admin, staff, customer) are platform invariants and cannot be created here — slugs matching them are rejected.</p>
        <form className="account-search" onSubmit={handleCreate}>
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Role name, e.g. Support L1"
            aria-label="Role name"
            minLength={2}
            maxLength={80}
            required
          />
          <input
            type="text"
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.currentTarget.value)}
            placeholder="Slug, e.g. support_l1"
            aria-label="Role slug"
            minLength={2}
            maxLength={60}
            required
          />
          <button type="submit" className="button" disabled={busy}>Create role</button>
        </form>
      </section>

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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const system = isSystemRole(role.slug);
                return (
                  <tr key={role.id}>
                    <td>
                      <Link href={`/admin/roles/${role.id}` as Route} className="account-order-link"><strong>{role.name}</strong></Link>
                      <br />
                      <span className="muted-copy">{system ? 'System role — protected' : 'Custom role'}</span>
                    </td>
                    <td>{role.slug}</td>
                    <td>{role.memberCount}</td>
                    <td>{role.permissions.length > 0 ? role.permissions.join(', ') : <span className="muted-copy">—</span>}</td>
                    <td>
                      <Link href={`/admin/roles/${role.id}` as Route} className="text-button">Manage</Link>
                      {!system ? (
                        <>
                          {' • '}
                          <button type="button" className="text-button" disabled={busy} onClick={() => handleDelete(role)}>
                            Delete
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
