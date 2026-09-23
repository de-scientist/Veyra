'use client';

import { useCallback, useEffect, useState } from 'react';

import { getReturnAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, SectionError, formatKes, formatPct } from '../../../../components/analytics';

type Returns = {
  metrics: { requests: number; byStatus: Array<{ status: string; requests: number }>; approved: number; rejected: number; resolved: number; unitsReturned: number; returnValue: number; unitReturnRate: number | null; orderReturnRate: number | null; deliveredOrders: number; soldOrders: number };
  reasons: Array<{ reason: string; requests: number; units: number; share: number | null }>;
  processing: { samples: number; averageHours: number | null };
  exchanges: { requests: number; byStatus: Array<{ status: string; exchanges: number }> };
  refunds: { requests: number; byStatus: Array<{ status: string; refunds: number; amount: number }>; totalRefunded: number; averageRefund: number | null };
};

export default function ReturnsAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30' });
  const [data, setData] = useState<Returns | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getReturnAnalytics(query)) as unknown as Returns);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load return analytics');
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
          <h1>Returns, Exchanges &amp; Refunds</h1>
          <p className="muted-copy">Returns, exchanges, and refunds stay distinct throughout</p>
        </div>
      </header>

      <AnalyticsSubNav active="returns" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading returns…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Return metrics">
            <div className="account-summary-grid">
              <KpiCard label="Return Requests" value={String(data.metrics.requests)} />
              <KpiCard label="Unit Return Rate" value={formatPct(data.metrics.unitReturnRate)} hint="Returned units / units sold" />
              <KpiCard label="Order Return Rate" value={formatPct(data.metrics.orderReturnRate)} hint="Requests / delivered orders" />
              <KpiCard label="Resolved" value={String(data.metrics.resolved)} />
              <KpiCard label="Avg Resolution" value={data.processing.averageHours === null ? '—' : `${data.processing.averageHours.toLocaleString('en-KE')} h`} hint={`${data.processing.samples} resolved samples`} />
            </div>
          </section>

          <section className="account-section" aria-label="Return reasons">
            <h2>Return Reasons (actual values)</h2>
            <BarList rows={data.reasons.map((row) => ({ label: row.reason, value: row.requests, sub: `${row.units} units • ${formatPct(row.share)}` }))} label="Return reasons" />
          </section>

          <section className="account-section" aria-label="Exchanges">
            <h2>Exchanges</h2>
            <BarList rows={[{ label: 'Exchange requests', value: data.exchanges.requests }, ...data.exchanges.byStatus.map((row) => ({ label: row.status, value: row.exchanges }))]} label="Exchanges" />
          </section>

          <section className="account-section" aria-label="Refunds">
            <div className="account-summary-grid">
              <KpiCard label="Refund Requests" value={String(data.refunds.requests)} />
              <KpiCard label="Total Refunded" value={formatKes(data.refunds.totalRefunded)} hint="Succeeded refunds only" />
              <KpiCard label="Average Refund" value={data.refunds.averageRefund === null ? '—' : formatKes(data.refunds.averageRefund)} />
            </div>
            <BarList rows={data.refunds.byStatus.map((row) => ({ label: row.status, value: row.refunds, sub: formatKes(row.amount) }))} label="Refunds by status" />
          </section>
        </>
      )}
    </div>
  );
}
