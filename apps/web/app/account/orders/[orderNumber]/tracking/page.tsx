'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getOrderTracking } from '../../../../../lib/shopping-api';
import { StatusBadge } from '../../../../../components/jb-ui';

interface TrackingPageProps {
  // Next.js 14 (installed: 14.2.15): route params are synchronous.
  params: { orderNumber: string };
}

export default function TrackingPage({ params }: TrackingPageProps) {
  const routeOrderNumber = params.orderNumber;
  const [data, setData] = useState<{
    orderNumber: string;
    status: string;
    fulfillmentStatus: string;
    trackingNumber: string | null;
    internalReference: string | null;
    courierProvider: string | null;
    method: { name: string; type: string } | null;
    zone: { code: string; name: string } | null;
    estimatedDeliveryAt: string | null;
    shippedAt: string | null;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    history: Array<{ fromStatus: string | null; toStatus: string; note: string | null; createdAt: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    // Next.js 14: params is a synchronous object — never a Promise.
    getOrderTracking(routeOrderNumber)
      .then((d) => { if (mounted) setData(d); })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load tracking'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [routeOrderNumber]);

  function formatDate(dateString: string | null) {
    if (!dateString) return '—';
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

  if (loading) return <div className="empty-state"><p>Loading tracking…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load tracking</h1><p>{error}</p><Link href="/account/orders" className="button">Back to Orders</Link></div>;
  if (!data) return <div className="empty-state"><h1>Tracking not found</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href={`/account/orders/${data.orderNumber}`} className="text-button">← Back to Order</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Track Order {data.orderNumber}</h1>
          <p className="muted-copy">Current status: <StatusBadge status={data.status} /></p>
        </div>
      </header>

      <section className="account-section account-tracking-header">
        <div className="account-tracking-status">
          <div className="account-tracking-status__main">
            <StatusBadge status={data.status} />
            <div>
              <strong>Order Status:</strong> {data.status.replace(/_/g, ' ')}
              <br />
              <strong>Fulfillment:</strong> {data.fulfillmentStatus.replace(/_/g, ' ')}
            </div>
          </div>
          {data.method && (
            <div className="account-tracking-method">
              <strong>Method:</strong> {data.method.name} ({data.method.type})
            </div>
          )}
        </div>

        {data.trackingNumber && (
          <div className="account-tracking-number">
            <strong>Tracking Number:</strong>
            <code>{data.trackingNumber}</code>
            {data.courierProvider && <span> via {data.courierProvider}</span>}
          </div>
        )}

        <div className="account-tracking-dates">
          <div><strong>Estimated Delivery:</strong> {formatDate(data.estimatedDeliveryAt)}</div>
          <div><strong>Shipped:</strong> {formatDateTime(data.shippedAt)}</div>
          {data.pickedUpAt && <div><strong>Picked Up:</strong> {formatDateTime(data.pickedUpAt)}</div>}
          <div><strong>Delivered:</strong> {formatDateTime(data.deliveredAt)}</div>
        </div>
      </section>

      <section className="account-section">
        <h2>Tracking Timeline</h2>
        {data.history.length === 0 ? (
          <div className="empty-state">
            <p>Tracking information is not yet available.</p>
            <p className="muted-copy">Updates will appear here once the order ships.</p>
          </div>
        ) : (
          <div className="account-tracking-timeline">
            {data.history.map((event, idx) => (
              <div key={idx} className="account-tracking-event">
                <div className="account-tracking-event__marker" />
                <div className="account-tracking-event__content">
                  <div className="account-tracking-event__status">{event.toStatus.replace(/_/g, ' ')}</div>
                  <div className="account-tracking-event__time">{formatDateTime(event.createdAt)}</div>
                  {event.note && <div className="account-tracking-event__note">{event.note}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Link href={`/account/orders/${data.orderNumber}`} className="text-button">← Back to Order Details</Link>
    </div>
  );
}