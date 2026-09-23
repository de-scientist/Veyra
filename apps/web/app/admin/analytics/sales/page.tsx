'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSalesAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, LineChart, SectionError, formatKes } from '../../../../components/analytics';

type Sales = {
  summary: {
    currency: string;
    current: { grossSales: number; paidRevenue: number; netSales: number; discounts: number; shippingCollected: number; orders: number; paidOrders: number; averageOrderValue: number | null; refundedAmount: number };
    change: { grossSales: { value: number | null; label: string }; paidRevenue: { value: number | null; label: string }; orders: { value: number | null; label: string } } | null;
  };
  series: { granularity: string; points: Array<{ bucket: string; revenue: number; paidRevenue: number; orders: number; paidOrders: number }> };
  byCategory: Array<{ category: string; revenue: number; units: number; orders: number }>;
  byPaymentMethod: Array<{ provider: string; revenue: number; payments: number }>;
};

export default function SalesAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30', compare: true });
  const [data, setData] = useState<Sales | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getSalesAnalytics(query)) as unknown as Sales);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sales analytics');
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
          <h1>Sales Analytics</h1>
          <p className="muted-copy">Gross, paid, and net sales with Nairobi-time trends</p>
        </div>
      </header>

      <AnalyticsSubNav active="sales" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading sales…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Sales summary">
            <div className="account-summary-grid">
              <KpiCard label="Gross Sales" value={formatKes(data.summary.current.grossSales)} change={data.summary.change?.grossSales} />
              <KpiCard label="Paid Revenue" value={formatKes(data.summary.current.paidRevenue)} change={data.summary.change?.paidRevenue} />
              <KpiCard label="Net Sales" value={formatKes(data.summary.current.netSales)} hint={`Refunded ${formatKes(data.summary.current.refundedAmount)}`} />
              <KpiCard label="Discounts" value={formatKes(data.summary.current.discounts)} />
              <KpiCard label="Shipping Collected" value={formatKes(data.summary.current.shippingCollected)} />
              <KpiCard label="AOV" value={data.summary.current.averageOrderValue === null ? '—' : formatKes(data.summary.current.averageOrderValue)} />
            </div>
          </section>

          <section className="account-section" aria-label="Revenue trend">
            <h2>Revenue Over Time ({data.series.granularity})</h2>
            <LineChart points={data.series.points} label={`Revenue trend, ${data.series.granularity} buckets`} />
          </section>

          <section className="account-section" aria-label="Revenue by category">
            <h2>Revenue by Category</h2>
            <BarList rows={data.byCategory.map((row) => ({ label: row.category, value: row.revenue, sub: `${row.units} units • ${row.orders} orders` }))} label="Revenue by category" format={formatKes} />
          </section>

          <section className="account-section" aria-label="Revenue by payment method">
            <h2>Revenue by Payment Method</h2>
            <BarList rows={data.byPaymentMethod.map((row) => ({ label: row.provider, value: row.revenue, sub: `${row.payments} payments` }))} label="Revenue by payment method" format={formatKes} />
          </section>
        </>
      )}
    </div>
  );
}
