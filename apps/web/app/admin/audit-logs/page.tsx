'use client';

import { useCallback, useEffect, useState } from 'react';

import { getAuditLogs, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate } from '../../../components/admin';

type AuditRow = {
  id: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  createdAt: string;
  actor: { id: string; email: string; firstName: string; lastName: string } | null;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', action: '', entity: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAuditLogs({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, action: params.action || undefined, entity: params.entity || undefined });
      setLogs(result.logs);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && logs.length === 0) return <div className="empty-state"><p>Loading audit logs…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Audit Logs</h1>
          <p className="muted-copy">Append-only record of sensitive operations</p>
        </div>
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
          <input type="search" name="search" defaultValue={params.search} placeholder="Entity or entity ID…" aria-label="Search audit logs" />
        </form>
        <label>
          <span className="muted-copy">Entity</span>
          <input type="text" value={params.entity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams((prev) => ({ ...prev, page: 1, entity: e.currentTarget.value }))} placeholder="Product, Order, …" />
        </label>
        <label>
          <span className="muted-copy">Action</span>
          <input type="text" value={params.action} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams((prev) => ({ ...prev, page: 1, action: e.currentTarget.value }))} placeholder="PRICE_CHANGED, …" />
        </label>
      </section>

      {logs.length === 0 ? (
        <AdminEmptyState title="No audit records" message="No audit records match the current filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{formatAdminDate(log.createdAt)}</td>
                    <td><AdminStatusBadge status={log.action} /></td>
                    <td>{log.entity}<br /><span className="muted-copy">{log.entityId.slice(0, 8)}…</span></td>
                    <td>{log.actor ? `${log.actor.firstName} ${log.actor.lastName}` : 'System'}<br /><span className="muted-copy">{log.actor?.email ?? ''}</span></td>
                    <td>
                      {log.before != null || log.after != null ? (
                        <details>
                          <summary className="text-button" style={{ cursor: 'pointer' }}>Changes</summary>
                          <pre className="muted-copy" style={{ whiteSpace: 'pre-wrap', maxWidth: '32rem', marginTop: '0.5rem' }}>
                            {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="muted-copy">—</span>
                      )}
                    </td>
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
