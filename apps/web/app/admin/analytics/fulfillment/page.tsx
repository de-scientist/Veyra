'use client';

import { useCallback, useEffect, useState } from 'react';

import { getFulfillmentAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, SectionError } from '../../../../components/analytics';

type Fulfillment = {
  status: Array<{ status: string; deliveries: number }>;
  durations: {
    paidToDelivered: { samples: number; averageHours: number | null };
    shippedToDelivered: { samples: number; averageHours: number | null };
    createdToShipped: { samples: number; averageHours: number | null };
  };
};

function hours(value: number | null): string {
  return value === null ? '—' : `${value.toLocaleString('en-KE')} h`;
}

export default function FulfillmentAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30' });
  const [data, setData] = useState<Fulfillment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getFulfillmentAnalytics(query)) as unknown as Fulfillment);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load fulfillment analytics');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Fulfillment Analytics</h1>
          <p className="muted-copy">Phase 8 states with timestamp-backed stage durations</p>
        </div>
      </header>

      <AnalyticsSubNav active="fulfillment" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading fulfillment…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Stage durations">
            <div className="account-summary-grid">
              <KpiCard label="Order → Shipped" value={hours(data.durations.createdToShipped.averageHours)} hint={`${data.durations.createdToShipped.samples} samples`} />
              <KpiCard label="Shipped → Delivered" value={hours(data.durations.shippedToDelivered.averageHours)} hint={`${data.durations.shippedToDelivered.samples} samples`} />
              <KpiCard label="Paid → Delivered" value={hours(data.durations.paidToDelivered.averageHours)} hint={`${data.durations.paidToDelivered.samples} samples`} />
            </div>
            <p className="muted-copy">Stages without both timestamps are excluded; sample counts shown. Small samples are volatile.</p>
          </section>

          <section className="account-section" aria-label="Status distribution">
            <h2>Deliveries by Status</h2>
            <BarList rows={data.status.map((row) => ({ label: row.status, value: row.deliveries }))} label="Deliveries by status" />
          </section>
        </>
      )}
    </div>
  );
}
