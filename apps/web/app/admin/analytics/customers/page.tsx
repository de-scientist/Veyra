'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCustomerAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, SectionError, formatKes, formatPct } from '../../../../components/analytics';

type Customers = {
  metrics: { totalCustomers: number; purchasingCustomers: number; newCustomers: number; returningCustomers: number; repeatPurchaseRate: number | null; averageOrdersPerCustomer: number | null; averageCustomerValue: number | null; observedLifetimeValue: number | null; guestOrders: number };
  segments: Array<{ segment: string; customers: number; orders: number; revenue: number }>;
  topCustomers: Array<{ email: string; name: string; orders: number; total: number }>;
};

export default function CustomersAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30' });
  const [data, setData] = useState<Customers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getCustomerAnalytics(query)) as unknown as Customers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load customer analytics');
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
          <h1>Customer Analytics</h1>
          <p className="muted-copy">Identity-based metrics exclude guest checkouts; lifetime value is observed history, not prediction</p>
        </div>
      </header>

      <AnalyticsSubNav active="customers" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading customers…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Customer metrics">
            <div className="account-summary-grid">
              <KpiCard label="Registered Customers" value={String(data.metrics.totalCustomers)} />
              <KpiCard label="Purchasing Customers" value={String(data.metrics.purchasingCustomers)} hint={`${data.metrics.guestOrders} guest orders excluded`} />
              <KpiCard label="New Customers" value={String(data.metrics.newCustomers)} />
              <KpiCard label="Returning Customers" value={String(data.metrics.returningCustomers)} />
              <KpiCard label="Repeat Purchase Rate" value={formatPct(data.metrics.repeatPurchaseRate)} />
              <KpiCard label="Observed Lifetime Value" value={data.metrics.observedLifetimeValue === null ? '—' : formatKes(data.metrics.observedLifetimeValue)} hint="Historical average, not predicted" />
            </div>
          </section>

          <section className="account-section" aria-label="Segments">
            <h2>Segments (rule-based)</h2>
            <p className="muted-copy">High-value ≥ KES 20,000 observed spend. Inactive = no order in 90 days. Thresholds are technical defaults pending business policy.</p>
            <BarList rows={data.segments.map((row) => ({ label: row.segment, value: row.customers, sub: `${row.orders} orders • ${formatKes(row.revenue)}` }))} label="Customer segments" />
          </section>

          <section className="account-section" aria-label="Top customers">
            <h2>Top Customers by Spend</h2>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Orders</th>
                    <th>Total Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topCustomers.map((row) => (
                    <tr key={row.email}>
                      <td><strong>{row.name || '—'}</strong><br /><span className="muted-copy">{row.email}</span></td>
                      <td>{row.orders}</td>
                      <td>{formatKes(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
