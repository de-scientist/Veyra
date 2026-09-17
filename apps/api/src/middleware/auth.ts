import type { FastifyReply, FastifyRequest } from 'fastify';

import { hashToken } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const authCookieName = 'veyra_session';

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
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

  Object.assign(request, { user: session.user, session });
}

export async function requireRole(request: FastifyRequest, role: string, reply: FastifyReply) {
  await requireAuth(request, reply);
  const user = (request as FastifyRequest & { user?: { roles?: Array<{ role?: { slug?: string | null } }> } }).user;

  if (!user || !user.roles?.some((entry) => entry.role?.slug?.toLowerCase() === role.toLowerCase())) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to access this resource.');
  }
}
