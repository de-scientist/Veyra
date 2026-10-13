'use client';

import { useEffect, useState } from 'react';

import { getGoogleStatus, googleStartUrl } from '../lib/google-auth';

/**
 * Google availability for the auth forms. Four explicit states so the UI
 * never conflates them:
 * - `loading`: status request in flight (caller shows a disabled placeholder).
 * - `ready`: OAuth configured — render the real backend-redirect button.
 * - `unconfigured`: backend reports OAuth off — render no button (never fake).
 * - `unreachable`: status request failed — render no button plus a diagnostic
 *   note (a failed request is not proof that OAuth is unconfigured).
 */
export type GoogleAvailabilityState = 'loading' | 'ready' | 'unconfigured' | 'unreachable';

export function useGoogleAvailability(): GoogleAvailabilityState {
  const [state, setState] = useState<GoogleAvailabilityState>('loading');
  useEffect(() => {
    let live = true;
    getGoogleStatus().then(
      (status) => {
        if (live) setState(status.configured ? 'ready' : 'unconfigured');
      },
      () => {
        if (live) setState('unreachable');
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/**
 * Backwards-compatible boolean hook. Returns null while loading, true when
 * ready, false when unconfigured or unreachable. Prefer
 * `useGoogleAvailability` for new code so unreachable is diagnosable.
 */
export function useGoogleConfigured(): boolean | null {
  const state = useGoogleAvailability();
  if (state === 'loading') return null;
  return state === 'ready';
}

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
}: {
  redirect: string;
  disabled?: boolean;
  label?: string;
}) {
  const [starting, setStarting] = useState(false);
  const busy = disabled || starting;

  function begin() {
    if (busy) return;
    setStarting(true);
    // Backend owns the OAuth transaction; the callback returns with the
    // session cookie set. If anything fails, the backend redirects back
    // with a safe `google_error` code and this page remounts fresh.
    window.location.href = googleStartUrl(redirect);
  }

  return (
    <button
      type="button"
      className="button google-button"
      onClick={begin}
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
 * Disabled placeholder while the OAuth status request is in flight. Honest
 * loading state — not a working button — replaced by the real button (or an
 * honest fallback) as soon as availability resolves.
 */
export function GoogleLoadingButton() {
  return (
    <button type="button" className="button google-button" disabled aria-busy="true" aria-label="Checking Google sign-in availability">
      <span className="google-button__pending" role="status">
        Checking Google sign-in…
      </span>
    </button>
  );
}

/**
 * Shared Google section for the login and registration forms. Placement and
 * styling are identical on both pages: real button above the email/password
 * fields, separated by the "or" divider. The register variant adds the
 * customer-account note under the button.
 */
export function GoogleAuthSection({
  redirect,
  disabled,
  context,
}: {
  redirect: string;
  disabled?: boolean;
  context: 'login' | 'register';
}) {
  const availability = useGoogleAvailability();

  if (availability === 'ready') {
    return (
      <>
        <GoogleSignInButton redirect={redirect} disabled={disabled} />
        {context === 'register' ? (
          <p className="muted-copy auth-google-note">Continuing with Google creates your JB Mercantile customer account.</p>
        ) : null}
        <GoogleDivider />
      </>
    );
  }

  if (availability === 'loading') {
    return (
      <>
        <GoogleLoadingButton />
        <GoogleDivider />
      </>
    );
  }

  if (availability === 'unreachable') {
    return (
      <p className="muted-copy" role="note">
        Google sign-in status couldn&apos;t be reached — email sign-in still works. Check your connection and API
        configuration, then reload.
      </p>
    );
  }

  // Genuinely unconfigured: keep the existing fallback (no button, never a
  // fake one). Developers get an actionable hint; production stays silent.
  if (process.env.NODE_ENV === 'development') {
    return (
      <p className="muted-copy" role="note">
        Google sign-in isn&apos;t configured (set the backend GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET). Email
        sign-in still works.
      </p>
    );
  }
  return null;
}
