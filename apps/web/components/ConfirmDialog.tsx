'use client';

import { useCallback, useId, useRef, useState } from 'react';

import { useModalFocus } from './a11y';

export type ConfirmVariant = 'default' | 'destructive' | 'warning';

type ConfirmOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  onConfirm: () => void | Promise<void>;
};

/**
 * Reusable accessible confirmation dialog (alertdialog): focus trap, Escape
 * to cancel, focus restore, loading guard against duplicate submission, and
 * inline API-failure messaging. One dialog for the whole app.
 */
export function JBConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  loading = false,
  error = null,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const containerRef = useModalFocus({ active: open, onClose: onCancel, initialFocusRef: cancelRef });

  if (!open) return null;
  return (
    <>
      <div className="sheet-overlay" aria-hidden="true" />
      <div
        ref={containerRef}
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId} className="dialog__title">{title}</h2>
        <p id={descriptionId} className="muted-copy">{description}</p>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <div className="dialog__actions">
          <button ref={cancelRef} type="button" className="button button--secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button${variant === 'default' ? '' : variant === 'warning' ? ' button--secondary' : ' button--danger'}`}
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Headless confirmation driver: `const confirm = useConfirm(); await confirm({...})`.
 * Returns true when the user confirms AND the action resolves; surfaces API
 * failures inside the dialog instead of failing silently.
 */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (value: boolean) => void }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setError(null);
      setLoading(false);
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback(
    (value: boolean) => {
      if (loading) return;
      setState((current) => {
        current?.resolve(value);
        return null;
      });
      setError(null);
    },
    [loading],
  );

  const handleConfirm = useCallback(() => {
    if (!state || loading) return;
    setLoading(true);
    setError(null);
    Promise.resolve()
      .then(() => state.onConfirm())
      .then(() => {
        state.resolve(true);
        setState(null);
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [state, loading]);

  const dialog = state ? (
    <JBConfirmDialog
      open
      title={state.title}
      description={state.description}
      confirmLabel={state.confirmLabel ?? (state.variant === 'destructive' ? 'Delete' : 'Confirm')}
      variant={state.variant ?? 'default'}
      loading={loading}
      error={error}
      onConfirm={handleConfirm}
      onCancel={() => close(false)}
    />
  ) : null;

  return { confirm, dialog };
}
