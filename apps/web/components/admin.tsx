'use client';

import Link from 'next/link';
import type { Route } from 'next';

import type { Pagination } from '../lib/admin-api';

export function AdminStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase().replace(/_/g, ' ');
  const green = ['paid', 'completed', 'delivered', 'active', 'approved', 'succeeded', 'resolved', 'sent'];
  const red = ['failed', 'cancelled', 'rejected', 'unpaid', 'dead letter'];
  const amber = ['pending', 'processing', 'packed', 'shipped', 'out for delivery', 'under review', 'inspecting', 'in transit', 'assigned', 'preparing', 'delivery attempted', 'ready for pickup', 'partially refunded', 'refunded'];
  const color = green.includes(normalized) ? '#157a3d' : red.includes(normalized) ? '#c81e1e' : amber.includes(normalized) ? '#9a6200' : '#1d4ed8';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0.25rem 0.6rem',
        borderRadius: '999px',
        fontSize: '0.7rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        background: `${color}15`,
        color,
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function AdminStatCard({ label, value, href, hint }: { label: string; value: string | number; href?: Route; hint?: string }) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p className="account-summary-value">{value}</p>
      {hint && <p className="muted-copy">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="account-summary-card account-summary-card--link">{body}</Link>
  ) : (
    <div className="account-summary-card">{body}</div>
  );
}

export function AdminPagination({ pagination, onPage }: { pagination: Pagination; onPage: (page: number) => void }) {
  if (pagination.totalPages <= 1) return null;
  return (
    <nav className="account-pagination" aria-label="Pagination">
      <button type="button" className="button button--secondary" onClick={() => onPage(pagination.page - 1)} disabled={pagination.page === 1}>
        Previous
      </button>
      <span className="account-pagination-info">
        Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
      </span>
      <button type="button" className="button button--secondary" onClick={() => onPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}>
        Next
      </button>
    </nav>
  );
}

export function AdminEmptyState({ title, message, actionHref, actionLabel }: { title: string; message: string; actionHref?: Route; actionLabel?: string }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{message}</p>
      {actionHref && actionLabel && <Link href={actionHref} className="button">{actionLabel}</Link>}
    </div>
  );
}

export function ConfirmAction({ label, confirmMessage, onConfirm, danger, disabled }: { label: string; confirmMessage: string; onConfirm: () => void | Promise<void>; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      className={`button ${danger ? 'button--danger' : 'button--secondary'}`}
      disabled={disabled}
      onClick={() => {
        if (window.confirm(confirmMessage)) void onConfirm();
      }}
    >
      {label}
    </button>
  );
}

export function formatAdminDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatMoney(amount: number | string, currency = 'KES') {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(amount));
}
