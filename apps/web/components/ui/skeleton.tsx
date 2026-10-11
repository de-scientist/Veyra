'use client';

import type { CSSProperties } from 'react';

import { cn } from '../../lib/cn';

/**
 * shadcn-compatible Skeleton: shimmer placeholder with a polite loading
 * announcement. Decorative blocks stay `aria-hidden`; the message carries
 * `role="status"`.
 */
export function Skeleton({ label, className, style }: { label: string; className?: string; style?: CSSProperties }) {
  return (
    <span role="status" aria-label={label} className={cn('ui-skeleton', className)} style={style}>
      <span className="skeleton" style={{ display: 'block', height: '1rem' }} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}
