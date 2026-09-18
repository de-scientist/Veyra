'use client';

import { useEffect, useState } from 'react';

import { getAdminDashboard, type AdminDashboard } from '../../lib/admin-api';
import { AdminStatCard } from '../../components/admin';

export default function AdminDashboardPage() {
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAdminDashboard()
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="empty-state"><p>Loading operations overview…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load dashboard</h1><p>{error}</p></div>;
  if (!data) return <div className="empty-state"><h1>No dashboard data</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Operations Dashboard</h1>
          <p className="muted-copy">Live state from orders, payments, fulfillment, returns, and inventory</p>
        </div>
      </header>

      <section className="account-section" aria-label="Needs attention">
        <h2>Needs Attention</h2>
        <div className="account-summary-grid">
          <AdminStatCard label="Pending Payments" value={data.needsAttention.pendingPayments} href="/admin/orders?paymentStatus=UNPAID" />
          <AdminStatCard label="Unfulfilled Paid Orders" value={data.needsAttention.unfulfilledPaidOrders} href="/admin/fulfillment" />
          <AdminStatCard label="Failed Deliveries" value={data.needsAttention.failedDeliveries} href="/admin/fulfillment" />
          <AdminStatCard label="Returns Awaiting Review" value={data.needsAttention.returnsAwaitingReview} href="/admin/returns" />
          <AdminStatCard label="Refunds Awaiting Action" value={data.needsAttention.refundsAwaitingAction} href="/admin/returns" />
          <AdminStatCard label="Low-Stock Variants" value={data.needsAttention.lowStockVariants} href="/admin/inventory?lowStock=true" />
        </div>
      </section>

      <section className="account-section" aria-label="Commerce overview">
        <h2>Commerce</h2>
        <div className="account-summary-grid">
          <AdminStatCard label="Orders Today" value={data.commerce.ordersToday} href="/admin/orders" />
          <AdminStatCard label="Orders (7 Days)" value={data.commerce.ordersWeek} href="/admin/orders" />
          <AdminStatCard label="Paid Orders" value={data.commerce.paidOrders} href="/admin/orders?paymentStatus=PAID" hint={`${data.commerce.currency} ${data.commerce.paidOrderValue.toLocaleString('en-KE')} paid order value`} />
          <AdminStatCard label="Cancelled Orders" value={data.commerce.cancelledOrders} href="/admin/orders?status=CANCELLED" />
        </div>
        <p className="muted-copy">Paid order value is the sum of non-cancelled paid order totals — an operational figure, not audited revenue.</p>
      </section>

      <section className="account-section" aria-label="Operations">
        <h2>Operations</h2>
        <div className="account-summary-grid">
          <AdminStatCard label="Failed Payments" value={data.operations.failedPayments} href="/admin/orders?paymentStatus=FAILED" />
          <AdminStatCard label="Pending Returns" value={data.operations.pendingReturns} href="/admin/returns" />
          <AdminStatCard label="Pending Refunds" value={data.operations.pendingRefunds} href="/admin/returns" />
        </div>
      </section>

      <section className="account-section" aria-label="Inventory">
        <h2>Inventory</h2>
        <div className="account-summary-grid">
          <AdminStatCard label="Active Products" value={data.inventory.activeProducts} href="/admin/products" />
          <AdminStatCard label="Active Variants" value={data.inventory.activeVariants} href="/admin/inventory" />
          <AdminStatCard label="Out of Stock" value={data.inventory.outOfStockVariants} href="/admin/inventory?outOfStock=true" />
          <AdminStatCard label="Active Reservations" value={data.inventory.activeReservations} href="/admin/inventory" />
        </div>
      </section>

      <section className="account-section" aria-label="Customers">
        <h2>Customers</h2>
        <div className="account-summary-grid">
          <AdminStatCard label="Registered Customers" value={data.customers.registeredCustomers} href="/admin/customers" />
          <AdminStatCard label="Guest Orders" value={data.customers.guestOrders} href="/admin/orders" />
        </div>
      </section>
    </div>
  );
}
