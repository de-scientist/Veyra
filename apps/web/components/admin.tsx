'use client';

import Link from 'next/link';
import type { Route } from 'next';

import type { Pagination } from '../lib/admin-api';
import { StatusBadge } from './jb-ui';
import { useConfirm } from './ConfirmDialog';

export function AdminStatusBadge({ status }: { status: string }) {
  return <StatusBadge status={status} />;
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

export function ConfirmAction({
  label,
  confirmMessage,
  onConfirm,
  danger,
  disabled,
  title,
  confirmLabel,
}: {
  label: string;
  confirmMessage: string;
  onConfirm: () => unknown;
  danger?: boolean;
  disabled?: boolean;
  title?: string;
  confirmLabel?: string;
}) {
  const { confirm, dialog } = useConfirm();
  return (
    <>
      {dialog}
      <button
        type="button"
        className={`button ${danger ? 'button--danger' : 'button--secondary'}`}
        disabled={disabled}
        onClick={() => {
          void confirm({
            title: title ?? label,
            description: confirmMessage,
            confirmLabel: confirmLabel ?? label,
            variant: danger ? 'destructive' : 'default',
            onConfirm,
          });
        }}
      >
        {label}
      </button>
    </>
  );
}

export function formatAdminDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-KE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatMoney(amount: number | string, currency = 'KES') {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(amount));
}
