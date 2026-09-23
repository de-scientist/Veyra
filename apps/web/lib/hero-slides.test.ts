import { describe, expect, it } from 'vitest';

import { HERO_AUTOPLAY_MS, HERO_SLIDES } from './hero-slides';

describe('JB hero carousel slides', () => {
  it('has one slide per department pillar with JB copy and targets', () => {
    expect(HERO_SLIDES.map((s) => s.id)).toEqual(['fashion', 'footwear', 'kitchen-home']);
    for (const slide of HERO_SLIDES) {
      expect(slide.title.length).toBeGreaterThan(0);
      expect(slide.description.length).toBeGreaterThan(0);
      expect(slide.image.length).toBeGreaterThan(0);
      expect(slide.imageAlt.length).toBeGreaterThan(0);
      expect(slide.href.startsWith('/shop')).toBe(true);
      expect(slide.ctaLabel.length).toBeGreaterThan(0);
    }
  });

  it('makes no price, discount, or statistics claims', () => {
    const copy = HERO_SLIDES.map((s) => `${s.title} ${s.description}`.toLowerCase()).join(' | ');
    for (const banned of ['kes', '%', 'off', 'discount', 'sale', 'free', 'guarantee', 'best']) {
      expect(copy.includes(banned)).toBe(false);
    }
  });

  it('uses a calm autoplay interval (5-7s)', () => {
    expect(HERO_AUTOPLAY_MS).toBeGreaterThanOrEqual(5000);
    expect(HERO_AUTOPLAY_MS).toBeLessThanOrEqual(7000);
  });
});
