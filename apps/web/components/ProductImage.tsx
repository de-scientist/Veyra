'use client';

import Image from 'next/image';
import { useState } from 'react';

import { cloudinaryDisplayUrl, type DisplayPreset } from '../lib/cloudinary-display';

/**
 * Category-aware product image with graceful loading + fallback states.
 * Cloudinary assets render through the fixed delivery preset (never the
 * stored full-resolution bytes); legacy/external URLs pass through
 * untouched. Any remote image failure renders a branded placeholder —
 * never a broken image.
 */
export function ProductImage({
  src,
  alt,
  width = 800,
  height = 1000,
  eager = false,
  className,
  preset = 'thumbnail',
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  eager?: boolean;
  className?: string;
  /** Delivery size: cards default to thumbnail, gallery main uses detail. */
  preset?: DisplayPreset;
}) {
  const [failed, setFailed] = useState(false);
  // Derive once per render: null only when src itself is empty (handled
  // below); legacy URLs return unchanged by the helper.
  const displaySrc = src ? (cloudinaryDisplayUrl(src, preset) ?? src) : null;
  if (!displaySrc || failed) {
    return (
      <div className="product-card__placeholder" role="img" aria-label={`${alt} — image unavailable`}>
        JB Mercantile
      </div>
    );
  }
  return (
    <Image
      src={displaySrc}
      alt={alt}
      width={width}
      height={height}
      priority={eager}
      loading={eager ? undefined : 'lazy'}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
