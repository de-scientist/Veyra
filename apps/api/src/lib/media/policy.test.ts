import { describe, expect, it } from 'vitest';

import {
  folderFor,
  fullPublicId,
  isAllowedFormat,
  isAllowedMimeType,
  isManagedPublicId,
  isMediaContext,
  isTrustedDeliveryUrl,
  isWithinSizeLimit,
  MEDIA_POLICY,
  publicIdFor,
} from './policy.js';

describe('media policy', () => {
  it('constrains contexts to product and profile', () => {
    expect(isMediaContext('product')).toBe(true);
    expect(isMediaContext('profile')).toBe(true);
    expect(isMediaContext('banner')).toBe(false);
    expect(isMediaContext('')).toBe(false);
    expect(isMediaContext(undefined)).toBe(false);
  });

  it('restricts MIME types per context (no SVG/GIF/raw)', () => {
    for (const context of ['product', 'profile'] as const) {
      expect(isAllowedMimeType(context, 'image/jpeg')).toBe(true);
      expect(isAllowedMimeType(context, 'image/png')).toBe(true);
      expect(isAllowedMimeType(context, 'image/webp')).toBe(true);
      expect(isAllowedMimeType(context, 'image/svg+xml')).toBe(false);
      expect(isAllowedMimeType(context, 'image/gif')).toBe(false);
      expect(isAllowedMimeType(context, 'application/pdf')).toBe(false);
      expect(isAllowedMimeType(context, 'text/html')).toBe(false);
    }
  });

  it('enforces explicit size limits', () => {
    expect(MEDIA_POLICY.product.maxBytes).toBe(8_000_000);
    expect(MEDIA_POLICY.profile.maxBytes).toBe(5_000_000);
    expect(isWithinSizeLimit('profile', 5_000_000)).toBe(true);
    expect(isWithinSizeLimit('profile', 5_000_001)).toBe(false);
    expect(isWithinSizeLimit('product', 0)).toBe(false);
    expect(isWithinSizeLimit('product', -10)).toBe(false);
    expect(isWithinSizeLimit('product', 1.5)).toBe(false);
  });

  it('derives folders from server config, never client input', () => {
    expect(folderFor('jb-mercantile', 'product')).toBe('jb-mercantile/products');
    expect(folderFor('jb-mercantile', 'profile')).toBe('jb-mercantile/profiles');
    expect(fullPublicId('jb-mercantile/products', 'abc')).toBe('jb-mercantile/products/abc');
  });

  it('generates unguessable, unique public IDs', () => {
    const first = publicIdFor('product');
    const second = publicIdFor('product');
    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    const scoped = publicIdFor('profile', 'user-123');
    expect(scoped.startsWith('user-123/')).toBe(true);
    expect(() => publicIdFor('profile')).toThrow();
  });

  it('guards managed public IDs against traversal and foreign folders', () => {
    expect(isManagedPublicId('jb-mercantile', 'jb-mercantile/products/abc')).toBe(true);
    expect(isManagedPublicId('jb-mercantile', 'jb-mercantile')).toBe(true);
    expect(isManagedPublicId('jb-mercantile', 'jb-mercantile/../admin')).toBe(false);
    expect(isManagedPublicId('jb-mercantile', '/jb-mercantile/products/abc')).toBe(false);
    expect(isManagedPublicId('jb-mercantile', 'other-folder/abc')).toBe(false);
    expect(isManagedPublicId('jb-mercantile', 'jb-mercantile\\products')).toBe(false);
    expect(isManagedPublicId('jb-mercantile', '')).toBe(false);
  });

  it('trusts only Cloudinary HTTPS delivery URLs', () => {
    expect(isTrustedDeliveryUrl('https://res.cloudinary.com/demo/image/upload/x.jpg')).toBe(true);
    expect(isTrustedDeliveryUrl('http://res.cloudinary.com/demo/image/upload/x.jpg')).toBe(false);
    expect(isTrustedDeliveryUrl('https://evil-res.cloudinary.com.demo.com/x.jpg')).toBe(false);
    expect(isTrustedDeliveryUrl('https://images.unsplash.com/x.jpg')).toBe(false);
    expect(isTrustedDeliveryUrl('not-a-url')).toBe(false);
  });

  it('restricts persisted formats', () => {
    expect(isAllowedFormat('product', 'webp')).toBe(true);
    expect(isAllowedFormat('product', 'WEBP')).toBe(true);
    expect(isAllowedFormat('product', 'avif')).toBe(false);
    expect(isAllowedFormat('product', 'svg')).toBe(false);
  });
});
