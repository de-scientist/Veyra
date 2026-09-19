'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getRefunds, type AccountRefund } from '../../../lib/shopping-api';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { StatusBadge } from '../../../components/jb-ui';

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<AccountRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getRefunds()
      .then((r) => { if (mounted) setRefunds(r); })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load refunds'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

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

  if (loading) return <div className="empty-state"><p>Loading refunds…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load refunds</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Refunds</h1>
        <p className="muted-copy">View refund status for your orders</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      {refunds.length === 0 ? (
        <div className="empty-state">
          <h2>No refunds</h2>
          <p>Refunds will appear here when processed</p>
        </div>
      ) : (
        <section className="account-refunds">
          {refunds.map((refund) => (
            <article key={refund.id} className="account-refund-card">
              <header className="account-refund-card__header">
                <div>
                  <Link href={`/account/orders/${refund.orderNumber}`} className="account-order-link">
                    <strong>Order {refund.orderNumber}</strong>
                  </Link>
                  <span className="account-refund-date">{formatDate(refund.requestedAt)}</span>
                </div>
                <div className="account-refund-card__status">
                  <PriceDisplay price={refund.amount} />
                  <StatusBadge status={refund.status} />
                </div>
              </header>

              <div className="account-refund-card__details">
                <div><strong>Refund #:</strong> {refund.refundNumber}</div>
                <div><strong>Reason:</strong> {refund.reason}</div>
                <div><strong>Provider:</strong> {refund.provider}</div>
                {refund.providerReference && <div><strong>Provider Ref:</strong> {refund.providerReference}</div>}
                {refund.processedAt && <div><strong>Processed:</strong> {formatDateTime(refund.processedAt)}</div>}
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}