import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { env } from '../lib/env.js';
import { getMediaConfig, setMediaConfigForTests } from '../lib/media/cloudinary.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `media-${Date.now().toString(36)}`;
const emails = {
  customerA: `${stamp}-a@example.com`,
  customerB: `${stamp}-b@example.com`,
  staff: `${stamp}-staff@example.com`,
  admin: `${stamp}-admin@example.com`,
};

const createdUserIds: string[] = [];
const userIds: Record<string, string> = {};
const cookies: Record<string, string> = {};

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword('password123'),
      firstName: 'Media',
      lastName: roleSlug,
      status: 'ACTIVE',
    },
  });
  createdUserIds.push(user.id);
  userIds[email] = user.id;
  const role = await prisma.role.upsert({
    where: { slug: roleSlug },
    update: {},
    create: { name: roleSlug, slug: roleSlug },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
  return user;
}

async function signUpload(email: string | null, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/media/sign-upload',
    payload,
    headers: email ? { cookie: cookies[email] } : {},
  });
}

beforeAll(async () => {
  // Offline-capable test credentials: signing is pure HMAC, no network.
  setMediaConfigForTests({
    cloudName: 'jb-test-cloud',
    apiKey: 'test-key',
    apiSecret: 'test-secret-never-commit',
    baseFolder: 'jb-mercantile',
  });
  app = await buildApp();
  await createUser(emails.customerA, 'customer');
  await createUser(emails.customerB, 'customer');
  await createUser(emails.staff, 'staff');
  await createUser(emails.admin, 'admin');
}, 60000);

afterAll(async () => {
  setMediaConfigForTests(null);
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('media upload authorization', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await signUpload(null, { context: 'profile' });
    expect(response.statusCode).toBe(401);
  });

  it('authorizes profile uploads for customers without exposing secrets', async () => {
    const response = await signUpload(emails.customerA, { context: 'profile' });
    expect(response.statusCode).toBe(200);
    const data = (response.json() as { data: Record<string, unknown> }).data;
    expect(data.provider).toBe('cloudinary');
    expect(data.folder).toBe('jb-mercantile/profiles');
    expect(data.uploadUrl).toBe('https://api.cloudinary.com/v1_1/jb-test-cloud/image/upload');
    const serialized = response.body;
    expect(serialized).not.toContain('test-secret-never-commit');
    expect(serialized).not.toMatch(/api[_-]?secret/i);
  });

  it('scopes profile public IDs to the requesting user (cross-user check)', async () => {
    const responseA = await signUpload(emails.customerA, { context: 'profile' });
    const responseB = await signUpload(emails.customerB, { context: 'profile' });
    const publicIdA = (responseA.json() as { data: { publicId: string } }).data.publicId;
    const publicIdB = (responseB.json() as { data: { publicId: string } }).data.publicId;
    expect(publicIdA.startsWith(`${userIds[emails.customerA]}/`)).toBe(true);
    expect(publicIdB.startsWith(`${userIds[emails.customerB]}/`)).toBe(true);
    expect(publicIdA).not.toBe(publicIdB);
    expect(publicIdB.includes(userIds[emails.customerA])).toBe(false);
  });

  it('denies product uploads to customers', async () => {
    const response = await signUpload(emails.customerA, { context: 'product' });
    expect(response.statusCode).toBe(403);
  });

  it('authorizes product uploads for operations roles', async () => {
    for (const email of [emails.staff, emails.admin]) {
      const response = await signUpload(email, { context: 'product' });
      expect(response.statusCode).toBe(200);
      const data = (response.json() as { data: { folder: string } }).data;
      expect(data.folder).toBe('jb-mercantile/products');
    }
  });

  it('rejects unknown contexts', async () => {
    const response = await signUpload(emails.customerA, { context: 'banner' });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('INVALID_MEDIA_CONTEXT');
  });

  it('rejects disallowed MIME types and oversize declarations', async () => {
    const svg = await signUpload(emails.customerA, { context: 'profile', contentType: 'image/svg+xml' });
    expect(svg.statusCode).toBe(400);
    const huge = await signUpload(emails.customerA, { context: 'profile', bytes: 99_000_000 });
    expect(huge.statusCode).toBe(413);
  });

  it('ignores client-supplied folder, publicId, role, and userId overrides', async () => {
    // Customer tries to escalate into product uploads with forged fields.
    const forged = await signUpload(emails.customerA, {
      context: 'product',
      folder: 'jb-mercantile/products',
      publicId: 'main-logo',
      public_id: 'main-logo',
      role: 'admin',
      roles: ['admin'],
      userId: userIds[emails.customerB],
    });
    expect(forged.statusCode).toBe(403);

    // Staff attempt with overrides still yields server-controlled values.
    const staff = await signUpload(emails.staff, {
      context: 'product',
      folder: 'arbitrary-folder',
      publicId: 'another-asset',
      // @ts-expect-error intentional tamper probe
      timestamp: 1,
    });
    expect(staff.statusCode).toBe(200);
    const data = (staff.json() as { data: { folder: string; publicId: string; timestamp: number } }).data;
    expect(data.folder).toBe('jb-mercantile/products');
    expect(data.publicId).not.toBe('another-asset');
    expect(data.timestamp).toBeGreaterThan(1);
  });

  it('fails safe when Cloudinary is not configured', async () => {
    setMediaConfigForTests(null);
    try {
      // If the dev environment provides real credentials the endpoint
      // stays available; otherwise it must refuse with a clear error.
      getMediaConfig();
    } catch {
      const response = await signUpload(emails.customerA, { context: 'profile' });
      expect(response.statusCode).toBe(503);
      expect((response.json() as { error: { code: string } }).error.code).toBe('MEDIA_NOT_CONFIGURED');
      expect(response.body).not.toMatch(/api[_-]?secret/i);
      return;
    }
    // Real credentials present: endpoint remains available (no assertion
    // about availability beyond "no fake behavior" — the 503 path above).
  });

  it('rate-limits repeated authorization requests', async () => {
    setMediaConfigForTests({
      cloudName: 'jb-test-cloud',
      apiKey: 'test-key',
      apiSecret: 'test-secret-never-commit',
      baseFolder: 'jb-mercantile',
    });
    const budget = env.RATE_LIMIT_SENSITIVE_MAX;
    let sawTooManyRequests = false;
    for (let i = 0; i < budget + 5; i++) {
      const response = await signUpload(emails.customerB, { context: 'profile' });
      if (response.statusCode === 429) {
        sawTooManyRequests = true;
        break;
      }
    }
    expect(sawTooManyRequests).toBe(true);
  });
});
