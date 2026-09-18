'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { getAdminOrders, type AdminOrderSummary, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate, formatMoney } from '../../../components/admin';

const STATUSES = ['', 'PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED'];
const PAYMENT_STATUSES = ['', 'UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];
const FULFILLMENT_STATUSES = ['', 'UNFULFILLED', 'PROCESSING', 'PACKED', 'SHIPPED', 'DELIVERED', 'RETURNED'];

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<AdminOrderSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({
    page: 1,
    pageSize: 20,
    search: '',
    status: searchParams.get('status') ?? '',
    paymentStatus: searchParams.get('paymentStatus') ?? '',
    fulfillmentStatus: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminOrders({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search || undefined,
        status: params.status || undefined,
        paymentStatus: params.paymentStatus || undefined,
        fulfillmentStatus: params.fulfillmentStatus || undefined,
      });
      setOrders(result.orders);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && orders.length === 0) return <div className="empty-state"><p>Loading orders…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Orders</h1>
          <p className="muted-copy">Search and operate on all orders</p>
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
          <label>
            <span className="muted-copy">Order number, customer name, email, or phone</span>
            <input type="search" name="search" defaultValue={params.search} placeholder="ORD-…, name, email, phone" />
          </label>
        </form>
        <div className="account-status-filters" role="group" aria-label="Order status">
          {STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All statuses'}
            </button>
          ))}
        </div>
        <div className="account-status-filters" role="group" aria-label="Payment status">
          {PAYMENT_STATUSES.map((status) => (
            <button key={status || 'all-pay'} type="button" className={`account-filter-chip ${params.paymentStatus === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, paymentStatus: status }))}>
              {status || 'Any payment'}
            </button>
          ))}
        </div>
        <div className="account-status-filters" role="group" aria-label="Fulfillment status">
          {FULFILLMENT_STATUSES.map((status) => (
            <button key={status || 'all-ful'} type="button" className={`account-filter-chip ${params.fulfillmentStatus === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, fulfillmentStatus: status }))}>
              {status || 'Any fulfillment'}
            </button>
          ))}
        </div>
      </section>

      {orders.length === 0 ? (
        <AdminEmptyState title="No orders found" message="Try adjusting search or filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Order</th>
                  <th>Payment</th>
                  <th>Fulfillment</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td><Link href={`/admin/orders/${order.orderNumber}`} className="account-order-link"><strong>{order.orderNumber}</strong></Link><br /><span className="muted-copy">{order.itemCount} items</span></td>
                    <td>{order.customerName ?? '—'}<br /><span className="muted-copy">{order.customerEmail ?? ''}</span></td>
                    <td>{formatMoney(order.grandTotal, order.currency)}</td>
                    <td><AdminStatusBadge status={order.status} /></td>
                    <td><AdminStatusBadge status={order.paymentStatus} /></td>
                    <td><AdminStatusBadge status={order.fulfillmentStatus} /></td>
                    <td>{formatAdminDate(order.createdAt)}</td>
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
