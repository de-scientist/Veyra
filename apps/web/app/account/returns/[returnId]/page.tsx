'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountReturnDetail, type AccountReturn } from '../../../../lib/shopping-api';
import { PriceDisplay } from '../../../../components/PriceDisplay';

interface ReturnDetailPageProps {
  params: Promise<{ returnId: string }>;
}

export default function AccountReturnDetailPage({ params }: ReturnDetailPageProps) {
  const [ret, setRet] = useState<AccountReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    params
      .then(({ returnId }) => getAccountReturnDetail(returnId))
      .then((r) => {
        if (mounted) setRet(r);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load return request');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [params]);

  if (loading) return <div className="empty-state"><p>Loading return…</p></div>;
  if (error) return <div className="empty-state"><h1>Return not found</h1><p>{error}</p><Link href="/account/returns" className="button">Back to Returns</Link></div>;
  if (!ret) return <div className="empty-state"><h1>Return not found</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/account/returns" className="text-button">← Back to Returns</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Return {ret.returnNumber}</h1>
          <p className="muted-copy">
            Order <Link href={`/account/orders/${ret.orderNumber}`} className="account-order-link">{ret.orderNumber}</Link>
            {' • '}Requested {new Date(ret.requestedAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'short', day: 'numeric' })}
          </p>
        </div>
      </header>

      <section className="account-section">
        <h2>Status</h2>
        <p>
          <strong>Type:</strong> {ret.type.replace(/_/g, ' ')} • <strong>Status:</strong> {ret.status.replace(/_/g, ' ')}
        </p>
        <p className="muted-copy"><strong>Reason:</strong> {ret.reason}</p>
        {ret.customerNote && <p className="muted-copy"><strong>Note:</strong> {ret.customerNote}</p>}
      </section>

      <section className="account-section">
        <h2>Items ({ret.items.length})</h2>
        <ul className="account-return-items-list">
          {ret.items.map((item) => (
            <li key={item.id}>
              {item.productName} ({item.sku}) × {item.quantity} — {item.reason}
              {item.condition && <span> • Condition: {item.condition}</span>}
              {item.disposition && <span> • Disposition: {item.disposition}</span>}
              {item.refundAmount > 0 && <span> • Refund: <PriceDisplay price={item.refundAmount} /></span>}
            </li>
          ))}
        </ul>
      </section>

      {ret.exchange && (
        <section className="account-section">
          <h2>Exchange</h2>
          <p>Status: {ret.exchange.status.replace(/_/g, ' ')} • Quantity: {ret.exchange.quantity}</p>
        </section>
      )}

      {ret.refund && (
        <section className="account-section">
          <h2>Refund</h2>
          <p>
            {ret.refund.refundNumber} — <PriceDisplay price={ret.refund.amount} /> {ret.refund.currency} • {ret.refund.status}
            {ret.refund.providerReference && <span> • Ref: {ret.refund.providerReference}</span>}
          </p>
        </section>
      )}

      <section className="account-section">
        <h2>History</h2>
        <ol className="account-timeline">
          {ret.history.map((h, i) => (
            <li key={i} className="account-timeline__event">
              <span>{h.fromStatus ? `${h.fromStatus.replace(/_/g, ' ')} → ` : ''}{h.toStatus.replace(/_/g, ' ')}</span>
              {h.note && <span className="muted-copy"> — {h.note}</span>}
              <span className="muted-copy"> ({new Date(h.createdAt).toLocaleDateString('en-KE')})</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
