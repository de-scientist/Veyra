import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

/**
 * Last-super-admin lifecycle protection.
 *
 * POST /account/deactivate and POST /account/delete derive identity solely
 * from the session (no client user ID or role is read), keep the soft-only
 * lifecycle (INACTIVE / DELETED + deletedAt, rows retained, sessions revoked,
 * audit rows written), and now refuse to remove the final usable (ACTIVE +
 * super-admin grant) account with 409 LAST_SUPER_ADMIN. The guard check runs
 * inside the mutation transaction under a PostgreSQL advisory lock, so
 * concurrent lifecycle operations serialize instead of racing.
 *
 * Lifecycle POSTs are rate-limited per IP (shared 127.0.0.1 in tests), so
 * this file stays well under budget: eight mutation calls total.
 */

let app: FastifyInstance;

const stamp = `salifecycle-${Date.now().toString(36)}`;
const emails = {
  soleDeactivate: `${stamp}-sole-deactivate@example.com`,
  soleDelete: `${stamp}-sole-delete@example.com`,
  keeperA: `${stamp}-keeper-a@example.com`,
  keeperB: `${stamp}-keeper-b@example.com`,
  customerDeactivate: `${stamp}-customer-deactivate@example.com`,
  customerDelete: `${stamp}-customer-delete@example.com`,
  idorVictim: `${stamp}-idor-victim@example.com`,
  racerA: `${stamp}-racer-a@example.com`,
  racerB: `${stamp}-racer-b@example.com`,
};

const createdUserIds: string[] = [];
const cookies: Record<string, string> = {};
let sharedPasswordHash = '';

async function ensureRole(slug: string) {
  return prisma.role.upsert({ where: { slug }, update: {}, create: { name: slug, slug } });
}

async function createUser(email: string, roleSlugs: string[]) {
  const user = await prisma.user.create({
    data: { email, passwordHash: sharedPasswordHash, firstName: 'Lifecycle', lastName: email, status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  for (const slug of roleSlugs) {
    const role = await ensureRole(slug);
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
  return user;
}

async function standing(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    include: { roles: { include: { role: true } }, sessions: { select: { id: true, revokedAt: true } } },
  });
  return {
    status: user.status,
    deletedAt: user.deletedAt,
    roles: user.roles.map((entry) => entry.role.slug),
    liveSessions: user.sessions.filter((session) => session.revokedAt === null).length,
  };
}

beforeAll(async () => {
  app = await buildApp();
  sharedPasswordHash = await hashPassword('password123');
  await createUser(emails.soleDeactivate, ['super_admin']);
  await createUser(emails.soleDelete, ['super_admin']);
  await createUser(emails.keeperA, ['super_admin']);
  await createUser(emails.keeperB, ['super_admin']);
  await createUser(emails.customerDeactivate, ['customer']);
  await createUser(emails.customerDelete, ['customer']);
  await createUser(emails.idorVictim, ['customer']);
  await createUser(emails.racerA, ['super_admin']);
  await createUser(emails.racerB, ['super_admin']);
  // Keepers/racers form independent pairs; the sole-* accounts are each the
  // only usable super-admin at the moment their block is asserted because
  // every other super-admin fixture is consumed (deactivated) or removed by
  // ordering: blocks run before keepers/racers narrow their own pairs.
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});
