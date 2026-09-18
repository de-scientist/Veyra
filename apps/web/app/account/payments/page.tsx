'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPayments, type AccountPayment } from '../../../lib/shopping-api';
import { PriceDisplay } from '../../../components/PriceDisplay';

export default function PaymentsPage() {
  const [payments, setPayments] = useState<AccountPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getPayments()
      .then((p) => { if (mounted) setPayments(p); })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load payments'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  function formatDateTime(dateString: string | null) {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function StatusBadge({ status }: { status: string }) {
    const normalized = status.toLowerCase().replace(/_/g, ' ');
    const colors: Record<string, string> = {
      paid: '#1f6b45',
      completed: '#1f6b45',
      pending: '#7c5a45',
      unpaid: '#b84d4d',
      failed: '#b84d45',
      refunded: '#7c5a45',
      'partially refunded': '#7c5a45',
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

  if (loading) return <div className="empty-state"><p>Loading payment history…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load payments</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Payment History</h1>
        <p className="muted-copy">View all payment attempts for your orders</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      {payments.length === 0 ? (
        <div className="empty-state">
          <h2>No payments found</h2>
          <p>Your payment history will appear here after you place an order</p>
        </div>
      ) : (
        <section className="account-payments">
          {payments.map((payment) => (
            <article key={payment.id} className="account-payment-card">
              <header className="account-payment-card__header">
                <div>
                  <Link href={`/account/orders/${payment.orderNumber}`} className="account-order-link">
                    <strong>Order {payment.orderNumber}</strong>
                  </Link>
                  <span className="account-payment-date">{formatDateTime(payment.createdAt)}</span>
                </div>
                <div className="account-payment-card__status">
                  <PriceDisplay price={payment.amount} />
                  <StatusBadge status={payment.status} />
                </div>
              </header>

              <div className="account-payment-card__details">
                <div><strong>Provider:</strong> {payment.provider}</div>
                <div><strong>Status:</strong> <StatusBadge status={payment.status} /></div>
                {payment.providerReference && <div><strong>Reference:</strong> {payment.providerReference}</div>}
                {payment.paidAt && <div><strong>Paid:</strong> {formatDateTime(payment.paidAt)}</div>}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}