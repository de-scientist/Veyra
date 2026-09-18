'use client';

import { useCallback, useEffect, useState } from 'react';

import { getDeliveryAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, SectionError, formatPct } from '../../../../components/analytics';

type Delivery = {
  methods: Array<{ method: string; deliveries: number; delivered: number; completionRate: number | null }>;
  failures: { failed: number; deliveryAttempted: number; delivered: number; failureRate: number | null };
};

export default function DeliveryAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30' });
  const [data, setData] = useState<Delivery | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getDeliveryAnalytics(query)) as unknown as Delivery);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load delivery analytics');
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
          <h1>Delivery Analytics</h1>
          <p className="muted-copy">Method mix and completion using configured methods only</p>
        </div>
      </header>

      <AnalyticsSubNav active="delivery" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading delivery…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Outcomes">
            <div className="account-summary-grid">
              <KpiCard label="Delivered" value={String(data.failures.delivered)} />
              <KpiCard label="Failed" value={String(data.failures.failed)} />
              <KpiCard label="Delivery Attempted" value={String(data.failures.deliveryAttempted)} hint="May still convert on retry" />
              <KpiCard label="Failure Rate" value={formatPct(data.failures.failureRate)} />
            </div>
          </section>

          <section className="account-section" aria-label="Method mix">
            <h2>Deliveries by Method</h2>
            <BarList rows={data.methods.map((row) => ({ label: row.method, value: row.deliveries, sub: `${row.delivered} delivered • ${formatPct(row.completionRate)}` }))} label="Deliveries by method" />
          </section>
        </>
      )}
    </div>
  );
}
