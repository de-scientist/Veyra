import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { setMediaConfigForTests } from '../lib/media/cloudinary.js';
import { prisma } from '../lib/prisma.js';

vi.mock('../lib/media/cloudinary.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../lib/media/cloudinary.js')>();
  return { ...mod, destroyMedia: vi.fn().mockResolvedValue(undefined) };
});

import { destroyMedia } from '../lib/media/cloudinary.js';

const mockedDestroy = vi.mocked(destroyMedia);

let app: FastifyInstance;

const stamp = `avatar-${Date.now().toString(36)}`;
const emails = { alice: `${stamp}-a@example.com`, bob: `${stamp}-b@example.com` };
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];

function avatarResult(userId: string, tag: string) {
  return {
    publicId: `jb-mercantile/profiles/${userId}/${tag}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    secureUrl: `https://res.cloudinary.com/jb-test-cloud/image/upload/${tag}.webp`,
    width: 600,
    height: 600,
    format: 'webp',
    bytes: 54321,
  };
}

async function createUser(email: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Avatar', lastName: email, status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  userIds[email] = user.id;
  const role = await prisma.role.upsert({ where: { slug: 'customer' }, update: {}, create: { name: 'customer', slug: 'customer' } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
}

beforeAll(async () => {
  setMediaConfigForTests({
    cloudName: 'jb-test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret-never-commit',
    baseFolder: 'jb-mercantile',
  });
  app = await buildApp();
  await createUser(emails.alice);
  await createUser(emails.bob);
}, 60000);

afterAll(async () => {
  setMediaConfigForTests(null);
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('profile avatar lifecycle', () => {
  it('rejects unauthenticated avatar writes', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/v1/account/profile/avatar', payload: {} })).statusCode).toBe(401);
    expect((await app.inject({ method: 'DELETE', url: '/api/v1/account/profile/avatar' })).statusCode).toBe(401);
  });

  it('rejects assets outside the caller namespace (cross-user)', async () => {
    const foreign = avatarResult(userIds[emails.bob], 'hijack');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/account/profile/avatar',
      payload: foreign,
      headers: { cookie: cookies[emails.alice] },
    });
    expect(response.statusCode).toBe(403);
    expect((response.json() as { error: { code: string } }).error.code).toBe('AVATAR_NOT_OWNED');
  });

  it('sets, replaces (cleaning the old asset), and removes the avatar', async () => {
    const alice = userIds[emails.alice];
    const auth = { cookie: cookies[emails.alice] };

    const first = await app.inject({ method: 'POST', url: '/api/v1/account/profile/avatar', payload: avatarResult(alice, 'one'), headers: auth });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json() as { data: { avatarUrl: string; providerCleanup: string } };
    expect(firstBody.data.avatarUrl).toContain('https://res.cloudinary.com/');
    expect(firstBody.data.providerCleanup).toBe('skipped');
    expect(first.body).not.toContain('avatarPublicId');
    expect(first.body).not.toMatch(/api[_-]?secret/i);

    mockedDestroy.mockClear();
    const second = await app.inject({ method: 'POST', url: '/api/v1/account/profile/avatar', payload: avatarResult(alice, 'two'), headers: auth });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json() as { data: { avatarUrl: string; providerCleanup: string } };
    expect(secondBody.data.avatarUrl).not.toBe(firstBody.data.avatarUrl);
    expect(secondBody.data.providerCleanup).toBe('deleted');
    expect(mockedDestroy).toHaveBeenCalledTimes(1);

    const removed = await app.inject({ method: 'DELETE', url: '/api/v1/account/profile/avatar', headers: auth });
    expect(removed.statusCode).toBe(200);
    const removedBody = removed.json() as { data: { avatarUrl: string | null; providerCleanup: string } };
    expect(removedBody.data.avatarUrl).toBeNull();
    expect(removedBody.data.providerCleanup).toBe('deleted');

    const again = await app.inject({ method: 'DELETE', url: '/api/v1/account/profile/avatar', headers: auth });
    expect((again.json() as { data: { providerCleanup: string } }).data.providerCleanup).toBe('skipped');
  });

  it('rejects invalid provider results', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/account/profile/avatar',
      payload: { ...avatarResult(userIds[emails.alice], 'x'), format: 'svg' },
      headers: { cookie: cookies[emails.alice] },
    });
    expect(bad.statusCode).toBe(400);
  });
});
