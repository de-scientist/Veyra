'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminPayments, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate, formatMoney } from '../../../components/admin';

const STATUSES = ['', 'UNPAID', 'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'];

type PaymentRow = {
  id: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  providerReference: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  order: { orderNumber: string; userId: string | null };
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', status: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminPayments({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, status: params.status || undefined });
      setPayments(result.payments as unknown as PaymentRow[]);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && payments.length === 0) return <div className="empty-state"><p>Loading payments…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Payments</h1>
          <p className="muted-copy">Read-only payment visibility. Payment state changes only through verified provider callbacks or audited refund flows.</p>
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
          <input type="search" name="search" defaultValue={params.search} placeholder="Order number or provider reference…" aria-label="Search payments" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Payment status">
          {STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All'}
            </button>
          ))}
        </div>
      </section>

      {payments.length === 0 ? (
        <AdminEmptyState title="No payments" message="No payments match the current filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Provider</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Reference</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td><Link href={`/admin/orders/${payment.order.orderNumber}`} className="account-order-link"><strong>{payment.order.orderNumber}</strong></Link></td>
                    <td>{payment.provider}</td>
                    <td>{formatMoney(payment.amount, payment.currency)}</td>
                    <td><AdminStatusBadge status={payment.status} /></td>
                    <td>{payment.providerReference ?? '—'}{payment.failureReason ? <><br /><span className="muted-copy">{payment.failureReason}</span></> : null}</td>
                    <td>{formatAdminDate(payment.createdAt)}</td>
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
