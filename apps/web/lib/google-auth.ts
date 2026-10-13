/**
 * Google sign-in client — mirrors `apps/api/src/routes/google-auth.ts`.
 * The browser never sees provider tokens: it navigates to the backend
 * initiation endpoint, Google redirects to the backend callback, and the
 * backend sets the HttpOnly `veyra_session` cookie before returning here.
 * Nothing auth-sensitive is kept in localStorage/sessionStorage.
 */

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string; code?: string; details?: unknown };
};

async function googleRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Connection problem. Check your internet connection and try again.');
  }
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok) {
    const error = new Error(body?.error?.message ?? 'Something went wrong. Please try again.');
    (error as Error & { code?: string }).code = body?.error?.code;
    (error as Error & { details?: unknown }).details = body?.error?.details;
    throw error;
  }
  return body?.data as T;
}

/**
 * Whether Google sign-in is configured. Throws on network/HTTP failure so
 * callers can distinguish "status unreachable" from "genuinely
 * unconfigured" — a failed request must never masquerade as proof that
 * Google OAuth is off (that failure mode silently hid the button).
 */
export async function getGoogleStatus(): Promise<{ configured: boolean }> {
  return googleRequest<{ configured: boolean }>('/auth/google/status');
}

/** Backend initiation URL — the browser navigates here (full redirect). */
export function googleStartUrl(redirect: string): string {
  return `${apiBaseUrl}/api/v1/auth/google/start?redirect=${encodeURIComponent(redirect)}`;
}

export type GoogleLinkStatus = {
  linked: boolean;
  email: string | null;
  hasPassword: boolean;
};

export function getGoogleLinkStatus(): Promise<GoogleLinkStatus> {
  return googleRequest<GoogleLinkStatus>('/auth/google/link/status');
}

export function startGoogleLink(input: { currentPassword?: string; redirect?: string }): Promise<{ url: string; expiresIn: number }> {
  return googleRequest<{ url: string; expiresIn: number }>('/auth/google/link/start', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function unlinkGoogle(input: { currentPassword: string }): Promise<{ unlinked: boolean }> {
  return googleRequest<{ unlinked: boolean }>('/auth/google/unlink', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export type GoogleCallbackAlert = {
  tone: 'error' | 'success';
  title: string;
  message: string;
};

/**
 * Maps backend callback status params (`?google=` / `?google_error=`) to
 * safe, actionable UI copy. Unknown codes fall back to a generic message —
 * account details are never rendered from the URL.
 */
export function googleCallbackMessage(params: { google?: string | null; google_error?: string | null }): GoogleCallbackAlert | null {
  const { google, google_error: googleError } = params;
  if (google === 'success') {
    return {
      tone: 'success',
      title: 'You are signed in with Google.',
      message: 'Welcome to JB Mercantile. Taking you to your account…',
    };
  }
  if (google === 'linked') {
    return {
      tone: 'success',
      title: 'Google account linked.',
      message: 'You can now sign in with Google as well as your password.',
    };
  }
  switch (googleError) {
    case 'cancelled':
      return {
        tone: 'error',
        title: 'Google sign-in was cancelled',
        message: 'You did not approve the Google request. Try again when you are ready.',
      };
    case 'email_exists':
      return {
        tone: 'error',
        title: 'An account with this email already exists',
        message: 'Sign in with your password first, then link Google from Account → Security.',
      };
    case 'email_unverified':
      return {
        tone: 'error',
        title: 'Google could not verify this email',
        message: 'Use a verified Google account, or sign in with your password instead.',
      };
    case 'account_inactive':
      return {
        tone: 'error',
        title: 'Account unavailable',
        message: 'This account is currently unavailable. Contact support for help.',
      };
    case 'invalid_request':
      return {
        tone: 'error',
        title: 'This Google sign-in attempt expired',
        message: 'Please start again by selecting “Continue with Google”.',
      };
    case 'not_configured':
      return {
        tone: 'error',
        title: 'Google sign-in is not available',
        message: 'Please sign in with your email and password instead.',
      };
    case 'identity_taken':
      return {
        tone: 'error',
        title: 'This Google account is already linked elsewhere',
        message: 'Each Google account can only be linked to one JB Mercantile account. Contact support if you need help.',
      };
    case 'already_linked':
      return {
        tone: 'error',
        title: 'Google is already linked',
        message: 'This account already has a Google account linked to it.',
      };
    case 'link_failed':
      return {
        tone: 'error',
        title: 'Google linking did not complete',
        message: 'Your session changed during the request. Sign in again and retry from Account → Security.',
      };
    case 'provider_error':
      return {
        tone: 'error',
        title: 'Google sign-in is temporarily unavailable',
        message: 'Please try again in a moment, or use your email and password.',
      };
    case 'auth_failed':
      return {
        tone: 'error',
        title: 'Google sign-in could not be verified',
        message: 'Please try again, or sign in with your email and password.',
      };
    case undefined:
    case null:
    case '':
      return null;
    default:
      return {
        tone: 'error',
        title: 'Google sign-in did not complete',
        message: 'Please try again, or sign in with your email and password.',
      };
  }
}
