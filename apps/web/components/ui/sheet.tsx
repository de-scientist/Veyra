'use client';

import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { useModalFocus } from '../a11y';

/**
 * shadcn-compatible Sheet (left/right drawer) on JB tokens.
 *
 * Modal behaviour comes from the single `useModalFocus` primitive: body scroll
 * lock, initial focus, Tab trap, Escape-to-close, and focus restoration.
 * Rendered only while open so closed drawers never linger in the a11y tree.
 */
export function Sheet({
  open,
  onClose,
  label,
  side = 'left',
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog (branding inside is decorative). */
  label: string;
  side?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}) {
  const dialogRef = useModalFocus({ active: open, onClose });
  if (!open) return null;
  return (
    <>
      <div className="sheet-overlay" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn('ui-sheet', side === 'right' && 'ui-sheet--right', className)}
      >
        {children}
      </div>
    </>
  );
}
