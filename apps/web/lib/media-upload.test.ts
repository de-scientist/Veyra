import { describe, expect, it } from 'vitest';

import { normalizeCloudinaryResponse, type UploadAuthorization } from './media-upload';

const auth: UploadAuthorization = {
  provider: 'cloudinary',
  cloudName: 'jb-test-cloud',
  apiKey: 'test-key',
  uploadUrl: 'https://api.cloudinary.com/v1_1/jb-test-cloud/image/upload',
  timestamp: 1234567890,
  signature: 'sig',
  folder: 'jb-mercantile/profiles',
  publicId: 'user-1/abc123',
  resourceType: 'image',
  allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 5_000_000,
};

const validResult = {
  public_id: 'jb-mercantile/profiles/user-1/abc123',
  secure_url: 'https://res.cloudinary.com/jb-test-cloud/image/upload/abc123.webp',
  resource_type: 'image',
  format: 'webp',
  width: 800,
  height: 800,
  bytes: 123456,
};

describe('normalizeCloudinaryResponse', () => {
  it('accepts a well-formed provider response', () => {
    expect(normalizeCloudinaryResponse(auth, validResult)).toEqual({
      provider: 'cloudinary',
      publicId: 'jb-mercantile/profiles/user-1/abc123',
      secureUrl: validResult.secure_url,
      width: 800,
      height: 800,
      format: 'webp',
      bytes: 123456,
    });
  });

  it('rejects mismatched assets, non-images, and untrusted URLs', () => {
    expect(() => normalizeCloudinaryResponse(auth, { ...validResult, public_id: 'jb-mercantile/products/other' })).toThrowError(
      /authorized asset/,
    );
    expect(() => normalizeCloudinaryResponse(auth, { ...validResult, resource_type: 'video' })).toThrowError(
      /Only image uploads/,
    );
    expect(() => normalizeCloudinaryResponse(auth, { ...validResult, secure_url: 'http://res.cloudinary.com/x' })).toThrowError(
      /trusted secure/,
    );
    expect(() => normalizeCloudinaryResponse(auth, { ...validResult, format: 'svg' })).toThrowError(/not allowed/);
    expect(() => normalizeCloudinaryResponse(auth, { ...validResult, bytes: 99_000_000 })).toThrowError(
      /exceeds the maximum/,
    );
    expect(() => normalizeCloudinaryResponse(auth, { error: { message: 'Invalid signature' } })).toThrowError(
      /rejected the upload/,
    );
  });
});
