import crypto from 'node:crypto';

import { z } from 'zod';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import { env } from '../lib/env.js';
import { authLimit } from '../lib/rateLimits.js';
import { hashPassword, hashToken, verifyPassword } from '../lib/auth.js';
import { HttpError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const authCookieName = 'veyra_session';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).trim(),
  lastName: z.string().min(1).trim(),
  phone: z.string().trim().optional().or(z.literal('')),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

function getCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  };
}

function serializeUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  status?: string;
  emailVerifiedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? null,
    avatarUrl: user.avatarUrl ?? null,
    status: user.status ?? 'ACTIVE',
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt ?? new Date(),
    updatedAt: user.updatedAt ?? new Date(),
  };
}

function parseSessionTokenFromRequest(request: FastifyRequest): string | undefined {
  const rawCookieHeader = request.headers.cookie;

  if (!rawCookieHeader) {
    return undefined;
  }

  const cookieEntries = rawCookieHeader.split(';').map((entry) => entry.trim());
  const sessionCookie = cookieEntries.find((entry) => entry.startsWith(`${authCookieName}=`));

  if (!sessionCookie) {
    return undefined;
  }

  return decodeURIComponent(sessionCookie.slice(`${authCookieName}=`.length));
}

async function createSession(userId: string, userAgent: string | undefined, ipAddress: string | undefined) {
  const sessionToken = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(sessionToken),
      expiresAt,
      userAgent: userAgent ?? null,
      ipAddress: ipAddress ?? null,
    },
  });

  return sessionToken;
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', authLimit(), async (request, reply) => {
    const payload = registerSchema.parse(request.body);
    const normalizedEmail = payload.email.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new HttpError(409, 'USER_EXISTS', 'A user with this email already exists.');
    }

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: await hashPassword(payload.password),
        firstName: payload.firstName,
        lastName: payload.lastName,
        phone: payload.phone && payload.phone.length > 0 ? payload.phone : null,
      },
    });

    const customerRole = await prisma.role.findUnique({
      where: { slug: 'customer' },
    });

    if (customerRole) {
      await prisma.userRole.upsert({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: customerRole.id,
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: customerRole.id,
        },
      });
    }

    const sessionToken = await createSession(
      user.id,
      request.headers['user-agent'] ?? undefined,
      request.ip,
    );

    reply.setCookie(authCookieName, sessionToken, getCookieOptions());

    return {
      success: true,
      data: {
        user: serializeUser(user),
      },
    };
  });

  app.post('/auth/login', authLimit(), async (request, reply) => {
    const payload = loginSchema.parse(request.body);
    const normalizedEmail = payload.email.toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        roles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!user || !(await verifyPassword(payload.password, user.passwordHash))) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }

    const sessionToken = await createSession(
      user.id,
      request.headers['user-agent'] ?? undefined,
      request.ip,
    );

    reply.setCookie(authCookieName, sessionToken, getCookieOptions());

    return {
      success: true,
      data: {
        user: serializeUser(user),
        roles: user.roles.map((entry: { role: { slug: string } }) => entry.role.slug),
      },
    };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = parseSessionTokenFromRequest(request);

    if (token) {
      const hash = hashToken(token);

      await prisma.session.updateMany({
        where: {
          tokenHash: hash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    reply.clearCookie(authCookieName, { path: '/' });

    return {
      success: true,
      data: {
        loggedOut: true,
      },
    };
  });

  app.get('/auth/me', async (request) => {
    const token = parseSessionTokenFromRequest(request);

    if (!token) {
      throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
    }

    const session = await prisma.session.findFirst({
      where: {
        tokenHash: hashToken(token),
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

    return {
      success: true,
      data: {
        user: serializeUser(session.user),
        roles: session.user.roles.map((entry: { role: { slug: string } }) => entry.role.slug),
      },
    };
  });
}
