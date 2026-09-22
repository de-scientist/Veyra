'use client';

import Image from 'next/image';
import { useState } from 'react';

import { getDisplayName, getInitials, type AvatarUser } from '../lib/avatar';
import { cloudinaryDisplayUrl } from '../lib/cloudinary-display';

type AvatarSize = 'sm' | 'md' | 'lg';

const SIZE_PX: Record<AvatarSize, number> = { sm: 32, md: 40, lg: 64 };

/**
 * Reusable JB avatar: `avatarUrl` image when available, deterministic
 * initials fallback otherwise (including broken-image recovery).
 * Theme-safe: initials chip uses design tokens, never hard-coded colors.
 */
export function UserAvatar({
  user,
  size = 'md',
  decorative = false,
}: {
  user: AvatarUser;
  size?: AvatarSize;
  /** True when nested inside a labelled control (the control owns the name). */
  decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const px = SIZE_PX[size];
  const rawSrc = user.avatarUrl?.trim() || null;
  // Optimized avatar delivery: square crop at render time; legacy/external
  // URLs pass through untouched. Never loads original-resolution bytes.
  const src = rawSrc ? (cloudinaryDisplayUrl(rawSrc, 'avatar') ?? rawSrc) : null;
  const showImage = Boolean(src) && !failed;

  if (showImage && src) {
    return (
      <span className={`jb-avatar jb-avatar--${size}`} style={{ width: px, height: px }} aria-hidden={decorative ? true : undefined}>
        <Image
          src={src}
          alt={decorative ? '' : getDisplayName(user)}
          width={px}
          height={px}
          className="jb-avatar__image"
          onError={() => setFailed(true)}
          unoptimized
        />
        {/* If the image element is removed from layout (rare), initials show. */}
        <span className="jb-avatar__fallback" aria-hidden="true">
          {getInitials(user)}
        </span>
      </span>
    );
  }

  return (
    <span
      className={`jb-avatar jb-avatar--${size}`}
      style={{ width: px, height: px }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : getDisplayName(user)}
      aria-hidden={decorative ? true : undefined}
    >
      <span className="jb-avatar__fallback" aria-hidden={decorative ? undefined : true}>
        {getInitials(user)}
      </span>
    </span>
  );
}
