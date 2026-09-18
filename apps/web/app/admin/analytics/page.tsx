'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAnalyticsOverview, type AnalyticsQuery } from '../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, KpiCard, SectionError, formatKes, formatPct } from '../../../components/analytics';

type Overview = {
  period: { from: string; to: string; timezone: string };
  sales: {
    currency: string;
    current: { grossSales: number; paidRevenue: number; netSales: number; orders: number; paidOrders: number; averageOrderValue: number | null; refundedAmount: number };
    change: { grossSales: { value: number | null; label: string }; paidRevenue: { value: number | null; label: string }; orders: { value: number | null; label: string }; paidOrders: { value: number | null; label: string } } | null;
  };
  payments: { attempts: number; successful: number; failed: number; successRate: number | null };
  returns: { requests: number; unitReturnRate: number | null };
  refunds: { requests: number; totalRefunded: number };
  inventory: { totalSkus: number; availableUnits: number; lowStockSkus: number; outOfStockSkus: number };
  dataQuality: { openIssues: number; issues: Array<{ key: string; title: string; severity: string; count: number }> };
};

export default function AnalyticsOverviewPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30', compare: true });
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getAnalyticsOverview(query)) as unknown as Overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics');
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
          <h1>Analytics</h1>
          <p className="muted-copy">Read-only interpretation of authoritative commerce data • {data ? `Africa/Nairobi • ${new Date(data.period.from).toLocaleDateString('en-KE')} → ${new Date(data.period.to).toLocaleDateString('en-KE')}` : 'Africa/Nairobi'}</p>
        </div>
        <Link href="/admin/analytics/definitions" className="button button--secondary">Metric Definitions</Link>
      </header>

      <AnalyticsSubNav active="overview" />
      <AnalyticsFilterBar query={query} onChange={(next) => setQuery({ ...next, page: undefined } as AnalyticsQuery)} />

      {loading && <div className="empty-state"><p>Loading analytics…</p></div>}
      {error && !data && <SectionError message={error} onRetry={load} />}
      {error && data && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Sales key figures">
            <h2>Sales</h2>
            <div className="account-summary-grid">
              <KpiCard label="Gross Sales" value={formatKes(data.sales.current.grossSales)} change={data.sales.change?.grossSales} hint="Non-cancelled orders in period" />
              <KpiCard label="Paid Revenue" value={formatKes(data.sales.current.paidRevenue)} change={data.sales.change?.paidRevenue} hint="Paid, non-cancelled orders" />
              <KpiCard label="Net Sales" value={formatKes(data.sales.current.netSales)} hint="Paid revenue minus succeeded refunds" />
              <KpiCard label="Orders" value={String(data.sales.current.orders)} change={data.sales.change?.orders} />
              <KpiCard label="Paid Orders" value={String(data.sales.current.paidOrders)} change={data.sales.change?.paidOrders} />
              <KpiCard label="Average Order Value" value={data.sales.current.averageOrderValue === null ? '—' : formatKes(data.sales.current.averageOrderValue)} hint="Paid revenue / paid orders" />
            </div>
          </section>

          <section className="account-section" aria-label="Health">
            <h2>Health</h2>
            <div className="account-summary-grid">
              <KpiCard label="Payment Success Rate" value={formatPct(data.payments.successRate)} hint={`${data.payments.successful} paid / ${data.payments.attempts} attempts`} />
              <KpiCard label="Unit Return Rate" value={formatPct(data.returns.unitReturnRate)} hint={`${data.returns.requests} return requests`} />
              <KpiCard label="Total Refunded" value={formatKes(data.refunds.totalRefunded)} hint={`${data.refunds.requests} refund requests`} />
              <KpiCard label="Available Units" value={String(data.inventory.availableUnits)} hint={`${data.inventory.lowStockSkus} low-stock • ${data.inventory.outOfStockSkus} out-of-stock SKUs`} />
            </div>
          </section>

          {data.dataQuality.openIssues > 0 && (
            <section className="account-section" aria-label="Data quality">
              <h2>Data Quality — {data.dataQuality.openIssues} open issue type(s)</h2>
              {data.dataQuality.issues.map((issue) => (
                <p key={issue.key}><strong>{issue.title}</strong> — {issue.count} <Link href="/admin/analytics/quality" className="text-button">Investigate</Link></p>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
