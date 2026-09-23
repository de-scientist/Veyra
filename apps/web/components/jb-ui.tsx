import Link from 'next/link';
import type { Route } from 'next';
import type { ReactNode } from 'react';

/** Shared JB presentation primitives. Backend-agnostic; no business logic. */

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="muted-copy">{description}</p> : null}
      </div>
      {actions ? <div className="cta-row" style={{ marginTop: 0 }}>{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, message, actionHref, actionLabel }: {
  title: string;
  message: string;
  actionHref?: Route;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {actionHref && actionLabel ? <Link href={actionHref} className="button">{actionLabel}</Link> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state" role="alert">
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry ? <button type="button" className="button button--secondary" onClick={onRetry}>Try again</button> : null}
    </div>
  );
}

export function LoadingSkeleton({ lines = 3, label = 'Loading…' }: { lines?: number; label?: string }) {
  return (
    <div aria-busy="true" aria-label={label} role="status">
      <p className="muted-copy">{label}</p>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="skeleton" style={{ height: '1rem', marginBottom: '0.6rem' }} />
      ))}
    </div>
  );
}

const STATUS_TONES: Record<string, { bg: string; fg: string }> = {
  green: { bg: 'var(--jb-success-bg)', fg: 'var(--jb-success)' },
  red: { bg: 'var(--jb-error-bg)', fg: 'var(--jb-error)' },
  amber: { bg: 'var(--jb-warning-bg)', fg: 'var(--jb-warning)' },
  blue: { bg: 'var(--jb-info-bg)', fg: 'var(--jb-info)' },
};

function toneFor(status: string): keyof typeof STATUS_TONES {
  const s = status.toLowerCase().replace(/_/g, ' ');
  if (['paid', 'completed', 'delivered', 'active', 'approved', 'approved for resolution', 'succeeded', 'resolved', 'received', 'picked up', 'sent', 'confirmed'].includes(s)) return 'green';
  if (['failed', 'cancelled', 'rejected', 'unpaid', 'expired', 'dead letter'].includes(s)) return 'red';
  if (['pending', 'processing', 'requested', 'unfulfilled', 'return initiated', 'packed', 'shipped', 'in transit', 'out for delivery', 'under review', 'inspecting', 'assigned', 'preparing', 'ready for pickup', 'refunded', 'partially refunded', 'delivery attempted'].includes(s)) return 'amber';
  return 'blue';
}

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[toneFor(status)];
  return (
    <span className="status-badge" style={{ background: tone.bg, color: tone.fg }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
