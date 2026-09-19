'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type CustomerNotification,
  type PaginatedNotifications,
} from '../../../lib/shopping-api';

const CATEGORIES = ['All', 'TRANSACTIONAL', 'SECURITY', 'MARKETING'] as const;

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    TRANSACTIONAL: '#1f6b45',
    SECURITY: '#b84d45',
    MARKETING: '#7c5a45',
  };
  const color = colors[category] || '#5f5a55';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: `${color}15`,
        color,
      }}
    >
      {category.toLowerCase()}
    </span>
  );
}

export default function NotificationsPage() {
  const [data, setData] = useState<PaginatedNotifications | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, category: '', unreadOnly: false });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getNotifications({
        page: params.page,
        pageSize: params.pageSize,
        category: params.category || undefined,
        unreadOnly: params.unreadOnly || undefined,
      });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const handleMarkRead = async (notification: CustomerNotification) => {
    if (notification.readAt) return;
    try {
      await markNotificationRead(notification.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark notification as read');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const result = await markAllNotificationsRead();
      setActionMessage(`${result.marked} notification(s) marked as read`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not mark notifications as read');
    }
  };

  if (loading && !data) return <div className="empty-state"><p>Loading notifications…</p></div>;
  if (error && !data) return <div className="empty-state"><h1>Unable to load notifications</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Notifications</h1>
          <p className="muted-copy">
            {data ? `${data.unreadCount} unread` : 'Your updates from JB'}
          </p>
        </div>
        <div className="account-page__actions">
          <button type="button" className="button button--secondary" onClick={handleMarkAllRead} disabled={!data || data.unreadCount === 0}>
            Mark all as read
          </button>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {actionMessage && <div className="success-message" role="status">{actionMessage}</div>}

      <section className="account-filters">
        <div className="account-status-filters" role="group" aria-label="Filter by category">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              className={`account-filter-chip ${params.category === category || (category === 'All' && !params.category) ? 'active' : ''}`}
              onClick={() => setParams((prev) => ({ ...prev, page: 1, category: category === 'All' ? '' : category }))}
              aria-pressed={params.category === category || (category === 'All' && !params.category)}
            >
              {category === 'All' ? 'All' : category.toLowerCase()}
            </button>
          ))}
        </div>
        <label className="account-unread-toggle">
          <input
            type="checkbox"
            checked={params.unreadOnly}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setParams((prev) => ({ ...prev, page: 1, unreadOnly: e.currentTarget.checked }))}
          />
          <span>Unread only</span>
        </label>
      </section>

      {!data || data.notifications.length === 0 ? (
        <div className="empty-state">
          <h2>No notifications</h2>
          <p>{params.category || params.unreadOnly ? 'Try adjusting your filters.' : 'Order, payment, delivery, return, and refund updates will appear here.'}</p>
          <Link href="/shop" className="button">Continue Shopping</Link>
        </div>
      ) : (
        <>
          <section className="account-notifications" aria-label="Notifications">
            {data.notifications.map((notification) => (
              <article key={notification.id} className={`account-notification-card ${notification.readAt ? 'read' : 'unread'}`}>
                <header className="account-notification-card__header">
                  <div>
                    {!notification.readAt && <span className="badge badge--current" aria-label="Unread">New</span>}
                    <strong>{notification.title}</strong>
                  </div>
                  <CategoryBadge category={notification.category} />
                </header>
                <p className="account-notification-card__body">{notification.body}</p>
                <div className="account-notification-card__meta">
                  <span className="muted-copy">{formatDateTime(notification.createdAt)}</span>
                  <span className="muted-copy">{notification.type.toLowerCase().replace(/_/g, ' ')}</span>
                </div>
                <footer className="account-notification-card__actions">
                  {notification.deepLink && (
                    <Link href={notification.deepLink as Route} className="text-button">
                      View details
                    </Link>
                  )}
                  {!notification.readAt && (
                    <button type="button" className="text-button" onClick={() => handleMarkRead(notification)}>
                      Mark as read
                    </button>
                  )}
                </footer>
              </article>
            ))}
          </section>

          {data.pagination.totalPages > 1 && (
            <nav className="account-pagination" aria-label="Notification pagination">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setParams((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={data.pagination.page === 1}
              >
                Previous
              </button>
              <span className="account-pagination-info">
                Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} notifications)
              </span>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => setParams((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={data.pagination.page === data.pagination.totalPages}
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
