import { describe, expect, it } from 'vitest';

import { cloudinaryDisplayUrl } from './cloudinary-display';

const canonical = 'https://res.cloudinary.com/jb-cloud/image/upload/v1/jb-mercantile/products/abc.webp';

describe('cloudinaryDisplayUrl', () => {
  it('derives fixed thumbnail and detail variants', () => {
    expect(cloudinaryDisplayUrl(canonical, 'thumbnail')).toBe(
      'https://res.cloudinary.com/jb-cloud/image/upload/c_limit,w_400/f_auto/q_auto/v1/jb-mercantile/products/abc.webp',
    );
    expect(cloudinaryDisplayUrl(canonical, 'detail')).toBe(
      'https://res.cloudinary.com/jb-cloud/image/upload/c_limit,w_1200/f_auto/q_auto/v1/jb-mercantile/products/abc.webp',
    );
  });

  it('derives a square avatar variant for navbar/profile slots', () => {
    expect(cloudinaryDisplayUrl(canonical, 'avatar')).toBe(
      'https://res.cloudinary.com/jb-cloud/image/upload/c_fill,w_128,h_128,g_face/f_auto/q_auto/v1/jb-mercantile/products/abc.webp',
    );
  });

  it('passes legacy and external URLs through untouched', () => {
    expect(cloudinaryDisplayUrl('https://images.unsplash.com/photo-1?w=400', 'thumbnail')).toBe(
      'https://images.unsplash.com/photo-1?w=400',
    );
    expect(cloudinaryDisplayUrl(null, 'thumbnail')).toBe(null);
    expect(cloudinaryDisplayUrl('', 'detail')).toBe(null);
  });

  it('never double-applies a transformation', () => {
    const once = cloudinaryDisplayUrl(canonical, 'thumbnail') as string;
    expect(cloudinaryDisplayUrl(once, 'detail')).toBe(once);
  });
});
