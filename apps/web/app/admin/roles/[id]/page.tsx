'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import {
  deleteAdminRole,
  getAdminPermissions,
  getAdminRoles,
  getSessionUser,
  grantRolePermission,
  isSuperAdminRole,
  isSystemRole,
  revokeRolePermission,
  updateAdminRole,
  type AdminPermission,
  type AdminRole,
} from '../../../../lib/admin-api';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { useToast } from '../../../../components/Toast';

interface PageProps {
  // Next.js 14 (installed: 14.2.15): route params are synchronous.
  params: { id: string };
}

/**
 * Super-admin role detail: rename custom roles, grant/revoke permissions
 * grouped by functional area, delete empty custom roles. System roles render
 * read-only with their platform guarantee explained. Every mutation is
 * confirmed and the backend re-authorizes each request.
 */
export default function AdminRoleDetailPage({ params }: PageProps) {
  const routeId = params.id;
  const router = useRouter();
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [catalogue, setCatalogue] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [grant, setGrant] = useState('');

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

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [roleList, permissionList] = await Promise.all([getAdminRoles(), getAdminPermissions()]);
      const found = roleList.roles.find((entry) => entry.id === id) ?? null;
      setRole(found);
      if (found) setName(found.name);
      setCatalogue(permissionList.permissions);
      if (!found) setError('Role not found.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load role');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (allowed) load(routeId);
  }, [routeId, allowed, load]);

  const granted = useMemo(() => new Set((role?.permissions ?? []).map((slug) => slug.toLowerCase())), [role]);
  const grouped = useMemo(() => {
    const groups = new Map<string, AdminPermission[]>();
    for (const permission of catalogue) {
      const list = groups.get(permission.resource) ?? [];
      list.push(permission);
      groups.set(permission.resource, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalogue]);
  const ungranted = useMemo(() => catalogue.filter((permission) => !granted.has(permission.slug.toLowerCase())), [catalogue, granted]);

  const system = role ? isSystemRole(role.slug) : false;
  const superAdmin = role ? role.slug.toLowerCase() === 'super_admin' || role.slug.toLowerCase() === 'super-admin' : false;

  const handleRename = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!role || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await updateAdminRole(role.id, { name: name.trim() });
      setRole((prev) => (prev ? { ...prev, name: updated.name } : prev));
      notify('success', 'Role renamed.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Rename failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleGrant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!role || !grant || busy) return;
    const permission = catalogue.find((entry) => entry.slug === grant);
    const confirmed = await confirm({
      title: `Grant ${permission?.name ?? grant}?`,
      description: `Every account holding the ${role.name} role gains this capability on the next request. The backend re-resolves permissions per call.`,
      confirmLabel: 'Grant permission',
      variant: 'default',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await grantRolePermission(role.id, grant);
      setGrant('');
      notify('success', 'Permission granted.');
      await load(role.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Grant failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (permission: AdminPermission) => {
    if (!role || busy) return;
    const confirmed = await confirm({
      title: `Revoke ${permission.name}?`,
      description: `Every account holding the ${role.name} role loses this capability on the next request. Accounts with the same permission through another role keep it.`,
      confirmLabel: 'Revoke permission',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await revokeRolePermission(role.id, permission.slug);
      notify('success', 'Permission revoked.');
      await load(role.id);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Revoke failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!role || busy) return;
    const confirmed = await confirm({
      title: `Delete the ${role.name} role?`,
      description: `Only empty custom roles can be deleted. ${role.memberCount} account(s) currently hold this role.`,
      confirmLabel: 'Delete role',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await deleteAdminRole(role.id);
      notify('success', 'Role deleted.');
      router.replace('/admin/roles' as Route);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Role deletion failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null || (loading && !role)) return <div className="empty-state"><p>Loading role…</p></div>;
  if (!role) {
    return (
      <div className="empty-state">
        <h1>Role not found</h1>
        {error ? <p>{error}</p> : null}
        <Link href={'/admin/roles' as Route} className="button">Back to Roles</Link>
      </div>
    );
  }

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <Link href={'/admin/roles' as Route} className="text-button">← Back to Roles</Link>
          <h1 style={{ marginTop: '0.5rem' }}>{role.name}</h1>
          <p className="muted-copy">{role.slug} • {role.memberCount} member(s) • {system ? 'System role — protected' : 'Custom role'}</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      {system ? (
        <section className="account-section">
          <h2>Protection</h2>
          <p className="muted-copy">
            {superAdmin
              ? 'The super-administrator grant set is fixed by the platform (full access by code) and cannot be edited here.'
              : 'System roles cannot be renamed or deleted. Their permission grants can be adjusted below — every change applies on the next request.'}
          </p>
        </section>
      ) : (
        <section className="account-section" aria-label="Rename role">
          <h2>Rename role</h2>
          <p className="muted-copy">The slug (<strong>{role.slug}</strong>) is immutable so existing references never break.</p>
          <form className="account-search" onSubmit={handleRename}>
            <input type="text" value={name} onChange={(e) => setName(e.currentTarget.value)} aria-label="Role name" minLength={2} maxLength={80} required />
            <button type="submit" className="button button--secondary" disabled={busy}>Save name</button>
          </form>
        </section>
      )}

      <section className="account-section" aria-label="Permissions">
        <h2>Permissions ({role.permissions.length})</h2>
        {superAdmin ? (
          <p className="muted-copy">Super-administrators hold every permission by platform guarantee — the grant list below is informational.</p>
        ) : null}
        {grouped.length === 0 ? (
          <p className="muted-copy">No permissions are defined yet.</p>
        ) : (
          grouped.map(([resource, permissions]) => (
            <div key={resource} className="account-summary-card">
              <p><strong>{resource}</strong></p>
              {permissions.map((permission) => {
                const has = granted.has(permission.slug.toLowerCase());
                return (
                  <p key={permission.slug}>
                    {permission.name} <span className="muted-copy">({permission.slug} • {permission.action})</span>
                    {' — '}
                    {has ? (
                      <>
                        <span>Granted</span>
                        {!superAdmin ? (
                          <>
                            {' • '}
                            <button type="button" className="text-button" disabled={busy} onClick={() => handleRevoke(permission)}>
                              Revoke
                            </button>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="muted-copy">Not granted</span>
                    )}
                  </p>
                );
              })}
            </div>
          ))
        )}
        {!superAdmin && ungranted.length > 0 ? (
          <form className="account-search" onSubmit={handleGrant}>
            <select value={grant} onChange={(e) => setGrant(e.currentTarget.value)} aria-label="Permission to grant" required>
              <option value="">Select a permission…</option>
              {ungranted.map((permission) => (
                <option key={permission.slug} value={permission.slug}>{permission.name} ({permission.slug})</option>
              ))}
            </select>
            <button type="submit" className="button button--secondary" disabled={busy || !grant}>Grant permission</button>
          </form>
        ) : null}
      </section>

      {!system ? (
        <section className="account-section" aria-label="Delete role">
          <h2>Delete role</h2>
          <p className="muted-copy">Only empty custom roles can be deleted — reassign every member first.</p>
          <button type="button" className="button button--danger" disabled={busy} onClick={handleDelete}>
            Delete role
          </button>
        </section>
      ) : null}
    </div>
  );
}
