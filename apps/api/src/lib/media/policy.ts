import crypto from 'node:crypto';

/**
 * Centralized media upload policy — the single source of truth for allowed
 * contexts, formats, sizes, folders, and public-ID rules (Phase C §83).
 * Pure functions only: no Cloudinary SDK, no auth, no business logic here.
 */

export const MEDIA_CONTEXTS = ['product', 'profile'] as const;
export type MediaContext = (typeof MEDIA_CONTEXTS)[number];

export const MEDIA_RESOURCE_TYPE = 'image' as const;

/** Commerce upload policy per context. Sizes are declared client bytes. */
export const MEDIA_POLICY: Record<
  MediaContext,
  {
    folderSegment: string;
    allowedMimeTypes: readonly string[];
    allowedFormats: readonly string[];
    maxBytes: number;
  }
> = {
  // JPEG/PNG/WebP only. AVIF is deliberately deferred: predictable pipeline
  // first; it can be added without a breaking change once Phase D/F confirms
  // delivery/validation support end to end.
  product: {
    folderSegment: 'products',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 8_000_000,
  },
  profile: {
    folderSegment: 'profiles',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
    maxBytes: 5_000_000,
  },
};

export function isMediaContext(value: unknown): value is MediaContext {
  return typeof value === 'string' && (MEDIA_CONTEXTS as readonly string[]).includes(value);
}

export function isAllowedMimeType(context: MediaContext, mimeType: string): boolean {
  return (MEDIA_POLICY[context].allowedMimeTypes as readonly string[]).includes(mimeType.toLowerCase());
}

export function isAllowedFormat(context: MediaContext, format: string): boolean {
  return (MEDIA_POLICY[context].allowedFormats as readonly string[]).includes(format.toLowerCase());
}

export function isWithinSizeLimit(context: MediaContext, bytes: number): boolean {
  return Number.isInteger(bytes) && bytes > 0 && bytes <= MEDIA_POLICY[context].maxBytes;
}

/** Controlled folder: `<base>/<context-plural>`. Never client-controlled. */
export function folderFor(baseFolder: string, context: MediaContext): string {
  return `${baseFolder}/${MEDIA_POLICY[context].folderSegment}`;
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24);
}

/**
 * Server-generated public ID. UUID entropy makes collisions and deliberate
 * overwrites infeasible; the client can never choose or guess a sibling
 * asset's ID. Profile IDs are namespaced by owner user ID for orphan triage —
 * ownership itself is enforced from the session, never from this string.
 */
export function publicIdFor(context: MediaContext, ownerUserId?: string): string {
  if (context === 'profile') {
    if (!ownerUserId) throw new Error('Profile media requires an owner user ID.');
    return `${sanitizeIdSegment(ownerUserId)}/${randomSuffix()}`;
  }
  return randomSuffix();
}

function sanitizeIdSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (!cleaned) throw new Error('Invalid owner identifier for media public ID.');
  return cleaned;
}

/** Full Cloudinary public ID as returned by the provider (`folder/publicId`). */
export function fullPublicId(folder: string, publicId: string): string {
  return `${folder}/${publicId}`;
}

/**
 * Guard for destructive operations: only assets inside our own base folder
 * may be managed. Rejects traversal (`..`), absolute paths, and foreign
 * folders before any Cloudinary call happens.
 */
export function isManagedPublicId(baseFolder: string, publicId: string): boolean {
  if (typeof publicId !== 'string' || publicId.length === 0 || publicId.length > 220) return false;
  if (publicId.includes('..') || publicId.startsWith('/') || publicId.includes('\\')) return false;
  if (!/^[A-Za-z0-9_/-]+$/.test(publicId)) return false;
  return publicId === baseFolder || publicId.startsWith(`${baseFolder}/`);
}

/** Cloudinary delivery host allowlist for result validation (no wildcards). */
export const CLOUDINARY_DELIVERY_HOST = 'res.cloudinary.com';

export function isTrustedDeliveryUrl(secureUrl: string): boolean {
  try {
    const parsed = new URL(secureUrl);
    return parsed.protocol === 'https:' && parsed.hostname === CLOUDINARY_DELIVERY_HOST;
  } catch {
    return false;
  }
}
