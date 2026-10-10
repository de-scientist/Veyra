'use client';

import { useId } from 'react';

import { JBIcon } from './JBIcons';

type AlertTone = 'error' | 'success' | 'info' | 'warning';

/**
 * Accessible form-level alert (shadcn-Alert pattern on JB tokens).
 * Errors use role="alert" (assertive); success/info use role="status" (polite).
 * Dismissing never clears form data — caller owns that state.
 */
export function AuthAlert({
  tone,
  title,
  message,
  dismissible = false,
  onDismiss,
}: {
  tone: AlertTone;
  title: string;
  message?: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const isError = tone === 'error' || tone === 'warning';
  const iconName = tone === 'success' ? 'check' : tone === 'info' ? 'bell' : 'close';
  return (
    <div
      className={`jb-alert jb-alert--${tone}`}
      role={isError ? 'alert' : 'status'}
      aria-labelledby={titleId}
      aria-describedby={message ? descId : undefined}
    >
      <span className="jb-alert__icon" aria-hidden="true">
        <JBIcon name={iconName} size={18} />
      </span>
      <div className="jb-alert__body">
        <strong id={titleId}>{title}</strong>
        {message ? <p id={descId}>{message}</p> : null}
      </div>
      {dismissible && onDismiss ? (
        <button
          type="button"
          className="jb-alert__dismiss"
          aria-label="Dismiss message"
          onClick={onDismiss}
        >
          <JBIcon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
