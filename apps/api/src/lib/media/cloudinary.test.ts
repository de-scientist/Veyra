import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  authorizeDirectUpload,
  buildSignableParams,
  getMediaConfig,
  normalizeUploadResult,
  setMediaConfigForTests,
  signParams,
  type MediaConfig,
} from './cloudinary.js';

const testConfig: MediaConfig = {
  cloudName: 'jb-test-cloud',
  apiKey: 'test-key',
  apiSecret: 'test-secret-never-commit',
  baseFolder: 'jb-mercantile',
};

afterEach(() => {
  setMediaConfigForTests(null);
});

describe('media provider configuration', () => {
  it('fails safe with a clear error when credentials are absent', () => {
    // No override: the provider resolves real credentials when a dev .env
    // provides them, and otherwise refuses (503) instead of pretending
    // uploads work.
    try {
      const config = getMediaConfig();
      expect(config.cloudName.length).toBeGreaterThan(0);
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(503);
      expect((error as { code?: string }).code).toBe('MEDIA_NOT_CONFIGURED');
    }
  });

  it('fails safe (503) when credentials are absent, regardless of local .env', async () => {
    const saved = {
      CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    };
    delete process.env.CLOUDINARY_CLOUD_NAME;
    delete process.env.CLOUDINARY_API_KEY;
    delete process.env.CLOUDINARY_API_SECRET;
    vi.resetModules();
    try {
      const fresh = await import('./cloudinary.js');
      expect(() => fresh.getMediaConfig()).toThrowError(/not configured/);
      try {
        fresh.getMediaConfig();
        expect.unreachable('expected MEDIA_NOT_CONFIGURED');
      } catch (error) {
        expect((error as { statusCode?: number }).statusCode).toBe(503);
        expect((error as { code?: string }).code).toBe('MEDIA_NOT_CONFIGURED');
      }
    } finally {
      if (saved.CLOUDINARY_CLOUD_NAME !== undefined) process.env.CLOUDINARY_CLOUD_NAME = saved.CLOUDINARY_CLOUD_NAME;
      if (saved.CLOUDINARY_API_KEY !== undefined) process.env.CLOUDINARY_API_KEY = saved.CLOUDINARY_API_KEY;
      if (saved.CLOUDINARY_API_SECRET !== undefined) process.env.CLOUDINARY_API_SECRET = saved.CLOUDINARY_API_SECRET;
      vi.resetModules();
    }
  });
});

describe('upload authorization', () => {
  it('signs deterministic server-controlled parameters', () => {
    setMediaConfigForTests(testConfig);
    const params = buildSignableParams({ timestamp: 1234567890, folder: 'jb-mercantile/products', publicId: 'abc123' });
    expect(params).toEqual({ timestamp: 1234567890, folder: 'jb-mercantile/products', public_id: 'abc123' });
    const first = signParams(testConfig, params);
    const second = signParams(testConfig, params);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(16);
  });

  it('authorizes profile uploads scoped to the owner', () => {
    setMediaConfigForTests(testConfig);
    const auth = authorizeDirectUpload({ context: 'profile', ownerUserId: 'user-1' });
    expect(auth.provider).toBe('cloudinary');
    expect(auth.folder).toBe('jb-mercantile/profiles');
    expect(auth.publicId.startsWith('user-1/')).toBe(true);
    expect(auth.uploadUrl).toBe('https://api.cloudinary.com/v1_1/jb-test-cloud/image/upload');
    expect(auth.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
  });

  it('rejects invalid context, MIME type, and oversize declarations', () => {
    setMediaConfigForTests(testConfig);
    expect(() => authorizeDirectUpload({ context: 'banner' as never })).toThrowError(/Unknown media context/);
    expect(() => authorizeDirectUpload({ context: 'product', declaredMimeType: 'image/svg+xml' })).toThrowError(
      /not allowed/,
    );
    expect(() => authorizeDirectUpload({ context: 'profile', declaredBytes: 99_000_000 })).toThrowError(
      /exceeds the maximum/,
    );
  });

  it('never includes the API secret in the authorization', () => {
    setMediaConfigForTests(testConfig);
    const auth = authorizeDirectUpload({ context: 'product' });
    const serialized = JSON.stringify(auth);
    expect(serialized).not.toContain('test-secret-never-commit');
    expect(serialized).not.toMatch(/api[_-]?secret/i);
    expect(auth).not.toHaveProperty('apiSecret');
  });
});

describe('upload result normalization', () => {
  const valid = {
    public_id: 'jb-mercantile/products/abc123',
    secure_url: 'https://res.cloudinary.com/jb-test-cloud/image/upload/abc123.webp',
    resource_type: 'image',
    format: 'webp',
    width: 1200,
    height: 900,
    bytes: 123456,
  };

  it('accepts a well-formed provider result', () => {
    setMediaConfigForTests(testConfig);
    const asset = normalizeUploadResult('jb-mercantile', 'product', valid);
    expect(asset).toEqual({
      provider: 'cloudinary',
      publicId: 'jb-mercantile/products/abc123',
      secureUrl: valid.secure_url,
      width: 1200,
      height: 900,
      format: 'webp',
      bytes: 123456,
    });
  });

  it('rejects foreign folders, non-images, untrusted URLs, and bad formats', () => {
    expect(() => normalizeUploadResult('jb-mercantile', 'product', { ...valid, public_id: 'other/abc' })).toThrowError(
      /requested media context/,
    );
    expect(() =>
      normalizeUploadResult('jb-mercantile', 'profile', { ...valid, public_id: 'jb-mercantile/profiles/u/1' }),
    ).not.toThrow();
    expect(() => normalizeUploadResult('jb-mercantile', 'product', { ...valid, resource_type: 'raw' })).toThrowError(
      /Only image uploads/,
    );
    expect(() =>
      normalizeUploadResult('jb-mercantile', 'product', { ...valid, secure_url: 'http://res.cloudinary.com/x' }),
    ).toThrowError(/HTTPS/);
    expect(() => normalizeUploadResult('jb-mercantile', 'product', { ...valid, format: 'svg' })).toThrowError(
      /not allowed/,
    );
    expect(() => normalizeUploadResult('jb-mercantile', 'product', { ...valid, width: 0 })).toThrowError(
      /dimensions/,
    );
  });
});
