'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminCustomerDetail, updateAdminCustomer } from '../../../../lib/admin-api';
import { AdminStatusBadge, formatAdminDate, formatMoney } from '../../../../components/admin';

type Detail = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: string;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  addresses: Array<{ id: string; label: string | null; line1: string; city: string; country: string; isDefault: boolean }>;
  orders: Array<{ id: string; orderNumber: string; status: string; paymentStatus: string; fulfillmentStatus: string; grandTotal: number; currency: string; createdAt: string }>;
  returnRequests: Array<{ id: string; returnNumber: string; status: string; type: string; requestedAt: string }>;
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminCustomerDetailPage({ params }: PageProps) {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string) => {
    try {
      const result = await getAdminCustomerDetail(id);
      setCustomer(result as unknown as Detail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customer');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    params.then(({ id }) => {
      if (mounted) {
        setCustomerId(id);
        load(id);
      }
    });
    return () => {
      mounted = false;
    };
  }, [params, load]);

  const handleStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    if (!customerId) return;
    if (!window.confirm(`Set this customer to ${status}?`)) return;
    try {
      await updateAdminCustomer(customerId, { status });
      setMessage(`Customer ${status === 'ACTIVE' ? 'reactivated' : 'suspended'}. Change audited.`);
      await load(customerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  if (loading) return <div className="empty-state"><p>Loading customer…</p></div>;
  if (error && !customer) return <div className="empty-state"><h1>Customer not found</h1><p>{error}</p><Link href="/admin/customers" className="button">Back to Customers</Link></div>;
  if (!customer) return <div className="empty-state"><h1>Customer not found</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/admin/customers" className="text-button">← Back to Customers</Link>
          <h1 style={{ marginTop: '0.5rem' }}>{customer.firstName} {customer.lastName}</h1>
          <p className="muted-copy">{customer.email} • <AdminStatusBadge status={customer.status} /></p>
        </div>
        <div className="account-page__actions">
          {customer.status === 'SUSPENDED' ? (
            <button type="button" className="button button--secondary" onClick={() => handleStatus('ACTIVE')}>Reactivate</button>
          ) : (
            <button type="button" className="button button--danger" onClick={() => handleStatus('SUSPENDED')}>Suspend</button>
          )}
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}

      <section className="account-section">
        <h2>Profile</h2>
        <p>Phone: {customer.phone ?? '—'} • Joined: {formatAdminDate(customer.createdAt)} • Last login: {formatAdminDate(customer.lastLoginAt)}</p>
        <p className="muted-copy">Email verified: {customer.emailVerifiedAt ? 'yes' : 'no'}</p>
      </section>

      <section className="account-section">
        <h2>Addresses ({customer.addresses.length})</h2>
        {customer.addresses.map((address) => (
          <p key={address.id}>{address.label ? `${address.label}: ` : ''}{address.line1}, {address.city}, {address.country}{address.isDefault ? ' (default)' : ''}</p>
        ))}
      </section>

      <section className="account-section">
        <h2>Orders ({customer.orders.length} recent)</h2>
        {customer.orders.map((order) => (
          <p key={order.id}>
            <Link href={`/admin/orders/${order.orderNumber}`} className="account-order-link"><strong>{order.orderNumber}</strong></Link>
            {' '}— <AdminStatusBadge status={order.status} /> <AdminStatusBadge status={order.paymentStatus} /> {formatMoney(order.grandTotal, order.currency)}
          </p>
        ))}
      </section>

      <section className="account-section">
        <h2>Returns</h2>
        {customer.returnRequests.length === 0 && <p className="muted-copy">No returns.</p>}
        {customer.returnRequests.map((ret) => (
          <p key={ret.id}>{ret.returnNumber} — <AdminStatusBadge status={ret.status} /></p>
        ))}
      </section>
    </div>
  );
}
