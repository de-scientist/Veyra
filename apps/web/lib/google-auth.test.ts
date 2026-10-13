import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkGoogleStart,
  getGoogleStatus,
  googleCallbackMessage,
  googleStartErrorMessage,
  logGoogleDiagnostic,
  googleStartUrl,
  type GoogleCallbackAlert,
} from './google-auth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Customer copy must never leak internals, endpoints, or config names. */
function expectCustomerSafe(alert: GoogleCallbackAlert | null) {
  expect(alert).not.toBeNull();
  const text = `${alert?.title} ${alert?.message}`;
  for (const leaked of [
    'GOOGLE_',
    'NEXT_PUBLIC',
    'VITE_',
    'env',
    'secret',
    'token',
    'cookie',
    'nonce',
    'state value',
    'PKCE',
    'verifier',
    'http',
    'api/v1',
    'prisma',
    'sql',
    '.ts',
    'undefined',
    'null',
  ]) {
    expect(text.toLowerCase()).not.toContain(leaked.toLowerCase());
  }
}

describe('google callback messages', () => {
  it('returns null when no callback params are present', () => {
    expect(googleCallbackMessage({ google: null, google_error: null })).toBeNull();
    expect(googleCallbackMessage({})).toBeNull();
  });

  it('confirms successful sign-in and linking', () => {
    expect(googleCallbackMessage({ google: 'success', google_error: null })?.tone).toBe('success');
    expect(googleCallbackMessage({ google: 'linked', google_error: null })?.tone).toBe('success');
  });

  it('explains email conflicts without revealing account details', () => {
    const alert = googleCallbackMessage({ google: null, google_error: 'email_exists' });
    expect(alert?.tone).toBe('error');
    expect(`${alert?.title} ${alert?.message}`).toMatch(/password/i);
    // Never echoes identifiers from the URL.
    expect(JSON.stringify(alert)).not.toContain('@');
  });

  it('covers cancellation, expiry, and provider failures safely', () => {
    for (const code of ['cancelled', 'invalid_request', 'auth_failed', 'provider_error', 'not_configured', 'account_inactive', 'email_unverified', 'identity_taken', 'already_linked', 'link_failed']) {
      const alert = googleCallbackMessage({ google: null, google_error: code });
      expect(alert?.tone).toBe('error');
      expect(alert?.message.length).toBeGreaterThan(10);
    }
  });

  it('falls back to a generic message for unknown codes', () => {
    const alert = googleCallbackMessage({ google: null, google_error: 'something_new' });
    expect(alert?.tone).toBe('error');
    expect(alert?.title).toBe('Google sign-in did not complete');
  });

  it('reports genuine backend configuration without modification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { configured: true } }), { status: 200 })));
    await expect(getGoogleStatus()).resolves.toEqual({ configured: true });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { configured: false } }), { status: 200 })));
    await expect(getGoogleStatus()).resolves.toEqual({ configured: false });
  });

  it('never masquerades a failed status request as unconfigured', async () => {
    // Network failure must throw so the UI shows "unreachable" diagnostics
    // instead of silently hiding the button as if OAuth were off.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch failed');
    }));
    await expect(getGoogleStatus()).rejects.toThrow();
    // HTTP errors must throw too — a 500 is not proof of "not configured".
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false, error: { code: 'INTERNAL', message: 'boom' } }), { status: 500 })));
    await expect(getGoogleStatus()).rejects.toThrow();
  });

  it('keeps every callback message customer-safe', () => {
    for (const code of [
      'cancelled',
      'email_exists',
      'email_unverified',
      'account_inactive',
      'invalid_request',
      'not_configured',
      'identity_taken',
      'already_linked',
      'link_failed',
      'provider_error',
      'auth_failed',
      'something_new',
    ]) {
      expectCustomerSafe(googleCallbackMessage({ google: null, google_error: code }));
    }
    expectCustomerSafe(googleCallbackMessage({ google: 'success', google_error: null }));
  });

  it('maps start-flow failures to friendly customer messages', () => {
    const unavailable = googleStartErrorMessage('unconfigured');
    expect(unavailable.tone).toBe('error');
    expect(`${unavailable.title} ${unavailable.message}`).toMatch(/temporarily unavailable/i);
    expectCustomerSafe(unavailable);

    const offline = googleStartErrorMessage('unreachable');
    expect(`${offline.title} ${offline.message}`).toMatch(/internet connection/i);
    expectCustomerSafe(offline);

    const broken = googleStartErrorMessage('server');
    expect(`${broken.title} ${broken.message}`).toMatch(/went wrong|try again/i);
    expectCustomerSafe(broken);
  });

  it('preflights the start flow without hiding the button', async () => {
    // Configured → proceed to the existing backend redirect flow.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { configured: true } }), { status: 200 })));
    expect(await checkGoogleStart()).toEqual({ ok: true });

    // Explicitly unconfigured → friendly failure, button stays visible.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: true, data: { configured: false } }), { status: 200 })));
    expect(await checkGoogleStart()).toEqual({ ok: false, kind: 'unconfigured' });

    // Network failure → unreachable (never masquerades as unconfigured).
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('fetch failed');
    }));
    expect(await checkGoogleStart()).toEqual({ ok: false, kind: 'unreachable' });

    // Backend error → server kind with sanitized status/code only.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false, error: { code: 'INTERNAL', message: 'boom' } }), { status: 500 }),
      ),
    );
    expect(await checkGoogleStart()).toEqual({ ok: false, kind: 'server', status: 500, code: 'INTERNAL' });
  });

  it('logs sanitized diagnostics in development only', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    vi.stubEnv('NODE_ENV', 'development');
    logGoogleDiagnostic({ action: 'google-start', kind: 'server', status: 500, code: 'INTERNAL' });
    expect(info).toHaveBeenCalledTimes(1);
    const payload = JSON.stringify(info.mock.calls[0]);
    expect(payload).toContain('google-start');
    // Sanitized: no URLs, secrets, tokens, or personal data.
    for (const leaked of ['http', 'secret', 'token', 'cookie', 'nonce', 'verifier', 'authorize', 'redirect']) {
      expect(payload.toLowerCase()).not.toContain(leaked);
    }

    vi.stubEnv('NODE_ENV', 'production');
    logGoogleDiagnostic({ action: 'google-start', kind: 'unreachable' });
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('builds the backend initiation URL with an encoded redirect', () => {
    const url = googleStartUrl('/checkout');
    expect(url).toContain('/api/v1/auth/google/start');
    expect(url).toContain(`redirect=${encodeURIComponent('/checkout')}`);
  });
});
