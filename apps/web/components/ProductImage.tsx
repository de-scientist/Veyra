'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Category-aware product image with graceful loading + fallback states.
 * Any remote image failure renders a branded placeholder — never a broken image.
 */
export function ProductImage({
  src,
  alt,
  width = 800,
  height = 1000,
  eager = false,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  eager?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="product-card__placeholder" role="img" aria-label={`${alt} — image unavailable`}>
        JB Mercantile
      </div>
    );
  }
  return (
    <Image
      src={src}
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
