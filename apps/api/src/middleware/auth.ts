import type { FastifyReply, FastifyRequest } from 'fastify';

import { hashToken } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import {
  getUserPermissionSlugs,
  isFinancialSlug,
  isOperationsSlug,
  isSuperAdminSlug,
  roleSlugsOf,
  userHasPermissionSlugs,
  type RoleEntry,
} from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';

const authCookieName = 'veyra_session';

type AuthedUser = {
  id: string;
  status?: string;
  roles?: RoleEntry[];
};

export function getRequestUser(request: FastifyRequest): AuthedUser | undefined {
  return (request as FastifyRequest & { user?: AuthedUser }).user;
}

/**
 * Account-status enforcement. Only ACTIVE users may authenticate.
 * Suspended/deleted/deactivated accounts keep their rows (history-preserving)
 * but every session is denied here — suspending a user revokes access
 * immediately without needing to hunt down their sessions.
 */
export function assertUserActive(user: AuthedUser | undefined): asserts user is AuthedUser & { id: string } {
  if (!user) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }
  const status = (user.status ?? 'ACTIVE').toUpperCase();
  if (status === 'SUSPENDED') {
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended.');
  }
  if (status === 'DELETED') {
    throw new HttpError(403, 'ACCOUNT_DELETED', 'This account is no longer available.');
  }
  if (status !== 'ACTIVE') {
    throw new HttpError(403, 'ACCOUNT_INACTIVE', 'This account is not active.');
  }
}

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply) {
  const rawCookieHeader = request.headers.cookie;

  if (!rawCookieHeader) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }

  const sessionCookie = rawCookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${authCookieName}=`));

  if (!sessionCookie) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }

  const sessionToken = decodeURIComponent(sessionCookie.slice(`${authCookieName}=`.length));
  const session = await prisma.session.findFirst({
    where: {
      tokenHash: hashToken(sessionToken),
      revokedAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: {
        include: {
          roles: {
            include: {
              role: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  }

  assertUserActive(session.user as AuthedUser);

  Object.assign(request, { user: session.user, session });
}

export async function requireRole(request: FastifyRequest, role: string, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getRequestUser(request);
  assertUserActive(user);

  if (!user || !roleSlugsOf(user.roles ?? []).includes(role.toLowerCase())) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
  }
}

function denyForbidden(message: string): never {
  throw new HttpError(403, 'FORBIDDEN', message);
}

export async function requireOperationsAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getRequestUser(request);
  const allowed = (user?.roles ?? []).some((entry) => isOperationsSlug(entry.role?.slug));
  if (!allowed) denyForbidden('Operations access is restricted to authorized staff.');
}

export async function requireFinancialAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getRequestUser(request);
  const allowed = (user?.roles ?? []).some((entry) => isFinancialSlug(entry.role?.slug));
  if (!allowed) denyForbidden('Financial operations require administrator access.');
}

export async function requireAdminAccess(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getRequestUser(request);
  const allowed = (user?.roles ?? []).some((entry) => isFinancialSlug(entry.role?.slug));
  if (!allowed) denyForbidden('This operation requires administrator access.');
}

/**
 * Highest-privilege gate. Still requires authentication AND an active
 * account — it checks the server-loaded role membership, never any
 * client-supplied value.
 */
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = getRequestUser(request);
  const allowed = (user?.roles ?? []).some((entry) => isSuperAdminSlug(entry.role?.slug));
  if (!allowed) denyForbidden('This operation requires super-administrator access.');
}

/**
 * Granular permission guard, resolved DB-authoritatively from
 * `RolePermission` rows on every request (no stale grants).
 */
export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(request, reply);
    const user = getRequestUser(request);
    assertUserActive(user);
    const granted = await getUserPermissionSlugs(user.id);
    if (!userHasPermissionSlugs(granted, permissions)) {
      denyForbidden('You do not have permission to access this resource.');
    }
  };
}
