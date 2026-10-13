import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../lib/env.js';
import { authLimit } from '../lib/rateLimits.js';
import { hashToken, verifyPassword } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { assertUserActive, getRequestUser, requireAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { createSession, getCookieOptions, parseSessionTokenFromRequest, serializeUser } from './auth.js';
import {
  GOOGLE_PROVIDER,
  consumeOAuthTransaction,
  createOAuthTransaction,
  exchangeCodeForIdentity,
  getGoogleRedirectUri,
  isGoogleConfigured,
  safeRedirectPath,
  type GoogleIdentity,
} from '../lib/googleAuth.js';

const authCookieName = 'veyra_session';

const linkStartSchema = z.object({
  currentPassword: z.string().max(128).optional(),
  redirect: z.string().max(512).optional(),
});

const unlinkSchema = z.object({
  currentPassword: z.string().min(1).max(128),
});

function frontendBase(): string {
  return env.APP_URL.replace(/\/$/, '');
}

/** Browser-facing redirects carry only a status code — never account details. */
function redirectWithStatus(reply: FastifyReply, redirect: string, param: string): FastifyReply {
  return reply.redirect(302, `${frontendBase()}${safeRedirectPath(redirect)}?${param}`);
}

function redirectWithError(reply: FastifyReply, redirect: string, code: string): FastifyReply {
  return redirectWithStatus(reply, redirect, `google_error=${encodeURIComponent(code)}`);
}

function redirectWithSuccess(reply: FastifyReply, redirect: string, code: string): FastifyReply {
  return redirectWithStatus(reply, redirect, `google=${encodeURIComponent(code)}`);
}

function startSession(reply: FastifyReply, userId: string, request: FastifyRequest) {
  return createSession(userId, request.headers['user-agent'] ?? undefined, request.ip).then((sessionToken) => {
    reply.setCookie(authCookieName, sessionToken, getCookieOptions());
  });
}

/** Loads the current cookie session for callback binding checks (null when absent/invalid). */
async function loadCallbackSession(request: FastifyRequest) {
  const token = parseSessionTokenFromRequest(request);
  if (!token) return null;
  const session = await prisma.session.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    include: { user: { include: { roles: { include: { role: true } } } } },
  });
  if (!session) return null;
  try {
    assertUserActive(session.user);
  } catch {
    return null;
  }
  return session;
}

function splitName(identity: GoogleIdentity): { firstName: string; lastName: string } {
  if (identity.givenName || identity.familyName) {
    return {
      firstName: (identity.givenName ?? 'Customer').slice(0, 120) || 'Customer',
      lastName: (identity.familyName ?? 'Account').slice(0, 120) || 'Account',
    };
  }
  const parts = (identity.fullName ?? '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { firstName: parts[0].slice(0, 120), lastName: parts.slice(1).join(' ').slice(0, 120) };
  }
  if (parts.length === 1) {
    return { firstName: parts[0].slice(0, 120), lastName: 'Account' };
  }
  return { firstName: 'Customer', lastName: 'Account' };
}

async function assignCustomerRole(userId: string): Promise<void> {
  const customerRole = await prisma.role.findUnique({ where: { slug: 'customer' } });
  if (!customerRole) return;
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: customerRole.id } },
    update: {},
    create: { userId, roleId: customerRole.id },
  });
}

async function serializeSessionUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: { include: { role: true } } },
  });
  if (!user) {
    throw new HttpError(401, 'GOOGLE_AUTH_FAILED', 'Google sign-in could not be verified. Please try again.');
  }
  assertUserActive(user);
  return {
    user: serializeUser(user),
    roles: user.roles.map((entry: { role: { slug: string } }) => entry.role.slug),
  };
}

export async function googleAuthRoutes(app: FastifyInstance) {
  // Public: lets the login/register UI preflight Google availability so a
  // start failure shows a friendly inline message. The button itself is
  // always rendered; this status never gates its visibility.
  app.get('/auth/google/status', async () => {
    return { success: true, data: { configured: isGoogleConfigured() } };
  });

  // Step 1 (sign-in / registration): creates a short-lived SIGN_IN
  // transaction and redirects the browser to Google. Failures redirect to
  // the frontend with a safe status code rather than rendering raw JSON.
  app.get('/auth/google/start', authLimit(), async (request, reply) => {
    const redirect = safeRedirectPath((request.query as { redirect?: unknown } | undefined)?.redirect);
    try {
      getGoogleRedirectUri();
      const { authorizeUrl } = await createOAuthTransaction({ operation: 'SIGN_IN', redirect });
      return reply.redirect(302, authorizeUrl);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'GOOGLE_NOT_CONFIGURED') {
        return redirectWithError(reply, redirect, 'not_configured');
      }
      throw error;
    }
  });

  // Step 2: Google returns the authorization code here. The transaction is
  // consumed single-use, the code is exchanged with PKCE, the ID token is
  // verified, and the JB Mercantile cookie session is created on success.
  app.get('/auth/google/callback', authLimit(), async (request, reply) => {
    const query = (request.query ?? {}) as { code?: unknown; state?: unknown; error?: unknown };
    const fallbackRedirect = '/account';

    if (typeof query.error === 'string' && query.error.length > 0) {
      // Provider-side cancellation/failure (e.g. access_denied). Nothing to
      // consume; send the customer back with a safe, generic status.
      const code = query.error === 'access_denied' ? 'cancelled' : 'provider_error';
      return redirectWithError(reply, fallbackRedirect, code);
    }

    if (typeof query.code !== 'string' || query.code.length === 0 || query.code.length > 4096) {
      return redirectWithError(reply, fallbackRedirect, 'invalid_request');
    }

    let transaction;
    try {
      transaction = await consumeOAuthTransaction(query.state);
    } catch {
      return redirectWithError(reply, fallbackRedirect, 'invalid_request');
    }

    let identity: GoogleIdentity;
    try {
      identity = await exchangeCodeForIdentity({
        code: query.code,
        codeVerifier: transaction.codeVerifier,
        redirectUri: getGoogleRedirectUri(),
        nonce: transaction.nonce,
      });
    } catch (error) {
      if (error instanceof HttpError && error.code === 'GOOGLE_EMAIL_UNVERIFIED') {
        return redirectWithError(reply, transaction.redirect, 'email_unverified');
      }
      if (error instanceof HttpError && error.code === 'GOOGLE_PROVIDER_ERROR') {
        return redirectWithError(reply, transaction.redirect, 'provider_error');
      }
      return redirectWithError(reply, transaction.redirect, 'auth_failed');
    }

    if (transaction.operation === 'LINK') {
      return handleLinkCallback(request, reply, transaction, identity);
    }
    return handleSignInCallback(request, reply, transaction.redirect, identity);
  });

  // Authenticated: current Google-link status for account settings.
  app.get('/auth/google/link/status', { preHandler: requireAuth }, async (request) => {
    const current = getRequestUser(request);
    const link = await prisma.oAuthAccount.findFirst({
      where: { userId: (current as { id: string }).id, provider: GOOGLE_PROVIDER },
    });
    const user = await prisma.user.findUnique({
      where: { id: (current as { id: string }).id },
      select: { passwordHash: true },
    });
    return {
      success: true,
      data: {
        linked: Boolean(link),
        email: link?.email ?? null,
        hasPassword: Boolean(user?.passwordHash),
      },
    };
  });

  // Authenticated: start a LINK transaction bound to the current account.
  // Password accounts must reauthenticate with their current password
  // (existing security convention); Google-only accounts use the session.
  app.post('/auth/google/link/start', { preHandler: requireAuth, ...authLimit() }, async (request) => {
    const current = getRequestUser(request);
    const userId = (current as { id: string }).id;
    const payload = linkStartSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, passwordHash: true },
    });
    assertUserActive(user ?? undefined);

    const existing = await prisma.oAuthAccount.findFirst({ where: { userId, provider: GOOGLE_PROVIDER } });
    if (existing) {
      throw new HttpError(409, 'GOOGLE_ALREADY_LINKED', 'A Google account is already linked to this account.');
    }

    if (user?.passwordHash) {
      if (!payload.currentPassword || !(await verifyPassword(payload.currentPassword, user.passwordHash))) {
        throw new HttpError(401, 'INVALID_PASSWORD', 'Enter your current password to link a Google account.');
      }
    }

    getGoogleRedirectUri();
    const { authorizeUrl } = await createOAuthTransaction({
      operation: 'LINK',
      userId,
      redirect: payload.redirect ?? '/account/security',
    });
    return { success: true, data: { url: authorizeUrl, expiresIn: 600 } };
  });

  // Authenticated: remove the Google link. Refused when no password would
  // remain (prevents lockout) and requires current-password reauthentication.
  app.post('/auth/google/unlink', { preHandler: requireAuth, ...authLimit() }, async (request) => {
    const current = getRequestUser(request);
    const userId = (current as { id: string }).id;
    const payload = unlinkSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, passwordHash: true },
    });
    assertUserActive(user ?? undefined);

    const link = await prisma.oAuthAccount.findFirst({ where: { userId, provider: GOOGLE_PROVIDER } });
    if (!link) {
      throw new HttpError(404, 'GOOGLE_NOT_LINKED', 'No Google account is linked to this account.');
    }
    if (!user?.passwordHash || !(await verifyPassword(payload.currentPassword, user.passwordHash))) {
      if (!user?.passwordHash) {
        throw new HttpError(400, 'GOOGLE_UNLINK_LOCKOUT', 'Set an account password before unlinking Google, otherwise you would be locked out.');
      }
      throw new HttpError(401, 'INVALID_PASSWORD', 'Your current password is incorrect.');
    }

    await prisma.oAuthAccount.delete({ where: { id: link.id } });
    await prisma.auditLog.create({ data: { actorId: userId, action: 'GOOGLE_UNLINKED', entity: 'User', entityId: userId } });
    return { success: true, data: { unlinked: true } };
  });
}

async function handleSignInCallback(
  request: FastifyRequest,
  reply: FastifyReply,
  redirect: string,
  identity: GoogleIdentity,
) {
  // 1. Known provider identity always wins — resolve through the stable `sub`.
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: { provider_providerSub: { provider: GOOGLE_PROVIDER, providerSub: identity.sub } },
  });
  if (existingLink) {
    try {
      await serializeSessionUser(existingLink.userId);
    } catch (error) {
      if (error instanceof HttpError && error.code.startsWith('ACCOUNT_')) {
        return redirectWithError(reply, redirect, 'account_inactive');
      }
      throw error;
    }
    await startSession(reply, existingLink.userId, request);
    return redirectWithSuccess(reply, redirect, 'success');
  }

  // 2. Email match on an unlinked account: NEVER auto-link or merge. No
  // session is created; the customer signs in with the existing method and
  // links Google from authenticated account settings.
  const emailOwner = await prisma.user.findUnique({ where: { email: identity.email } });
  if (emailOwner) {
    return redirectWithError(reply, redirect, 'email_exists');
  }

  // 3. New customer: create the ordinary customer account, bind the verified
  // identity, then establish the session. Customer role only — staff/admin
  // can never be granted through Google.
  const { firstName, lastName } = splitName(identity);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: identity.email,
          passwordHash: null,
          firstName,
          lastName,
          emailVerifiedAt: new Date(),
        },
      });
      await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: GOOGLE_PROVIDER,
          providerSub: identity.sub,
          email: identity.email,
          emailVerified: true,
        },
      });
      return user;
    });
    await assignCustomerRole(created.id);
    await prisma.auditLog.create({ data: { actorId: created.id, action: 'GOOGLE_LINKED', entity: 'User', entityId: created.id } });
    await startSession(reply, created.id, request);
    return redirectWithSuccess(reply, redirect, 'success');
  } catch (error) {
    // Concurrent duplicate (same sub or email raced us): re-resolve through
    // the provider identity instead of creating a second account.
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') {
      const raced = await prisma.oAuthAccount.findUnique({
        where: { provider_providerSub: { provider: GOOGLE_PROVIDER, providerSub: identity.sub } },
      });
      if (raced) {
        try {
          await serializeSessionUser(raced.userId);
        } catch (statusError) {
          if (statusError instanceof HttpError && statusError.code.startsWith('ACCOUNT_')) {
            return redirectWithError(reply, redirect, 'account_inactive');
          }
          throw statusError;
        }
        await startSession(reply, raced.userId, request);
        return redirectWithSuccess(reply, redirect, 'success');
      }
      return redirectWithError(reply, redirect, 'email_exists');
    }
    throw error;
  }
}

async function handleLinkCallback(
  request: FastifyRequest,
  reply: FastifyReply,
  transaction: { userId: string | null; redirect: string },
  identity: GoogleIdentity,
) {
  // The target account comes from the server-side transaction, never from
  // frontend input — and the live session must still belong to it.
  if (!transaction.userId) {
    return redirectWithError(reply, transaction.redirect, 'link_failed');
  }
  const session = await loadCallbackSession(request);
  if (!session || session.user.id !== transaction.userId) {
    return redirectWithError(reply, transaction.redirect, 'link_failed');
  }

  // The Google identity must not already be linked to a different account.
  const conflicting = await prisma.oAuthAccount.findUnique({
    where: { provider_providerSub: { provider: GOOGLE_PROVIDER, providerSub: identity.sub } },
  });
  if (conflicting) {
    return redirectWithError(reply, transaction.redirect, conflicting.userId === transaction.userId ? 'already_linked' : 'identity_taken');
  }

  try {
    await prisma.oAuthAccount.create({
      data: {
        userId: transaction.userId,
        provider: GOOGLE_PROVIDER,
        providerSub: identity.sub,
        email: identity.email,
        emailVerified: true,
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && (error as { code?: string }).code === 'P2002') {
      return redirectWithError(reply, transaction.redirect, 'identity_taken');
    }
    throw error;
  }

  await prisma.auditLog.create({ data: { actorId: transaction.userId, action: 'GOOGLE_LINKED', entity: 'User', entityId: transaction.userId } });
  // Existing session is preserved — linking never swaps or mints sessions.
  return redirectWithSuccess(reply, transaction.redirect, 'linked');
}
