import { departments } from './catalog';

/**
 * JB Mercantile hero carousel slides (presentation config only).
 * Product listings stay DB-backed via lib/storefront.ts — this file owns
 * just the static promotional slide copy/imagery/CTA targets, reusing the
 * existing department pillars and imagery. No prices, discounts, or claims.
 */

export type HeroSlide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  href: string;
  ctaLabel: string;
};

function departmentImage(slug: string): string {
  return departments.find((d) => d.slug === slug)?.image ?? '';
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'fashion',
    eyebrow: 'JB Mercantile · Fashion',
    title: 'Refresh Your Wardrobe',
    description: 'Discover modern fashion pieces for everyday style.',
    image: departmentImage('fashion'),
    imageAlt: 'Everyday fashion clothing rail',
    href: '/shop?department=fashion',
    ctaLabel: 'Shop Fashion',
  },
  {
    id: 'footwear',
    eyebrow: 'JB Mercantile · Footwear',
    title: 'Step Into Your Style',
    description: 'Explore footwear designed for everyday movement.',
    image: departmentImage('footwear'),
    imageAlt: 'Pair of sneakers',
    href: '/shop?department=footwear',
    ctaLabel: 'Shop Footwear',
  },
  {
    id: 'kitchen-home',
    eyebrow: 'JB Mercantile · Kitchen & Home',
    title: 'Upgrade Your Kitchen',
    description: 'Practical appliances for modern living.',
    image: departmentImage('kitchen-home'),
    imageAlt: 'Modern kitchen interior',
    href: '/shop?department=kitchen-home',
    ctaLabel: 'Shop Kitchen & Home',
  },
];

export const HERO_AUTOPLAY_MS = 6000;
