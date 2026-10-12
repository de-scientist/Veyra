import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

export type UIAlertTone = 'error' | 'warning' | 'info' | 'success';

/**
 * shadcn-compatible Alert: persistent inline message that stays visible
 * until the shopper addresses it (fetch failures, inventory restrictions).
 * Transient confirmations belong in the toast system (`components/Toast`).
 * Token-driven so light/dark themes track `data-theme` automatically.
 */
export function UIAlert({
  tone = 'error',
  title,
  description,
  action,
  className,
  children,
}: {
  tone?: UIAlertTone;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div role="alert" className={cn('jb-alert', `jb-alert--${tone}`, className)}>
      <div className="jb-alert__body">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {children}
      </div>
      {action}
    </div>
  );
}

export function UIAlertTitle({ children }: { children: ReactNode }) {
  return <strong>{children}</strong>;
}

export function UIAlertDescription({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}
