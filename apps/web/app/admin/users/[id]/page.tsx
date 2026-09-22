'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

import { changeUserRole, getAdminRoles, getAdminUserDetail, getSessionUser, isSuperAdminRole, type AdminRole, type AdminUserDetail } from '../../../../lib/admin-api';
import { AdminStatusBadge, formatAdminDate } from '../../../../components/admin';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { useToast } from '../../../../components/Toast';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Super-admin user detail: inspect roles and assign/revoke with explicit
 * confirmation. The backend rejects unknown roles, duplicates, missing
 * assignments, changes on deleted accounts, and self super-admin removal —
 * every outcome surfaces here without leaking internals.
 */
export default function AdminUserDetailPage({ params }: PageProps) {
  const router = useRouter();
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const [detail, roleList] = await Promise.all([getAdminUserDetail(id), getAdminRoles()]);
      setUser(detail);
      setRoles(roleList.roles);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let mounted = true;
    params.then(({ id }) => {
      if (mounted) {
        setUserId(id);
        load(id);
      }
    });
    return () => {
      mounted = false;
    };
  }, [params, allowed, load]);

  const handleRole = async (slug: string, action: 'assign' | 'revoke') => {
    if (!userId || busy) return;
    const confirmed = await confirm({
      title: `${action === 'assign' ? 'Assign' : 'Revoke'} the ${slug} role?`,
      description:
        action === 'assign'
          ? `This account will gain every capability of the ${slug} role. The change is audited.`
          : `This account will lose every capability of the ${slug} role. The change is audited.`,
      confirmLabel: action === 'assign' ? 'Assign role' : 'Revoke role',
      variant: action === 'assign' ? 'default' : 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await changeUserRole(userId, { role: slug, action });
      setUser((prev) => (prev ? { ...prev, roles: (updated.roles ?? []).map((s) => ({ id: s, name: s, slug: s })) } : prev));
      notify('success', `Role ${action === 'assign' ? 'assigned' : 'revoked'}.`);
      await load(userId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Role change failed';
      setError(message);
      notify('error', message);
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null || (loading && !user)) return <div className="empty-state"><p>Loading user…</p></div>;
  if ((error && !user) || !user) {
    return (
      <div className="empty-state">
        <h1>User not found</h1>
        {error ? <p>{error}</p> : null}
        <Link href={'/admin/users' as Route} className="button">Back to Users</Link>
      </div>
    );
  }

  const held = new Set(user.roles.map((r) => r.slug.toLowerCase()));

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <Link href={'/admin/users' as Route} className="text-button">← Back to Users</Link>
          <h1 style={{ marginTop: '0.5rem' }}>{user.firstName} {user.lastName}</h1>
          <p className="muted-copy">{user.email} • <AdminStatusBadge status={user.status} /></p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-section">
        <h2>Account</h2>
        <p>Phone: {user.phone ?? '—'} • Joined: {formatAdminDate(user.createdAt)} • Last login: {formatAdminDate(user.lastLoginAt)}</p>
        <p className="muted-copy">Role changes apply on the next request — the backend re-resolves permissions per call, so no stale privilege survives.</p>
      </section>

      <section className="account-section">
        <h2>Roles</h2>
        {roles.map((role) => {
          const has = held.has(role.slug.toLowerCase());
          return (
            <div key={role.id} className="account-summary-card">
              <p><strong>{role.name}</strong> <span className="muted-copy">({role.slug} • {role.memberCount} members)</span></p>
              <p className="muted-copy">{role.permissions.length > 0 ? role.permissions.join(', ') : 'No granular permissions attached'}</p>
              <div className="account-actions">
                {has ? (
                  <button type="button" className="button button--danger" disabled={busy} onClick={() => handleRole(role.slug, 'revoke')}>
                    Revoke
                  </button>
                ) : (
                  <button type="button" className="button button--secondary" disabled={busy} onClick={() => handleRole(role.slug, 'assign')}>
                    Assign
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
