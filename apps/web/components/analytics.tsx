'use client';

import Link from 'next/link';
import type { Route } from 'next';

import type { AnalyticsQuery, PresetKey } from '../lib/analytics-api';

export const PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisWeek', label: 'This week' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'thisMonth', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'thisQuarter', label: 'This quarter' },
  { key: 'thisYear', label: 'This year' },
];

export function AnalyticsSubNav({ active }: { active: string }) {
  const links: Array<{ href: Route; label: string; key: string }> = [
    { href: '/admin/analytics', label: 'Overview', key: 'overview' },
    { href: '/admin/analytics/sales', label: 'Sales', key: 'sales' },
    { href: '/admin/analytics/products', label: 'Products', key: 'products' },
    { href: '/admin/analytics/customers', label: 'Customers', key: 'customers' },
    { href: '/admin/analytics/inventory', label: 'Inventory', key: 'inventory' },
    { href: '/admin/analytics/payments', label: 'Payments', key: 'payments' },
    { href: '/admin/analytics/fulfillment', label: 'Fulfillment', key: 'fulfillment' },
    { href: '/admin/analytics/delivery', label: 'Delivery', key: 'delivery' },
    { href: '/admin/analytics/returns', label: 'Returns', key: 'returns' },
    { href: '/admin/analytics/reports', label: 'Reports', key: 'reports' },
    { href: '/admin/analytics/quality', label: 'Data Quality', key: 'quality' },
    { href: '/admin/analytics/definitions', label: 'Definitions', key: 'definitions' },
  ];
  return (
    <nav className="account-status-filters" aria-label="Analytics sections" style={{ marginBottom: '1.5rem' }}>
      {links.map((link) => (
        <Link key={link.key} href={link.href} className={`account-filter-chip ${active === link.key ? 'active' : ''}`} aria-current={active === link.key ? 'page' : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

export function AnalyticsFilterBar({ query, onChange }: { query: AnalyticsQuery; onChange: (query: AnalyticsQuery) => void }) {
  return (
    <section className="account-filters" aria-label="Analytics filters">
      <div className="account-status-filters" role="group" aria-label="Date range presets">
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={`account-filter-chip ${query.preset === preset.key && !query.from ? 'active' : ''}`}
            onClick={() => onChange({ ...query, preset: preset.key, from: undefined, to: undefined })}
            aria-pressed={query.preset === preset.key && !query.from}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <form
        className="account-form"
        onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const from = String(form.get('from') ?? '');
          const to = String(form.get('to') ?? '');
          onChange({ ...query, preset: undefined, from: from || undefined, to: to || undefined });
        }}
      >
        <div className="form-grid">
          <label>
            <span>From (Nairobi)</span>
            <input type="date" name="from" defaultValue={query.from?.slice(0, 10) ?? ''} />
          </label>
          <label>
            <span>To (Nairobi, exclusive)</span>
            <input type="date" name="to" defaultValue={query.to?.slice(0, 10) ?? ''} />
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="button button--secondary">Apply Custom Range</button>
          <label className="account-unread-toggle">
            <input
              type="checkbox"
              checked={query.compare === true}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...query, compare: e.currentTarget.checked || undefined })}
            />
            <span>Compare with previous period</span>
          </label>
        </div>
      </form>
      <p className="muted-copy">All ranges are half-open [from, to) in Africa/Nairobi (UTC+3). Calendar quarters shown are calendar quarters, not a fiscal calendar.</p>
    </section>
  );
}

export function KpiCard({ label, value, change, hint }: { label: string; value: string; change?: { value: number | null; label: string } | null; hint?: string }) {
  return (
    <div className="account-summary-card">
      <p className="eyebrow">{label}</p>
      <p className="account-summary-value">{value}</p>
      {change && <p className="muted-copy" aria-label={change.value === null ? change.label : `Change ${change.label}`}>{change.label}</p>}
      {hint && <p className="muted-copy">{hint}</p>}
    </div>
  );
}

export function formatKes(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount);
}

export function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(1)}%`;
}

function chartFrame(children: React.ReactNode, label: string, empty: boolean) {
  return (
    <figure className="analytics-chart" role="img" aria-label={label} style={{ margin: 0 }}>
      {empty ? <p className="muted-copy">No data for the selected period.</p> : children}
    </figure>
  );
}

export function LineChart({ points, label }: { points: Array<{ bucket: string; revenue: number; paidRevenue: number }>; label: string }) {
  const empty = points.length === 0 || points.every((p) => p.revenue === 0 && p.paidRevenue === 0);
  if (empty) return chartFrame(null, label, true);
  const width = 640;
  const height = 220;
  const pad = 34;
  const max = Math.max(...points.map((p) => Math.max(p.revenue, p.paidRevenue)), 1);
  const x = (i: number) => (points.length === 1 ? width / 2 : pad + (i / (points.length - 1)) * (width - pad * 2));
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const path = (pick: (p: (typeof points)[number]) => number) => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(' ');
  return chartFrame(
    <>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="presentation">
        {[0.25, 0.5, 0.75, 1].map((fraction) => (
          <line key={fraction} x1={pad} x2={width - pad} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" strokeOpacity="0.15" />
        ))}
        <path d={path((p) => p.revenue)} fill="none" stroke="currentColor" strokeWidth="2" />
        <path d={path((p) => p.paidRevenue)} fill="none" strokeWidth="2" strokeDasharray="5 4" style={{ stroke: 'var(--accent, #7c5a45)' }} />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.paidRevenue)} r="3" style={{ fill: 'var(--accent, #7c5a45)' }}>
            <title>{`${p.bucket}: paid ${p.paidRevenue.toLocaleString('en-KE')}, gross ${p.revenue.toLocaleString('en-KE')}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="muted-copy">Solid: gross sales. Dashed: paid revenue. {points[0]?.bucket} → {points[points.length - 1]?.bucket}.</figcaption>
    </>,
    label,
    false,
  );
}

export function BarList({ rows, label, format }: { rows: Array<{ label: string; value: number; sub?: string }>; label: string; format?: (v: number) => string }) {
  if (rows.length === 0) return chartFrame(null, label, true);
  const max = Math.max(...rows.map((r) => r.value), 1);
  const fmt = format ?? ((v: number) => v.toLocaleString('en-KE'));
  return chartFrame(
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {rows.map((row) => (
        <li key={row.label} style={{ marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
            <span>{row.label}{row.sub ? <span className="muted-copy"> — {row.sub}</span> : null}</span>
            <strong>{fmt(row.value)}</strong>
          </div>
          <div style={{ height: '8px', borderRadius: '4px', background: 'currentColor', opacity: 0.15 }} aria-hidden="true">
            <div style={{ height: '100%', width: `${Math.max(2, (row.value / max) * 100)}%`, borderRadius: '4px', background: 'currentColor', opacity: 0.9 }} />
          </div>
        </li>
      ))}
    </ul>,
    label,
    false,
  );
}

export function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="inline-message" role="alert">
      <p>{message}</p>
      <button type="button" className="button button--secondary" onClick={onRetry}>Retry section</button>
    </div>
  );
}
