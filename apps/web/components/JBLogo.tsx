import Image from 'next/image';

/**
 * Official JB Mercantile brand assets (authoritative files in web/public):
 * - jb-logo.png: full lockup (JB lettermark + "JB MERCANTILE SHOP" + tagline),
 *   blue on white — for light surfaces, auth cards, footers, packaging.
 * - jb-navbar.png: compact horizontal lockup — for headers and tight spaces.
 * Both are dark-on-light artwork, so in dark mode they render inside a white
 * chip (.jb-logo-chip, pure CSS — no filters on the artwork itself).
 * Aspect ratio is always preserved (height-driven, width auto).
 */

type JBLogoVariant = 'full' | 'compact';

export function JBLogo({
  variant = 'compact',
  alt = '',
  chip = true,
  height,
}: {
  /** 'full' → jb-logo.png · 'compact' → jb-navbar.png */
  variant?: JBLogoVariant;
  /** Empty when adjacent text/labels already identify the brand. */
  alt?: string;
  /** Wrap in a white chip under dark theme (keeps blue-on-white artwork legible). */
  chip?: boolean;
  /** Display height in px (width scales automatically). Defaults: 32 compact, 44 full. */
  height?: number;
}) {
  const displayHeight = height ?? (variant === 'full' ? 44 : 32);
  // Intrinsic dimensions only define aspect ratio; CSS controls display size.
  const image =
    variant === 'full' ? (
      <Image
        src="/jb-logo.png"
        alt={alt}
        width={480}
        height={480}
        style={{ height: displayHeight, width: 'auto' }}
        className="jb-logo-img"
      />
    ) : (
      <Image
        src="/jb-navbar.png"
        alt={alt}
        width={300}
        height={64}
        style={{ height: displayHeight, width: 'auto' }}
        className="jb-logo-img"
        priority
      />
    );
  if (!chip) return image;
  return <span className="jb-logo-chip">{image}</span>;
}
