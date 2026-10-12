import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';
import {
  __setGoogleExchangeHook,
  __setGoogleTestConfig,
  checkIdentityClaimsForTest,
} from '../lib/googleAuth.js';
import { HttpError } from '../lib/errors.js';

/**
 * Google sign-in / registration suite (mocked provider — no network, no real
 * credentials). Covers initiation, callback, account resolution, linking,
 * unlinking, session reuse, and password-auth regressions.
 */
describe('google authentication', () => {
  const stamp = Date.now().toString(36);
  let app: FastifyInstance;
  let ipCounter = 21;
  const createdUserIds: string[] = [];

  // Controlled mock provider responses per test.
  let mockIdentity: { sub: string; email: string } | null = null;
  let mockError: { status: number; code: string } | null = null;

  /** Unique client IP per request so route rate limits never flake the suite. */
  function ip(): string {
    ipCounter += 1;
    return `10.200.0.${ipCounter}`;
  }

  function cookies(response: { headers: Record<string, unknown> }): string {
    const setCookies = response.headers['set-cookie'];
    const list = Array.isArray(setCookies) ? setCookies : setCookies ? [String(setCookies)] : [];
    return list.map((entry) => String(entry).split(';')[0]).join('; ');
  }

  function stateFromLocation(location: string): string {
    const url = new URL(location);
    expect(url.hostname).toBe('accounts.google.com');
    const state = url.searchParams.get('state');
    expect(state).toBeTruthy();
    return state as string;
  }

  async function makePasswordUser(email: string, password: string, status = 'ACTIVE'): Promise<{ id: string; cookie: string }> {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), firstName: 'Google', lastName: 'Tester', status: status as 'ACTIVE' },
    });
    createdUserIds.push(user.id);
    const rawToken = crypto.randomUUID();
    await prisma.session.create({ data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, cookie: `veyra_session=${rawToken}` };
  }

  async function startSignIn(redirect = '/account'): Promise<string> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/google/start?redirect=${encodeURIComponent(redirect)}`,
      remoteAddress: ip(),
    });
    expect(response.statusCode).toBe(302);
    const location = String(response.headers.location);
    return stateFromLocation(location);
  }

  async function callback(state: string, code = 'mock-code'): Promise<{ status: number; location: string; cookie: string }> {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`,
      remoteAddress: ip(),
    });
    return { status: response.statusCode, location: String(response.headers.location ?? ''), cookie: cookies(response) };
  }

  beforeAll(async () => {
    app = await buildApp();
    await prisma.role.upsert({ where: { slug: 'customer' }, update: {}, create: { name: 'Customer', slug: 'customer' } });
    __setGoogleTestConfig({ clientId: 'test-client-id', clientSecret: 'test-client-secret' });
    __setGoogleExchangeHook(async (input) => {
      if (mockError) {
        throw new HttpError(mockError.status, mockError.code, 'Mocked provider failure.');
      }
      if (!mockIdentity) throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'No mock identity configured.');
      // The hook must receive the server-side PKCE verifier + nonce (never
      // frontend input) and the exact registered redirect URI.
      expect(input.codeVerifier.length).toBeGreaterThan(20);
      expect(input.nonce.length).toBeGreaterThan(10);
      expect(input.redirectUri).toBe('http://localhost:3001/api/v1/auth/google/callback');
      return { sub: mockIdentity.sub, email: mockIdentity.email.toLowerCase(), emailVerified: true };
    });
  }, 60000);

  afterAll(async () => {
    __setGoogleExchangeHook(null);
    __setGoogleTestConfig(null);
    // Stamp-scoped cleanup: every fixture email in this file ends with
    // `-${stamp}@example.com`, including users auto-created by callbacks.
    const stamped = { email: { endsWith: `-${stamp}@example.com` } };
    const users = await prisma.user.findMany({ where: stamped, select: { id: true } });
    const ids = [...users.map((u) => u.id), ...createdUserIds];
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.oAuthTransaction.deleteMany({ where: { userId: { in: ids } } });
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('reports configuration status without exposing secrets', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/google/status', remoteAddress: ip() });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { configured: boolean } };
    expect(body.data.configured).toBe(true);
    expect(JSON.stringify(body)).not.toContain('secret');

    __setGoogleTestConfig(null);
    const off = await app.inject({ method: 'GET', url: '/api/v1/auth/google/status', remoteAddress: ip() });
    expect((off.json() as { data: { configured: boolean } }).data.configured).toBe(false);
    __setGoogleTestConfig({ clientId: 'test-client-id', clientSecret: 'test-client-secret' });
  });

  it('initiation redirects to Google with state, PKCE challenge, and nonce', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/auth/google/start?redirect=/account', remoteAddress: ip() });
    expect(response.statusCode).toBe(302);
    const url = new URL(String(response.headers.location));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toContain('openid');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect((url.searchParams.get('code_challenge') ?? '').length).toBeGreaterThan(20);
    expect((url.searchParams.get('nonce') ?? '').length).toBeGreaterThan(10);
    expect((url.searchParams.get('state') ?? '').length).toBeGreaterThan(20);
    const stored = await prisma.oAuthTransaction.findFirst({ where: { operation: 'SIGN_IN' }, orderBy: { createdAt: 'desc' } });
    expect(stored?.consumedAt).toBeNull();
  });

  it('rejects unregistered callback destinations', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/start?redirect=https://evil.example/phish',
      remoteAddress: ip(),
    });
    expect(response.statusCode).toBe(302);
    // Falls back to the allowlisted default instead of the attacker URL.
    expect(String(response.headers.location)).not.toContain('evil.example');
  });

  it('rejects unknown, reused, and cancelled flows safely', async () => {
    const unknown = await callback('not-a-real-state');
    expect(unknown.status).toBe(302);
    expect(unknown.location).toContain('google_error=invalid_request');
    expect(unknown.cookie).not.toContain('veyra_session');

    mockIdentity = { sub: `sub-replay-${stamp}`, email: `replay-${stamp}@example.com` };
    const state = await startSignIn();
    const first = await callback(state);
    expect(first.location).toContain('google=success');
    expect(first.cookie).toContain('veyra_session');
    const replay = await callback(state);
    expect(replay.status).toBe(302);
    expect(replay.location).toContain('google_error=invalid_request');

    const cancelled = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google/callback?error=access_denied&state=whatever',
      remoteAddress: ip(),
    });
    expect(cancelled.statusCode).toBe(302);
    expect(String(cancelled.headers.location)).toContain('google_error=cancelled');
  });

  it('registers a new Google customer with the customer role only', async () => {
    mockError = null;
    mockIdentity = { sub: `sub-new-${stamp}`, email: `new-google-${stamp}@example.com` };
    const result = await callback(await startSignIn());
    expect(result.status).toBe(302);
    expect(result.location).toContain('google=success');
    expect(result.cookie).toContain('veyra_session');

    const user = await prisma.user.findUnique({
      where: { email: `new-google-${stamp}@example.com` },
      include: { roles: { include: { role: true } }, oauthAccounts: true },
    });
    expect(user).toBeTruthy();
    if (user) createdUserIds.push(user.id);
    expect(user?.passwordHash).toBeNull();
    expect(user?.emailVerifiedAt).not.toBeNull();
    expect(user?.roles.map((r) => r.role.slug)).toEqual(['customer']);
    expect(user?.oauthAccounts).toHaveLength(1);
    expect(user?.oauthAccounts[0].providerSub).toBe(`sub-new-${stamp}`);

    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: result.cookie }, remoteAddress: ip() });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { data: { roles: string[] } }).data.roles).toEqual(['customer']);
  });

  it('signs a linked identity into the correct account on repeat login', async () => {
    mockIdentity = { sub: `sub-new-${stamp}`, email: `new-google-${stamp}@example.com` };
    const result = await callback(await startSignIn());
    expect(result.location).toContain('google=success');
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: result.cookie }, remoteAddress: ip() });
    expect((me.json() as { data: { user: { email: string } } }).data.user.email).toBe(`new-google-${stamp}@example.com`);
    const count = await prisma.user.count({ where: { email: `new-google-${stamp}@example.com` } });
    expect(count).toBe(1);
  });

  it('never auto-links an existing password account on email match', async () => {
    const email = `existing-${stamp}@example.com`;
    const { id } = await makePasswordUser(email, 'password123');
    mockIdentity = { sub: `sub-clash-${stamp}`, email };
    const result = await callback(await startSignIn());
    expect(result.status).toBe(302);
    expect(result.location).toContain('google_error=email_exists');
    expect(result.cookie).not.toContain('veyra_session');

    const links = await prisma.oAuthAccount.findMany({ where: { userId: id } });
    expect(links).toHaveLength(0);
    const stray = await prisma.oAuthAccount.findUnique({
      where: { provider_providerSub: { provider: 'google', providerSub: `sub-clash-${stamp}` } },
    });
    expect(stray).toBeNull();

    // Password authentication for the existing account is unaffected.
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'password123' },
      remoteAddress: ip(),
    });
    expect(login.statusCode).toBe(200);
  });

  it('rejects unverified Google emails and provider failures', async () => {
    mockError = { status: 403, code: 'GOOGLE_EMAIL_UNVERIFIED' };
    mockIdentity = { sub: `sub-unverified-${stamp}`, email: `unverified-${stamp}@example.com` };
    const denied = await callback(await startSignIn());
    expect(denied.location).toContain('google_error=email_unverified');
    expect(await prisma.user.findUnique({ where: { email: `unverified-${stamp}@example.com` } })).toBeNull();

    mockError = { status: 502, code: 'GOOGLE_PROVIDER_ERROR' };
    const down = await callback(await startSignIn());
    expect(down.location).toContain('google_error=provider_error');
    mockError = null;
  });

  it('blocks suspended accounts from Google sign-in', async () => {
    const email = `suspended-${stamp}@example.com`;
    const { id } = await makePasswordUser(email, 'password123', 'SUSPENDED');
    await prisma.oAuthAccount.create({
      data: { userId: id, provider: 'google', providerSub: `sub-suspended-${stamp}`, email, emailVerified: true },
    });
    mockError = null;
    mockIdentity = { sub: `sub-suspended-${stamp}`, email };
    const result = await callback(await startSignIn());
    expect(result.location).toContain('google_error=account_inactive');
    expect(result.cookie).not.toContain('veyra_session');
  });

  it('links Google from authenticated settings only after password reauth', async () => {
    const email = `linker-${stamp}@example.com`;
    const { id, cookie } = await makePasswordUser(email, 'password123');

    // Unauthenticated linking is rejected.
    const anon = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/link/start',
      payload: { currentPassword: 'password123' },
      remoteAddress: ip(),
    });
    expect(anon.statusCode).toBe(401);

    // Wrong/missing password is rejected (existing reauth convention).
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/link/start',
      payload: { currentPassword: 'wrong-password' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(wrong.statusCode).toBe(401);

    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/link/start',
      payload: { currentPassword: 'password123', redirect: '/account/security' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(started.statusCode).toBe(200);
    const linkState = stateFromLocation((started.json() as { data: { url: string } }).data.url);

    mockError = null;
    mockIdentity = { sub: `sub-link-${stamp}`, email: `linker-alt-${stamp}@example.com` };
    // Callback without the bound session must not link.
    const noSession = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=x&state=${encodeURIComponent(linkState)}`,
      remoteAddress: ip(),
    });
    expect(String(noSession.headers.location)).toContain('google_error=link_failed');
    expect(await prisma.oAuthAccount.findFirst({ where: { userId: id } })).toBeNull();

    // Correct flow: fresh LINK transaction + bound session completes.
    const started2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/link/start',
      payload: { currentPassword: 'password123', redirect: '/account/security' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(started2.statusCode).toBe(200);
    const linkState2 = stateFromLocation((started2.json() as { data: { url: string } }).data.url);
    const done = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=x&state=${encodeURIComponent(linkState2)}`,
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(String(done.headers.location)).toContain('google=linked');
    const link = await prisma.oAuthAccount.findFirst({ where: { userId: id, provider: 'google' } });
    expect(link?.providerSub).toBe(`sub-link-${stamp}`);

    // A SIGN_IN transaction can never bind a link: consuming one while
    // authenticated signs in (or fails closed) without touching link rows.
    const signInState = await startSignIn();
    const misuse = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=x&state=${encodeURIComponent(signInState)}`,
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(String(misuse.headers.location)).toMatch(/google=success|google_error=/);
    const linksAfter = await prisma.oAuthAccount.findMany({ where: { userId: id, provider: 'google' } });
    expect(linksAfter).toHaveLength(1);
    expect(linksAfter[0].providerSub).toBe(`sub-link-${stamp}`);

    const status = await app.inject({ method: 'GET', url: '/api/v1/auth/google/link/status', headers: { cookie }, remoteAddress: ip() });
    expect((status.json() as { data: { linked: boolean; hasPassword: boolean } }).data).toMatchObject({ linked: true, hasPassword: true });

    // The linked identity now signs into the same password account.
    mockIdentity = { sub: `sub-link-${stamp}`, email: `linker-alt-${stamp}@example.com` };
    const again = await callback(await startSignIn());
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: again.cookie }, remoteAddress: ip() });
    expect((me.json() as { data: { user: { email: string } } }).data.user.email).toBe(email);
  });

  it('rejects linking an identity that belongs to another account', async () => {
    const { cookie } = await makePasswordUser(`linker2-${stamp}@example.com`, 'password123');
    const started = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/link/start',
      payload: { currentPassword: 'password123' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(started.statusCode).toBe(200);
    const linkState = stateFromLocation((started.json() as { data: { url: string } }).data.url);
    // sub-link is already bound to the first linker account.
    mockError = null;
    mockIdentity = { sub: `sub-link-${stamp}`, email: `taken-${stamp}@example.com` };
    const result = await app.inject({
      method: 'GET',
      url: `/api/v1/auth/google/callback?code=x&state=${encodeURIComponent(linkState)}`,
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(String(result.headers.location)).toContain('google_error=identity_taken');
  });

  it('unlinks only with password reauth and never strands Google-only accounts', async () => {
    const { cookie } = await makePasswordUser(`unlinker-${stamp}@example.com`, 'password123');
    const me = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie }, remoteAddress: ip() });
    const userId = (me.json() as { data: { user: { id: string } } }).data.user.id;
    await prisma.oAuthAccount.create({
      data: { userId, provider: 'google', providerSub: `sub-unlink-${stamp}`, email: `unlinker-${stamp}@example.com`, emailVerified: true },
    });

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/unlink',
      payload: { currentPassword: 'nope-nope-nope' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(wrong.statusCode).toBe(401);

    const done = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/unlink',
      payload: { currentPassword: 'password123' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(done.statusCode).toBe(200);
    expect(await prisma.oAuthAccount.findFirst({ where: { userId, provider: 'google' } })).toBeNull();

    const repeat = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/unlink',
      payload: { currentPassword: 'password123' },
      headers: { cookie },
      remoteAddress: ip(),
    });
    expect(repeat.statusCode).toBe(404);

    // Google-only account (no password): unlink would lock the customer out.
    mockError = null;
    mockIdentity = { sub: `sub-only-${stamp}`, email: `only-${stamp}@example.com` };
    const created = await callback(await startSignIn());
    const onlyMe = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: created.cookie }, remoteAddress: ip() });
    expect(onlyMe.statusCode).toBe(200);
    const locked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/unlink',
      payload: { currentPassword: 'password123' },
      headers: { cookie: created.cookie },
      remoteAddress: ip(),
    });
    expect(locked.statusCode).toBe(400);
    expect((locked.json() as { error: { code: string } }).error.code).toBe('GOOGLE_UNLINK_LOCKOUT');
  });

  it('keeps password authentication behavior intact', async () => {
    const email = `regression-${stamp}@example.com`;
    await makePasswordUser(email, 'password123');

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'password123' },
      remoteAddress: ip(),
    });
    expect(login.statusCode).toBe(200);

    // Google-only accounts cannot authenticate with a password.
    mockError = null;
    mockIdentity = { sub: `sub-nopw-${stamp}`, email: `nopw-${stamp}@example.com` };
    await callback(await startSignIn());
    const noPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `nopw-${stamp}@example.com`, password: 'password123' },
      remoteAddress: ip(),
    });
    expect(noPassword.statusCode).toBe(401);

    // ...and have no password to change.
    const onlyUser = await prisma.user.findUnique({ where: { email: `nopw-${stamp}@example.com` } });
    if (onlyUser) {
      const rawToken = crypto.randomUUID();
      await prisma.session.create({ data: { userId: onlyUser.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) } });
      const change = await app.inject({
        method: 'POST',
        url: '/api/v1/account/security/password',
        payload: { currentPassword: 'x', newPassword: 'newpassword123', confirmPassword: 'newpassword123' },
        headers: { cookie: `veyra_session=${rawToken}` },
        remoteAddress: ip(),
      });
      expect(change.statusCode).toBe(400);
      expect((change.json() as { error: { code: string } }).error.code).toBe('NO_PASSWORD_SET');
    }
  });

  it('validates identity claims without trusting unverified tokens', () => {
    const base = {
      iss: 'https://accounts.google.com',
      sub: 'abc',
      email: 'User@Example.COM',
      email_verified: true,
      nonce: 'n-1',
    };
    const ok = checkIdentityClaimsForTest(base, 'n-1');
    expect(ok.sub).toBe('abc');
    // Emails are normalized consistently with existing account rules.
    expect(ok.email).toBe('user@example.com');

    expect(() => checkIdentityClaimsForTest({ ...base, iss: 'https://evil.example' }, 'n-1')).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_AUTH_FAILED' }),
    );
    expect(() => checkIdentityClaimsForTest({ ...base, nonce: 'wrong' }, 'n-1')).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_AUTH_FAILED' }),
    );
    expect(() => checkIdentityClaimsForTest({ ...base, sub: '' }, 'n-1')).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_AUTH_FAILED' }),
    );
    expect(() => checkIdentityClaimsForTest({ ...base, email_verified: false }, 'n-1')).toThrowError(
      expect.objectContaining({ code: 'GOOGLE_EMAIL_UNVERIFIED' }),
    );
  });
});
