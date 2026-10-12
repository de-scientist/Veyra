import { describe, expect, it } from 'vitest';

import { googleCallbackMessage, googleStartUrl } from './google-auth';

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

  it('builds the backend initiation URL with an encoded redirect', () => {
    const url = googleStartUrl('/checkout');
    expect(url).toContain('/api/v1/auth/google/start');
    expect(url).toContain(`redirect=${encodeURIComponent('/checkout')}`);
  });
});
