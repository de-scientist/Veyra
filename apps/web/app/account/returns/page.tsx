'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccountReturns, type AccountReturn } from '../../../lib/shopping-api';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { StatusBadge } from '../../../components/jb-ui';

export default function ReturnsPage() {
  const [returns, setReturns] = useState<AccountReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    getAccountReturns()
      .then((r: AccountReturn[]) => { if (mounted) setReturns(r); })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load returns'); })
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

  if (loading) return <div className="empty-state"><p>Loading returns…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load returns</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Returns & Exchanges</h1>
        <p className="muted-copy">View and manage your return requests</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      {returns.length === 0 ? (
        <div className="empty-state">
          <h2>No return requests</h2>
          <p>When you request a return or exchange, it will appear here</p>
        </div>
      ) : (
        <section className="account-returns">
          {returns.map((ret) => (
            <article key={ret.id} className="account-return-card">
              <header className="account-return-card__header">
                <div>
                  <Link href={`/account/returns/${ret.id}`} className="account-order-link">
                    <strong>{ret.returnNumber}</strong>
                  </Link>
                  <span className="account-return-date">Order {ret.orderNumber} • {formatDate(ret.requestedAt)}</span>
                </div>
                <div className="account-return-card__type">
                  <StatusBadge status={ret.type} />
                  <StatusBadge status={ret.status} />
                </div>
              </header>

              <div className="account-return-card__details">
                <div><strong>Reason:</strong> {ret.reason}</div>
                {ret.customerNote && <div><strong>Note:</strong> {ret.customerNote}</div>}
                <div><strong>Items:</strong> {ret.items.length} item(s)</div>
                <div><strong>Refund Amount:</strong> {ret.items.reduce((sum, i) => sum + i.refundAmount, 0) > 0 ? <PriceDisplay price={ret.items.reduce((sum, i) => sum + i.refundAmount, 0)} /> : <span className="muted-copy">To be determined</span>}</div>
              </div>

              {ret.items.length > 0 && (
                <details className="account-return-items">
                  <summary>Items ({ret.items.length})</summary>
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
                </details>
              )}

              {ret.exchange && (
                <div className="account-return-exchange">
                  <strong>Exchange:</strong> {ret.exchange.status.replace(/_/g, ' ')} for variant {ret.exchange.replacementVariantId} (×{ret.exchange.quantity})
                </div>
              )}

              {ret.refund && (
                <div className="account-return-refund">
                  <strong>Refund:</strong> {ret.refund.status} — <PriceDisplay price={ret.refund.amount} />
                  {ret.refund.providerReference && <span> • Ref: {ret.refund.providerReference}</span>}
                </div>
              )}

              <div className="account-return-history">
                <strong>History:</strong>
                <ul>
                  {ret.history.map((h, i) => (
                    <li key={i}>
                      {h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}
                      {h.note && ` — ${h.note}`}
                      <span className="muted-copy"> ({formatDate(h.createdAt)})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}