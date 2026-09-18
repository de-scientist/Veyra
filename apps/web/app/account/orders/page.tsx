'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getOrders, type PaginatedOrders, type OrderSummary } from '../../../lib/shopping-api';
import { PriceDisplay } from '../../../components/PriceDisplay';

const STATUSES = ['All', 'PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'RETURNED'] as const;

export const metadata = { title: 'Orders | Veyra', robots: { index: false, follow: false } };

export default function OrdersPage() {
  const [data, setData] = useState<PaginatedOrders | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({
    page: 1,
    pageSize: 10,
    status: '',
    search: '',
  });

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getOrders(params);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setParams((prev) => ({ ...prev, page: 1, search: formData.get('search') as string }));
  };

  const handleStatusChange = (status: string) => {
    setParams((prev) => ({ ...prev, page: 1, status }));
  };

  const handlePageChange = (page: number) => {
    setParams((prev) => ({ ...prev, page }));
  };

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function StatusBadge({ status }: { status: string }) {
    const normalized = status.toLowerCase().replace(/_/g, ' ');
    const colors: Record<string, string> = {
      paid: '#1f6b45',
      completed: '#1f6b45',
      delivered: '#1f6b45',
      pending: '#7c5a45',
      confirmed: '#7c5a45',
      processing: '#7c5a45',
      unpaid: '#b84d4d',
      failed: '#b84d45',
      cancelled: '#b84d45',
      refunded: '#7c5a45',
      'partially refunded': '#7c5a45',
      unfulfilled: '#5f5a55',
      packed: '#7c5a45',
      shipped: '#7c5a45',
      'out for delivery': '#7c5a45',
      'delivery attempted': '#b84d45',
      'ready for pickup': '#7c5a45',
      'picked up': '#1f6b45',
      returned: '#5f5a55',
    };
    const color = colors[normalized] || '#5f5a55';
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
        {status.replace(/_/g, ' ')}
      </span>
    );
  }

  if (loading && !data) return <div className="empty-state"><p>Loading orders…</p></div>;
  if (error && !data) return <div className="empty-state"><h1>Unable to load orders</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Order History</h1>
        <p className="muted-copy">View and track your orders</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-filters">
        <form onSubmit={handleSearch} className="account-search">
          <label>
            <input
              type="search"
              name="search"
              placeholder="Search by order number…"
              value={params.search}
              onChange={(e) => setParams((prev) => ({ ...prev, search: e.target.value }))}
            />
          </label>
        </form>

        <div className="account-status-filters" role="group" aria-label="Filter by status">
          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`account-filter-chip ${params.status === status || (status === 'All' && !params.status) ? 'active' : ''}`}
              onClick={() => handleStatusChange(status === 'All' ? '' : status)}
            >
              {status}
            </button>
          ))}
        </div>
      </section>

      {loading && !data ? (
        <div className="empty-state"><p>Loading orders…</p></div>
      ) : data?.orders.length === 0 ? (
        <div className="empty-state">
          <h2>No orders found</h2>
          <p>{params.search || params.status ? 'Try adjusting your filters' : 'You haven\'t placed any orders yet.'}</p>
          {!params.search && !params.status && <Link href="/shop" className="button">Start Shopping</Link>}
        </div>
      ) : (
        <>
          <section className="account-orders-list">
            {data!.orders.map((order) => (
              <article key={order.orderNumber} className="account-order-card">
                <header className="account-order-card__header">
                  <div>
                    <Link href={`/account/orders/${order.orderNumber}`} className="account-order-link">
                      <strong>{order.orderNumber}</strong>
                    </Link>
                    <span className="account-order-date">{formatDate(order.createdAt)}</span>
                  </div>
                  <div className="account-order-card__totals">
                    <PriceDisplay price={order.grandTotal} />
                    <StatusBadge status={order.status} />
                  </div>
                </header>
                <div className="account-order-card__meta">
                  <div className="account-order-card__statuses">
                    <span><strong>Payment:</strong> {order.paymentStatus}</span>
                    <span><strong>Fulfillment:</strong> {order.fulfillmentStatus}</span>
                  </div>
                  <span className="account-order-card__count">{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</span>
                </div>
                <footer className="account-order-card__actions">
                  <Link href={`/account/orders/${order.orderNumber}`} className="text-button">View Details</Link>
                </footer>
              </article>
            ))}
          </section>

          {data!.pagination.totalPages > 1 && (
            <nav className="account-pagination" aria-label="Order pagination">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => handlePageChange(data!.pagination.page - 1)}
                disabled={data!.pagination.page === 1}
              >
                Previous
              </button>
              <span className="account-pagination-info">
                Page {data!.pagination.page} of {data!.pagination.totalPages} ({data!.pagination.total} orders)
              </span>
              <button
                type="button"
                className="button button--secondary"
                onClick={() => handlePageChange(data!.pagination.page + 1)}
                disabled={data!.pagination.page === data!.pagination.totalPages}
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}