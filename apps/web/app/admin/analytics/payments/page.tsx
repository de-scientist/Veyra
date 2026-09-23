'use client';

import { useCallback, useEffect, useState } from 'react';

import { getPaymentAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, SectionError, formatKes, formatPct } from '../../../../components/analytics';

type Payments = {
  metrics: { attempts: number; successful: number; failed: number; pending: number; paidAmount: number; failedAmount: number; pendingAmount: number; successRate: number | null; averageSuccessfulAmount: number | null; byProvider: Array<{ provider: string; attempts: number; successful: number; failed: number; paidAmount: number; successRate: number | null }> };
  mpesa: { initiations: number; successful: number; failed: number; paidAmount: number; averageSuccessfulAmount: number | null; successRate: number | null };
};

export default function PaymentsAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30' });
  const [data, setData] = useState<Payments | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getPaymentAnalytics(query)) as unknown as Payments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payment analytics');
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
          <h1>Payment Analytics</h1>
          <p className="muted-copy">Attempts vs verified outcomes. STK initiation is never counted as success.</p>
        </div>
      </header>

      <AnalyticsSubNav active="payments" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading payments…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Payment outcomes">
            <div className="account-summary-grid">
              <KpiCard label="Attempts" value={String(data.metrics.attempts)} />
              <KpiCard label="Successful" value={String(data.metrics.successful)} hint={formatKes(data.metrics.paidAmount)} />
              <KpiCard label="Failed" value={String(data.metrics.failed)} hint={formatKes(data.metrics.failedAmount)} />
              <KpiCard label="Pending" value={String(data.metrics.pending)} hint={formatKes(data.metrics.pendingAmount)} />
              <KpiCard label="Success Rate" value={formatPct(data.metrics.successRate)} hint="PAID / (PAID + FAILED)" />
              <KpiCard label="Avg Successful" value={data.metrics.averageSuccessfulAmount === null ? '—' : formatKes(data.metrics.averageSuccessfulAmount)} />
            </div>
          </section>

          <section className="account-section" aria-label="M-Pesa">
            <h2>M-Pesa</h2>
            <div className="account-summary-grid">
              <KpiCard label="STK Initiations" value={String(data.mpesa.initiations)} hint="Initiations are not successes" />
              <KpiCard label="Successful" value={String(data.mpesa.successful)} />
              <KpiCard label="Failed" value={String(data.mpesa.failed)} />
              <KpiCard label="Success Rate" value={formatPct(data.mpesa.successRate)} />
            </div>
          </section>

          <section className="account-section" aria-label="By provider">
            <h2>Attempts by Provider</h2>
            <BarList rows={data.metrics.byProvider.map((row) => ({ label: row.provider, value: row.attempts, sub: `${row.successful} paid • ${formatPct(row.successRate)}` }))} label="Attempts by provider" />
          </section>
        </>
      )}
    </div>
  );
}
