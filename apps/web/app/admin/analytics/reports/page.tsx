'use client';

import { useState } from 'react';

import { downloadCsv, exportReport, type AnalyticsQuery, type PresetKey } from '../../../../lib/analytics-api';
import { AnalyticsSubNav, PRESETS, SectionError } from '../../../../components/analytics';

const REPORTS: Array<{ key: string; title: string; description: string; pii: boolean }> = [
  { key: 'sales', title: 'Sales / Orders Report', description: 'Order-level rows with statuses and totals.', pii: false },
  { key: 'orders', title: 'Orders Report', description: 'Same order grain as sales, for operational review.', pii: false },
  { key: 'products', title: 'Product Performance Report', description: 'Snapshot order lines with product, SKU, and variant detail.', pii: false },
  { key: 'inventory', title: 'Inventory Report', description: 'Point-in-time stock snapshot per SKU.', pii: false },
  { key: 'payments', title: 'Payment Report', description: 'Payment attempts with provider references. No secrets.', pii: false },
  { key: 'customers', title: 'Customer Report', description: 'Aggregated spend per customer (email + name). Audited separately.', pii: true },
  { key: 'refunds', title: 'Refund Report', description: 'Refund records with status and references.', pii: false },
];

export default function ReportsPage() {
  const [preset, setPreset] = useState<PresetKey>('last30');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportLimit, setExportLimit] = useState('1000');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = (): AnalyticsQuery & { exportLimit?: number } => ({
    preset: from || to ? undefined : preset,
    from: from ? new Date(`${from}T00:00:00+03:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T00:00:00+03:00`).toISOString() : undefined,
    exportLimit: Number(exportLimit) || 1000,
  });

  const handleExport = async (report: string) => {
    setBusy(report);
    setError(null);
    setMessage(null);
    try {
      const result = await exportReport(report, query());
      downloadCsv(result.filename, result.csv);
      setMessage(`${result.filename} downloaded. The export was audit-logged.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Reports &amp; Exports</h1>
          <p className="muted-copy">CSV exports respect filters, row caps (max 5,000), and audit logging</p>
        </div>
      </header>

      <AnalyticsSubNav active="reports" />

      <section className="account-filters" aria-label="Report range">
        <div className="account-status-filters" role="group" aria-label="Date range presets">
          {PRESETS.map((item) => (
            <button key={item.key} type="button" className={`account-filter-chip ${preset === item.key && !from && !to ? 'active' : ''}`} onClick={() => { setPreset(item.key); setFrom(''); setTo(''); }}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>
            <span>From (Nairobi date)</span>
            <input type="date" value={from} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.currentTarget.value)} />
          </label>
          <label>
            <span>To (Nairobi date, exclusive)</span>
            <input type="date" value={to} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.currentTarget.value)} />
          </label>
          <label>
            <span>Row limit (max 5,000)</span>
            <input type="number" value={exportLimit} min="1" max="5000" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExportLimit(e.currentTarget.value)} />
          </label>
        </div>
      </section>

      {error && <SectionError message={error} onRetry={() => setError(null)} />}
      {message && <div className="success-message" role="status">{message}</div>}

      <section className="account-section" aria-label="Available reports">
        {REPORTS.map((report) => (
          <div key={report.key} className="account-summary-card">
            <p><strong>{report.title}</strong>{report.pii ? ' — contains customer email/name, audited separately' : ''}</p>
            <p className="muted-copy">{report.description}</p>
            <button type="button" className="button button--secondary" disabled={busy !== null} onClick={() => handleExport(report.key)}>
              {busy === report.key ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
