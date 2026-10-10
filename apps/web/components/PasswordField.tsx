'use client';

import type { InputHTMLAttributes, Ref } from 'react';
import { useId, useState } from 'react';

import { JBIcon } from './JBIcons';

type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'id' | 'type' | 'aria-invalid' | 'aria-describedby'
> & {
  /** Preserved so react-hook-form's register() ref survives the spread. */
  ref?: Ref<HTMLInputElement>;
};

/**
 * Labelled password input with an accessible show/hide toggle.
 * The toggle is type="button" (never submits), preserves value/focus,
 * and announces state changes via aria-label + aria-pressed.
 * Extra input props (e.g. react-hook-form's register spread) pass through.
 */
export function PasswordField({
  id,
  name,
  label,
  autoComplete,
  error,
  hint,
  requirementsId,
  placeholder = 'Minimum 8 characters',
  inputProps,
}: {
  id?: string;
  name: string;
  label: string;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  hint?: string | null;
  requirementsId?: string;
  placeholder?: string;
  inputProps?: InputProps;
}) {
  const reactId = useId();
  const fieldId = id ?? `${name}-${reactId}`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const [visible, setVisible] = useState(false);

  const describedBy = [error ? errorId : null, hint ? hintId : null, requirementsId ?? null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="auth-field">
      <label htmlFor={fieldId}>{label}</label>
      <div className="auth-password-wrap">
        <input
          id={fieldId}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          {...inputProps}
          name={name}
        />
        <button
          type="button"
          className="auth-password-toggle"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
        >
          <JBIcon name={visible ? 'eye-off' : 'eye'} size={18} />
        </button>
      </div>
      {hint && !error ? (
        <p className="auth-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="auth-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
