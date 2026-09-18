'use client';

import { useCallback, useEffect, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type DeliveryRow = {
  id: string;
  notificationId: string;
  channel: string;
  provider: string;
  status: string;
  providerMessageId: string | null;
  attemptCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  failureCode: string | null;
  createdAt: string;
  notification: { id: string; userId: string; type: string; title: string; createdAt: string };
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...init?.headers } });
  const body = (await response.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(body?.error?.message ?? 'Request failed');
  return body?.data as T;
}

export function NotificationsQueueClient() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const result = await api<{ deliveries: DeliveryRow[] }>(`/admin/notifications?${params.toString()}`);
      setRows(result.deliveries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const handleProcess = async () => {
    setError(null);
    try {
      const result = await api<{ processed: number; failed: number }>('/admin/notifications/process', { method: 'POST' });
      setMessage(`Worker ran: ${result.processed} processed, ${result.failed} failed`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Worker trigger failed');
    }
  };

  const handleResend = async (id: string) => {
    setError(null);
    try {
      await api(`/admin/notifications/${id}/resend`, { method: 'POST' });
      setMessage('Delivery queued for resend');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resend failed');
    }
  };

  return (
    <div className="admin-page">
      <header className="admin-page__header">
        <div>
          <h1>Notifications</h1>
          <p className="muted-copy">Delivery status across in-app, email, and SMS channels</p>
        </div>
        <div className="admin-page__actions">
          <label>
            <span className="muted-copy">Status</span>
            <select value={status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatus(e.currentTarget.value)}>
              <option value="">All</option>
              <option value="QUEUED">Queued</option>
              <option value="PROCESSING">Processing</option>
              <option value="SENT">Sent</option>
              <option value="DELIVERED">Delivered</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
          <button type="button" className="button button--secondary" onClick={handleProcess}>Run worker</button>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}

      {loading ? (
        <div className="empty-state"><p>Loading deliveries…</p></div>
      ) : rows.length === 0 ? (
        <div className="empty-state"><h2>No deliveries</h2><p>No delivery records match the current filter.</p></div>
      ) : (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Channel</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Title</th>
                <th>Failure</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString('en-KE')}</td>
                  <td>{row.channel}</td>
                  <td>{row.provider}</td>
                  <td>{row.status}</td>
                  <td>{row.attemptCount}</td>
                  <td>{row.notification.title}</td>
                  <td>{row.failureCode ?? '—'}</td>
                  <td>
                    {row.status === 'FAILED' && (
                      <button type="button" className="text-button" onClick={() => handleResend(row.id)}>Resend</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
