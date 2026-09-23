'use client';

import { useCallback, useEffect, useState } from 'react';

import { getMetricDefinitions } from '../../../../lib/analytics-api';
import { AnalyticsSubNav, SectionError } from '../../../../components/analytics';

type Definition = { metric: string; definition: string; formula: string; source: string; dateBasis: string; exclusions: string; limitations: string };

export default function DefinitionsPage() {
  const [metrics, setMetrics] = useState<Definition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMetricDefinitions();
      setMetrics(result.metrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load definitions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Metric Definitions</h1>
          <p className="muted-copy">Every figure on these dashboards is defined here — Africa/Nairobi throughout</p>
        </div>
      </header>

      <AnalyticsSubNav active="definitions" />

      {loading && <div className="empty-state"><p>Loading definitions…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {metrics.map((metric) => (
        <section key={metric.metric} className="account-section" aria-label={metric.metric}>
          <h2>{metric.metric}</h2>
          <dl className="account-meta-list">
            <dt>Definition</dt>
            <dd>{metric.definition}</dd>
            <dt>Formula</dt>
            <dd><code>{metric.formula}</code></dd>
            <dt>Source</dt>
            <dd>{metric.source}</dd>
            <dt>Date basis</dt>
            <dd>{metric.dateBasis}</dd>
            <dt>Exclusions</dt>
            <dd>{metric.exclusions}</dd>
            <dt>Limitations</dt>
            <dd>{metric.limitations}</dd>
          </dl>
        </section>
      ))}
    </div>
  );
}
