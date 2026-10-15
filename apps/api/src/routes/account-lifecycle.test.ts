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
 * from the session (the body is never read), keep the soft-only lifecycle
 * (INACTIVE / DELETED + deletedAt, rows retained, sessions revoked, audit rows
 * written), and refuse to remove the final usable (ACTIVE + super-admin grant)
 * account with 409 LAST_SUPER_ADMIN. The guard check runs inside the mutation
 * transaction under a PostgreSQL advisory lock, so concurrent lifecycle
 * operations serialize instead of racing on an outside-transaction count.
 *
 * Determinism under the shared parallel database: files run concurrently, so
 * a test can never assume global sole-hood up front. Block/race tests are
 * therefore outcome-driven — they branch on the guard's atomic decision
 * (409 vs 200) and rigorously assert full atomicity down each branch — rather
 * than asserting a predicted outcome from a racy pre-read. Run this file
 * alone for guaranteed block-path (409) coverage.
 *
 * Lifecycle POSTs are rate-limited per route + IP (shared 127.0.0.1 here);
 * this file stays well under budget on each route.
 */

let app: FastifyInstance;

const stamp = `salifecycle-${Date.now().toString(36)}`;

const createdUserIds: string[] = [];
const cookies: Record<string, string> = {};
let sharedPasswordHash = '';

async function ensureRole(slug: string) {
  return prisma.role.upsert({ where: { slug }, update: {}, create: { name: slug, slug } });
}

async function createUser(tag: string, roleSlugs: string[]) {
  const email = `${stamp}-${tag}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: sharedPasswordHash, firstName: 'Lifecycle', lastName: tag, status: 'ACTIVE' },
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
  cookies[tag] = `veyra_session=${rawToken}`;
  return user;
}

async function standingById(id: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { roles: { include: { role: true } }, sessions: { select: { id: true, revokedAt: true } } },
  });
  return {
    status: user.status,
    deletedAt: user.deletedAt,
    roles: user.roles.map((entry) => entry.role.slug).sort(),
    liveSessions: user.sessions.filter((session) => session.revokedAt === null).length,
  };
}

async function auditRows(userId: string, action: 'ACCOUNT_DEACTIVATED' | 'ACCOUNT_DELETION_REQUESTED') {
  return prisma.auditLog.count({ where: { actorId: userId, action, entityId: userId } });
}

async function usableSuperAdmins() {
  return prisma.user.count({
    where: { status: 'ACTIVE', roles: { some: { role: { slug: { in: ['super_admin', 'super-admin'] } } } } },
  });
}

async function meStatus(tag: string) {
  const response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie: cookies[tag] } });
  return response.statusCode;
}

beforeAll(async () => {
  app = await buildApp();
  sharedPasswordHash = await hashPassword('password123');
}, 60000);

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: createdUserIds } }, { entityId: { in: createdUserIds } }] },
  });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('last-super-admin deactivation guard', () => {
  it('blocks only when sole, otherwise preserves the handover lifecycle', async () => {
    const user = await createUser('sole-deactivate', ['super_admin']);
    const before = await standingById(user.id);
    expect(before.liveSessions).toBeGreaterThan(0);

    const response = await app.inject({ method: 'POST', url: '/api/v1/account/deactivate', headers: { cookie: cookies['sole-deactivate'] } });

    if (response.statusCode === 409) {
      // Block path: sole usable super-admin. Nothing may have changed.
      expect((response.json() as { error: { code: string } }).error.code).toBe('LAST_SUPER_ADMIN');
      const after = await standingById(user.id);
      expect(after.status).toBe('ACTIVE');
      expect(after.deletedAt).toBeNull();
      expect(after.roles).toEqual(before.roles);
      expect(after.liveSessions).toBe(before.liveSessions);
      expect(await auditRows(user.id, 'ACCOUNT_DEACTIVATED')).toBe(0);
      expect(await meStatus('sole-deactivate')).toBe(200);
    } else {
      // Handover path: another usable super-admin existed (e.g. a parallel
      // suite's fixture). The standard lifecycle must be fully applied.
      expect(response.statusCode).toBe(200);
      const after = await standingById(user.id);
      expect(after.status).toBe('INACTIVE');
      expect(after.roles).toEqual(before.roles);
      expect(after.liveSessions).toBe(0);
      expect(await auditRows(user.id, 'ACCOUNT_DEACTIVATED')).toBe(1);
      expect(await meStatus('sole-deactivate')).toBe(401);
    }
    // Invariant, both branches: the system keeps a usable super-admin, and
    // the operation was atomic (fully applied or fully refused — asserted
    // above per branch).
    expect(await usableSuperAdmins()).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('handover deactivation succeeds with a second usable super-admin present', async () => {
    await createUser('keeper-a', ['super_admin']);
    const leaving = await createUser('leaving-a', ['super_admin']);
    const response = await app.inject({ method: 'POST', url: '/api/v1/account/deactivate', headers: { cookie: cookies['leaving-a'] } });
    expect(response.statusCode).toBe(200);
    const after = await standingById(leaving.id);
    expect(after.status).toBe('INACTIVE');
    expect(after.liveSessions).toBe(0);
    expect(await auditRows(leaving.id, 'ACCOUNT_DEACTIVATED')).toBe(1);
    expect(await meStatus('leaving-a')).toBe(401);
    // The keeper is untouched and still administers.
    const keeperStanding = await standingById((await prisma.user.findUniqueOrThrow({ where: { email: `${stamp}-keeper-a@example.com` } })).id);
    expect(keeperStanding.status).toBe('ACTIVE');
    expect(keeperStanding.roles).toContain('super_admin');
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/admin/roles', headers: { cookie: cookies['keeper-a'] } })).statusCode,
    ).toBe(200);
  }, 60000);
});

describe('last-super-admin deletion guard', () => {
  it('blocks only when sole, otherwise preserves the deletion lifecycle', async () => {
    const user = await createUser('sole-delete', ['super_admin']);
    const before = await standingById(user.id);

    const response = await app.inject({ method: 'POST', url: '/api/v1/account/delete', headers: { cookie: cookies['sole-delete'] } });

    if (response.statusCode === 409) {
      expect((response.json() as { error: { code: string } }).error.code).toBe('LAST_SUPER_ADMIN');
      const after = await standingById(user.id);
      expect(after.status).toBe('ACTIVE');
      expect(after.deletedAt).toBeNull();
      expect(after.roles).toEqual(before.roles);
      expect(after.liveSessions).toBe(before.liveSessions);
      expect(await auditRows(user.id, 'ACCOUNT_DELETION_REQUESTED')).toBe(0);
      expect(await meStatus('sole-delete')).toBe(200);
    } else {
      expect(response.statusCode).toBe(200);
      const after = await standingById(user.id);
      expect(after.status).toBe('DELETED');
      expect(after.deletedAt).not.toBeNull();
      expect(after.roles).toEqual(before.roles);
      expect(after.liveSessions).toBe(0);
      expect(await auditRows(user.id, 'ACCOUNT_DELETION_REQUESTED')).toBe(1);
      expect(await meStatus('sole-delete')).toBe(401);
    }
    expect(await usableSuperAdmins()).toBeGreaterThanOrEqual(1);
  }, 60000);

  it('handover deletion succeeds with a second usable super-admin present', async () => {
    await createUser('keeper-b', ['super_admin']);
    const leaving = await createUser('leaving-b', ['super_admin']);
    const response = await app.inject({ method: 'POST', url: '/api/v1/account/delete', headers: { cookie: cookies['leaving-b'] } });
    expect(response.statusCode).toBe(200);
    const after = await standingById(leaving.id);
    expect(after.status).toBe('DELETED');
    expect(after.deletedAt).not.toBeNull();
    expect(after.liveSessions).toBe(0);
    expect(await meStatus('leaving-b')).toBe(401);
  }, 60000);
});

describe('ordinary customer lifecycle is unchanged', () => {
  it('customers can still deactivate as before', async () => {
    const user = await createUser('customer-deactivate', ['customer']);
    const response = await app.inject({ method: 'POST', url: '/api/v1/account/deactivate', headers: { cookie: cookies['customer-deactivate'] } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: { deactivated: boolean } }).data.deactivated).toBe(true);
    const after = await standingById(user.id);
    expect(after.status).toBe('INACTIVE');
    expect(after.liveSessions).toBe(0);
    expect(await meStatus('customer-deactivate')).toBe(401);
  });

  it('customers can still delete as before', async () => {
    const user = await createUser('customer-delete', ['customer']);
    const response = await app.inject({ method: 'POST', url: '/api/v1/account/delete', headers: { cookie: cookies['customer-delete'] } });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { data: { deleted: boolean } }).data.deleted).toBe(true);
    const after = await standingById(user.id);
    expect(after.status).toBe('DELETED');
    expect(after.deletedAt).not.toBeNull();
    expect(after.liveSessions).toBe(0);
    expect(await meStatus('customer-delete')).toBe(401);
  });

  it('request fields cannot steer the lifecycle onto another account', async () => {
    const actor = await createUser('idor-actor', ['customer']);
    const victim = await createUser('idor-victim', ['customer']);
    const victimBefore = await standingById(victim.id);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/deactivate',
      headers: { cookie: cookies['idor-actor'] },
      payload: { userId: victim.id, id: victim.id, role: 'super_admin', roles: ['super_admin'], status: 'ACTIVE' },
    });
    expect(response.statusCode).toBe(200);
    // Only the session owner changed; the victim is byte-identical.
    expect(await standingById(actor.id).then((standing) => standing.status)).toBe('INACTIVE');
    expect(await standingById(victim.id)).toEqual(victimBefore);
    expect(await meStatus('idor-victim')).toBe(200);
  });
});

describe('concurrent lifecycle serialization', () => {
  it('two racing super-admin deactivations never strand the system without one', async () => {
    const racerA = await createUser('racer-a', ['super_admin']);
    const racerB = await createUser('racer-b', ['super_admin']);
    const beforeA = await standingById(racerA.id);
    const beforeB = await standingById(racerB.id);

    const [responseA, responseB] = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/account/deactivate', headers: { cookie: cookies['racer-a'] } }),
      app.inject({ method: 'POST', url: '/api/v1/account/deactivate', headers: { cookie: cookies['racer-b'] } }),
    ]);
    const codes = [responseA.statusCode, responseB.statusCode].sort();
    // Either the pair was globally sole ([200, 409]) or a parallel suite's
    // fixture kept the system non-sole ([200, 200]). No other outcome is
    // possible: the lock serializes the guard+mutation per request.
    expect(codes).toContain(200);
    expect(codes.every((code) => code === 200 || code === 409)).toBe(true);

    const afterA = await standingById(racerA.id);
    const afterB = await standingById(racerB.id);
    // Atomicity per account: each side fully applied or fully refused.
    for (const [tag, before, after, response] of [
      ['racer-a', beforeA, afterA, responseA],
      ['racer-b', beforeB, afterB, responseB],
    ] as const) {
      if (response.statusCode === 200) {
        expect(after.status).toBe('INACTIVE');
        expect(after.roles).toEqual(before.roles);
        expect(after.liveSessions).toBe(0);
        expect(await meStatus(tag)).toBe(403);
      } else {
        expect((response.json() as { error: { code: string } }).error.code).toBe('LAST_SUPER_ADMIN');
        expect(after).toEqual({ ...before });
        expect(await meStatus(tag)).toBe(200);
      }
    }
    // System invariant regardless of interleaving or foreign fixtures.
    expect(await usableSuperAdmins()).toBeGreaterThanOrEqual(1);
  }, 60000);
});
