'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminPayments, type Pagination } from '../../../lib/admin-api';
import { getManualPendingPayments, rejectManualPayment, verifyManualPayment, type ManualPendingItem } from '../../../lib/shopping-api';
import { JBConfirmDialog } from '../../../components/ConfirmDialog';
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
          <p className="muted-copy">Read-only payment visibility. Payment state changes only through verified provider callbacks, audited manual verification, or audited refund flows.</p>
        </div>
      </header>

      <ManualPaymentsQueue />

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

/**
 * Manual M-Pesa verification queue. Financial-role only (API-enforced);
 * every verify/reject is audit-logged server-side with the staff user and
 * timestamp. Duplicate transaction codes across orders are rejected by the
 * backend so one receipt can never pay twice.
 */
function ManualPaymentsQueue() {
  const [items, setItems] = useState<ManualPendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; orderNumber: string; reference: string | null } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ id: string; orderNumber: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getManualPendingPayments());
      setForbidden(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load manual payments';
      if (/permission|forbidden|unauthori/i.test(message)) setForbidden(true);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function doVerify() {
    if (!confirm) return;
    setBusyId(confirm.id);
    setError(null);
    try {
      await verifyManualPayment(confirm.id);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setBusyId(null);
    }
  }

  async function doReject() {
    if (!rejectTarget || rejectReason.trim().length < 3) {
      setError('Provide a rejection reason (at least 3 characters) so the customer knows what to fix.');
      return;
    }
    setBusyId(rejectTarget.id);
    setError(null);
    try {
      await rejectManualPayment(rejectTarget.id, rejectReason.trim());
      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  }

  if (forbidden) return null;

  return (
    <section aria-labelledby="manual-payments-heading" style={{ marginBottom: '2rem' }}>
      <h2 id="manual-payments-heading" style={{ margin: '0 0 0.25rem' }}>Manual M-Pesa payments pending verification</h2>
      <p className="muted-copy">Verify only after confirming the M-Pesa receipt. Verification marks the order PAID and is audit-logged with your account and timestamp.</p>
      {loading ? <p className="muted-copy" role="status">Loading manual payments…</p> : null}
      {error ? <div className="error-message" role="alert">{error}</div> : null}
      {!loading && items.length === 0 ? <p className="muted-copy">No manual payments awaiting verification.</p> : null}
      {items.length > 0 ? (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Transaction code</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><Link href={`/admin/orders/${item.orderNumber}`} className="account-order-link"><strong>{item.orderNumber}</strong></Link></td>
                  <td>{item.customerName ?? '—'}<br /><span className="muted-copy">{item.customerPhone ?? ''}</span></td>
                  <td>{formatMoney(item.amount, item.currency)}</td>
                  <td>{item.channel === 'POCHI' ? 'Pochi La Biashara' : 'M-Pesa Paybill'}</td>
                  <td><strong>{item.providerReference ?? '—'}</strong></td>
                  <td>{formatAdminDate(item.submittedAt)}</td>
                  <td>
                    <div className="cta-row" style={{ marginTop: 0 }}>
                      <button type="button" className="button button--small" disabled={busyId === item.id} onClick={() => setConfirm({ id: item.id, orderNumber: item.orderNumber, reference: item.providerReference })}>
                        {busyId === item.id ? 'Working…' : 'Verify payment'}
                      </button>
                      <button type="button" className="button button--small button--danger" disabled={busyId === item.id} onClick={() => setRejectTarget({ id: item.id, orderNumber: item.orderNumber })}>
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <JBConfirmDialog
        open={confirm !== null}
        title="Verify manual payment"
        description={confirm ? `Confirm that M-Pesa receipt ${confirm.reference ?? ''} for order ${confirm.orderNumber} was received for the full order amount. This marks the order PAID.` : ''}
        confirmLabel="Verify payment"
        variant="warning"
        loading={busyId !== null}
        error={error}
        onConfirm={doVerify}
        onCancel={() => setConfirm(null)}
      />

      <JBConfirmDialog
        open={rejectTarget !== null}
        title="Reject manual payment"
        description={rejectTarget ? `Reject the manual payment claim for order ${rejectTarget.orderNumber}. The customer can submit a corrected code.` : ''}
        confirmLabel="Reject payment"
        variant="destructive"
        loading={busyId !== null}
        error={error}
        onConfirm={doReject}
        onCancel={() => { setRejectTarget(null); setRejectReason(''); }}
      />
      {rejectTarget ? (
        <label style={{ display: 'grid', gap: '0.4rem', marginTop: '0.75rem', maxWidth: '32rem' }}>Rejection reason (shown to support staff)
          <input value={rejectReason} onChange={(e) => setRejectReason((e.target as unknown as { value: string }).value)} placeholder="e.g. Receipt not found for this amount" maxLength={500} />
        </label>
      ) : null}
    </section>
  );
}
