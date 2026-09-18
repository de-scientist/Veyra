'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';

import { getDataQuality } from '../../../../lib/analytics-api';
import { AnalyticsSubNav, SectionError } from '../../../../components/analytics';

type Issue = { key: string; title: string; severity: string; count: number; samples: string[] };

const LINKS: Record<string, Route> = {
  'paid-without-payment': '/admin/orders?paymentStatus=PAID',
  'negative-inventory': '/admin/inventory',
  'reserved-overflow': '/admin/inventory',
  'refund-over-paid': '/admin/returns',
  'delivered-without-timestamp': '/admin/fulfillment',
  'zero-total-orders': '/admin/orders',
  'paid-without-reference': '/admin/payments?status=PAID',
};

export default function DataQualityPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDataQuality();
      setIssues(result.issues);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data quality');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const open = issues.filter((issue) => issue.count > 0);

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Data Quality</h1>
          <p className="muted-copy">Suspicious conditions are surfaced, never silently corrected</p>
        </div>
      </header>

      <AnalyticsSubNav active="quality" />

      {loading && <div className="empty-state"><p>Checking data quality…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {!loading && !error && open.length === 0 && (
        <div className="empty-state">
          <h2>No open issues</h2>
          <p>All probes report clean state.</p>
        </div>
      )}

      {open.map((issue) => (
        <section key={issue.key} className="account-section" aria-label={issue.title}>
          <h2>{issue.title} — {issue.count}</h2>
          <p className="muted-copy">Severity: {issue.severity}</p>
          {issue.samples.length > 0 && <p className="muted-copy">Samples: {issue.samples.join(', ')}</p>}
          {LINKS[issue.key] && <Link href={LINKS[issue.key]} className="text-button">Open in operations →</Link>}
        </section>
      ))}
    </div>
  );
}
