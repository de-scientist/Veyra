'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminCustomers, type AdminCustomer, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate } from '../../../components/admin';

const STATUSES = ['', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'DELETED'];

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminCustomers({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, status: params.status || undefined });
      setCustomers(result.customers);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && customers.length === 0) return <div className="empty-state"><p>Loading customers…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Customers</h1>
          <p className="muted-copy">Customer directory — minimized to support-relevant data</p>
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
          <input type="search" name="search" defaultValue={params.search} placeholder="Name, email, or phone…" aria-label="Search customers" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Account status">
          {STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All'}
            </button>
          ))}
        </div>
      </section>

      {customers.length === 0 ? (
        <AdminEmptyState title="No customers" message="No customers match the current filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Orders</th>
                  <th>Status</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td><Link href={`/admin/customers/${customer.id}`} className="account-order-link"><strong>{customer.firstName} {customer.lastName}</strong></Link><br /><span className="muted-copy">{customer.email}</span></td>
                    <td>{customer.phone ?? '—'}</td>
                    <td>{customer.orderCount}</td>
                    <td><AdminStatusBadge status={customer.status} /></td>
                    <td>{formatAdminDate(customer.createdAt)}</td>
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
