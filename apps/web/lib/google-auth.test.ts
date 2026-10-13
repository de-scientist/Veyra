import { afterEach, describe, expect, it, vi } from 'vitest';

import { getGoogleStatus, googleCallbackMessage, googleStartUrl } from './google-auth';

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it('builds the backend initiation URL with an encoded redirect', () => {
    const url = googleStartUrl('/checkout');
    expect(url).toContain('/api/v1/auth/google/start');
    expect(url).toContain(`redirect=${encodeURIComponent('/checkout')}`);
  });
});
