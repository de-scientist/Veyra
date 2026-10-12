import crypto from 'node:crypto';

import { OAuth2Client } from 'google-auth-library';

import { env } from './env.js';
import { HttpError } from './errors.js';
import { hashToken } from './auth.js';
import { prisma } from './prisma.js';

export const GOOGLE_PROVIDER = 'google';
export const GOOGLE_OAUTH_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_ALLOWED_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/** Only these scopes are requested: identity + email, nothing more. */
const GOOGLE_SCOPES = 'openid email profile';

/** OAuth transactions live 10 minutes and are single-use. */
const TRANSACTION_TTL_MS = 10 * 60 * 1000;

export type GoogleOperation = 'SIGN_IN' | 'LINK';

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName?: string;
  familyName?: string;
  fullName?: string;
}

export function isGoogleConfigured(): boolean {
  return activeConfig() !== null;
}

interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
}

let testClientConfig: GoogleClientConfig | null = null;

/**
 * Test seam so automated tests can simulate a configured Google client
 * without real credentials (unit tests never touch Google). Only settable
 * when NODE_ENV=test; production code paths always read real env vars.
 */
export function __setGoogleTestConfig(config: GoogleClientConfig | null): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Google test config is only available in test environments.');
  }
  testClientConfig = config;
}

function activeConfig(): GoogleClientConfig | null {
  if (testClientConfig) return testClientConfig;
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
  }
  return null;
}

function requireGoogleConfigured(): GoogleClientConfig {
  const config = activeConfig();
  if (!config) {
    throw new HttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured. Please use email and password.');
  }
  return config;
}

/**
 * Exact redirect URI registered in Google Cloud. Production requires an
 * explicit GOOGLE_REDIRECT_URI (fail closed — never guess a prod callback).
 */
export function getGoogleRedirectUri(): string {
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI;
  if (env.NODE_ENV === 'production') {
    throw new HttpError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured. Please use email and password.');
  }
  return 'http://localhost:3001/api/v1/auth/google/callback';
}

/**
 * Allowlisted frontend destination (path-only). Mirrors the web
 * `safeRedirectTarget` rule: same-origin absolute paths only, no scheme,
 * no protocol-relative URLs. Falls back to `/account`.
 */
export function safeRedirectPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) return '/account';
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return '/account';
  }
  if (!decoded.startsWith('/')) return '/account';
  if (decoded.startsWith('//')) return '/account';
  if (decoded.includes(':') || decoded.includes('\\')) return '/account';
  return decoded;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface CreatedTransaction {
  state: string;
  authorizeUrl: string;
}

export async function createOAuthTransaction(input: {
  operation: GoogleOperation;
  userId?: string;
  redirect?: unknown;
}): Promise<CreatedTransaction> {
  const { clientId } = requireGoogleConfigured();
  const redirectUri = getGoogleRedirectUri();

  const state = base64Url(crypto.randomBytes(32));
  const codeVerifier = base64Url(crypto.randomBytes(32));
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());
  const nonce = base64Url(crypto.randomBytes(16));
  const redirect = safeRedirectPath(input.redirect);

  await prisma.oAuthTransaction.create({
    data: {
      stateHash: hashToken(state),
      operation: input.operation,
      userId: input.userId ?? null,
      codeVerifier,
      nonce,
      redirect,
      expiresAt: new Date(Date.now() + TRANSACTION_TTL_MS),
    },
  });

  // Opportunistic cleanup of stale transactions (never blocks initiation).
  void prisma.oAuthTransaction
    .deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { consumedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) } }] } })
    .catch(() => undefined);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    nonce,
  });

  return { state, authorizeUrl: `${GOOGLE_OAUTH_AUTHORIZE_URL}?${params.toString()}` };
}

export interface ConsumedTransaction {
  id: string;
  operation: GoogleOperation;
  userId: string | null;
  codeVerifier: string;
  nonce: string;
  redirect: string;
}

/**
 * Single-use transaction consumption. Marks the row consumed only if it is
 * unconsumed and unexpired; anything else is rejected as invalid/expired/
 * reused. A SIGN_IN transaction can never serve as a LINK transaction —
 * callers must check `operation` (and `userId` for LINK) after consuming.
 */
export async function consumeOAuthTransaction(rawState: unknown): Promise<ConsumedTransaction> {
  if (typeof rawState !== 'string' || rawState.length === 0 || rawState.length > 512) {
    throw new HttpError(400, 'GOOGLE_INVALID_TRANSACTION', 'This Google sign-in attempt is invalid or expired. Please try again.');
  }
  const now = new Date();
  const consumed = await prisma.oAuthTransaction.updateMany({
    where: { stateHash: hashToken(rawState), consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  if (consumed.count !== 1) {
    throw new HttpError(400, 'GOOGLE_INVALID_TRANSACTION', 'This Google sign-in attempt is invalid or expired. Please try again.');
  }
  const row = await prisma.oAuthTransaction.findUnique({ where: { stateHash: hashToken(rawState) } });
  if (!row || (row.operation !== 'SIGN_IN' && row.operation !== 'LINK')) {
    throw new HttpError(400, 'GOOGLE_INVALID_TRANSACTION', 'This Google sign-in attempt is invalid or expired. Please try again.');
  }
  return {
    id: row.id,
    operation: row.operation as GoogleOperation,
    userId: row.userId,
    codeVerifier: row.codeVerifier,
    nonce: row.nonce,
    redirect: safeRedirectPath(row.redirect),
  };
}

export interface ExchangeInput {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  nonce: string;
}

type ExchangeFn = (input: ExchangeInput) => Promise<GoogleIdentity>;

let testExchangeHook: ExchangeFn | null = null;

/**
 * Test seam for deterministic automated tests (mocked provider responses —
 * unit tests never touch Google). Only settable when NODE_ENV=test.
 */
export function __setGoogleExchangeHook(fn: ExchangeFn | null): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Google test hook is only available in test environments.');
  }
  testExchangeHook = fn;
}

function checkIdentityClaims(payload: Record<string, unknown>, expectedNonce: string): GoogleIdentity {
  const issuer = payload.iss;
  if (typeof issuer !== 'string' || !GOOGLE_ALLOWED_ISSUERS.has(issuer)) {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  if (payload.nonce !== expectedNonce) {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  const sub = payload.sub;
  if (typeof sub !== 'string' || sub.length === 0) {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  const email = payload.email;
  if (typeof email !== 'string' || email.length === 0 || email.length > 320) {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  if (payload.email_verified !== true) {
    throw new HttpError(403, 'GOOGLE_EMAIL_UNVERIFIED', 'Google could not verify this email address. Use a verified Google account or sign in with your password.');
  }
  const identity: GoogleIdentity = { sub, email: email.toLowerCase(), emailVerified: true };
  if (typeof payload.given_name === 'string' && payload.given_name.length > 0) identity.givenName = payload.given_name.slice(0, 120);
  if (typeof payload.family_name === 'string' && payload.family_name.length > 0) identity.familyName = payload.family_name.slice(0, 120);
  if (typeof payload.name === 'string' && payload.name.length > 0) identity.fullName = payload.name.slice(0, 240);
  return identity;
}

/**
 * Exchanges the authorization code (PKCE) and verifies the ID token:
 * signature, issuer, audience/client ID, expiry (via google-auth-library)
 * plus nonce, stable `sub`, and verified email (checked here). Nothing
 * sensitive is logged; tokens never leave the backend.
 */
export async function exchangeCodeForIdentity(input: ExchangeInput): Promise<GoogleIdentity> {
  if (testExchangeHook) return testExchangeHook(input);
  const { clientId, clientSecret } = requireGoogleConfigured();
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri: input.redirectUri });
  let idToken: string | undefined;
  try {
    const { tokens } = await client.getToken({ code: input.code, codeVerifier: input.codeVerifier });
    idToken = tokens.id_token ?? undefined;
  } catch {
    throw new HttpError(502, 'GOOGLE_PROVIDER_ERROR', 'Google sign-in is temporarily unavailable. Please try again.');
  }
  if (!idToken) {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  let payload: Record<string, unknown>;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: clientId });
    payload = (ticket.getPayload() ?? {}) as Record<string, unknown>;
  } catch {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  return checkIdentityClaims(payload, input.nonce);
}

/** Shared by tests that exercise claim validation without network access. */
export function checkIdentityClaimsForTest(payload: Record<string, unknown>, expectedNonce: string): GoogleIdentity {
  return checkIdentityClaims(payload, expectedNonce);
}
