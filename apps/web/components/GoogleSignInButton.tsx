'use client';

import { useRef, useState } from 'react';

import {
  checkGoogleStart,
  googleStartErrorMessage,
  logGoogleDiagnostic,
  googleStartUrl,
  type GoogleCallbackAlert,
} from '../lib/google-auth';

/**
 * Official Google "G" mark (multicolor) + a theme-aware button. Full-page
 * navigation to the backend initiation endpoint — no popups, no tokens in
 * frontend state, no new notification library.
 */
export function GoogleBrandMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export function GoogleDivider() {
  return (
    <div className="auth-divider" role="separator" aria-label="Or continue with email">
      <span aria-hidden="true" />
      <p>or</p>
      <span aria-hidden="true" />
    </div>
  );
}

export function GoogleSignInButton({
  redirect,
  disabled,
  label = 'Continue with Google',
  onStartError,
}: {
  redirect: string;
  disabled?: boolean;
  label?: string;
  /** Friendly, pre-mapped alert for the hosting form (never raw errors). */
  onStartError?: (alert: GoogleCallbackAlert | null) => void;
}) {
  const [starting, setStarting] = useState(false);
  const navigating = useRef(false);
  const busy = disabled || starting;

  async function begin() {
    if (busy || navigating.current) return;
    // Stale transient errors clear on retry; a new failure replaces them.
    onStartError?.(null);
    setStarting(true);
    let check: Awaited<ReturnType<typeof checkGoogleStart>>;
    try {
      check = await checkGoogleStart();
    } catch {
      // Defensive: checkGoogleStart never rejects, but a failure here must
      // still be customer-safe and retryable — never a raw exception.
      check = { ok: false, kind: 'server' };
    }
    if (!check.ok) {
      logGoogleDiagnostic({ action: 'google-start', kind: check.kind, ...(check.status !== undefined ? { status: check.status } : {}), ...(check.code ? { code: check.code } : {}) });
      onStartError?.(googleStartErrorMessage(check.kind));
      setStarting(false);
      return;
    }
    // Backend owns the OAuth transaction from here; the callback returns
    // with the session cookie set, or redirects back with a safe
    // `google_error` code that the form maps to friendly copy.
    navigating.current = true;
    window.location.href = googleStartUrl(redirect);
  }

  return (
    <button
      type="button"
      className="button google-button"
      onClick={() => void begin()}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-label={label}
    >
      {starting ? (
        <span className="google-button__pending" role="status">
          Connecting to Google…
        </span>
      ) : (
        <>
          <GoogleBrandMark />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

/**
 * Shared Google section for the login and registration forms. The button is
 * always rendered — its visibility never depends on a preliminary status
 * request. Placement and styling are identical on both pages: button above
 * the email/password fields, separated by the "or" divider. The register
 * variant adds the customer-account note under the button.
 */
export function GoogleAuthSection({
  redirect,
  disabled,
  context,
  onGoogleError,
}: {
  redirect: string;
  disabled?: boolean;
  context: 'login' | 'register';
  onGoogleError?: (alert: GoogleCallbackAlert | null) => void;
}) {
  return (
    <>
      <GoogleSignInButton redirect={redirect} disabled={disabled} onStartError={onGoogleError} />
      {context === 'register' ? (
        <p className="muted-copy auth-google-note">Continuing with Google creates your JB Mercantile customer account.</p>
      ) : null}
      <GoogleDivider />
    </>
  );
}
