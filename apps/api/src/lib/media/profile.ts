import { HttpError } from '../errors.js';
import { logger } from '../logger.js';
import { prisma } from '../prisma.js';
import { destroyMedia, getMediaConfig, normalizeUploadResult } from './cloudinary.js';
import { folderFor } from './policy.js';

/**
 * Profile-avatar domain service (Phase F). Identity always comes from the
 * session user ID — callers never accept a client-supplied user ID.
 * `avatarPublicId` stays server-side; clients see only `avatarUrl`.
 */

export type AvatarResultInput = {
  publicId: unknown;
  secureUrl: unknown;
  width: unknown;
  height: unknown;
  format: unknown;
  bytes?: unknown;
};

export type AvatarOutcome = {
  avatarUrl: string | null;
  /** Old-asset cleanup result; `skipped` when there was nothing to remove. */
  providerCleanup: 'deleted' | 'failed' | 'skipped';
};

/**
 * Persist a freshly uploaded avatar. The public ID must live under this
 * user's own profile namespace (`profiles/<userId>/…`) — anything else is
 * rejected before any write happens.
 */
export async function setUserAvatar(userId: string, result: AvatarResultInput): Promise<AvatarOutcome> {
  const config = getMediaConfig();
  const validated = normalizeUploadResult(config.baseFolder, 'profile', {
    public_id: result.publicId,
    secure_url: result.secureUrl,
    resource_type: 'image',
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
  });

  const expectedPrefix = `${folderFor(config.baseFolder, 'profile')}/${userId}/`;
  if (!validated.publicId.startsWith(expectedPrefix)) {
    // A valid provider asset, but not this user's upload identity.
    throw new HttpError(403, 'AVATAR_NOT_OWNED', 'This media does not belong to your profile.');
  }

  const current = await prisma.user.findUnique({ where: { id: userId }, select: { avatarPublicId: true } });
  if (!current) throw new HttpError(404, 'USER_NOT_FOUND', 'Account not found.');

  await prisma.user.update({
    where: { id: userId },
    data: { avatarUrl: validated.secureUrl, avatarPublicId: validated.publicId },
  });

  // Old asset cleanup only after the new avatar is safely persisted.
  let providerCleanup: AvatarOutcome['providerCleanup'] = 'skipped';
  if (current.avatarPublicId && current.avatarPublicId !== validated.publicId) {
    try {
      await destroyMedia(current.avatarPublicId);
      providerCleanup = 'deleted';
    } catch (error) {
      logger.error({ err: error, userId, publicId: current.avatarPublicId }, 'media.avatar_cleanup_failed');
      providerCleanup = 'failed';
    }
  }
  return { avatarUrl: validated.secureUrl, providerCleanup };
}

/** Remove the avatar entirely (URL + provider reference + asset). */
export async function removeUserAvatar(userId: string): Promise<AvatarOutcome> {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { avatarPublicId: true, avatarUrl: true } });
  if (!current) throw new HttpError(404, 'USER_NOT_FOUND', 'Account not found.');
  if (!current.avatarUrl && !current.avatarPublicId) {
    return { avatarUrl: null, providerCleanup: 'skipped' };
  }

  await prisma.user.update({ where: { id: userId }, data: { avatarUrl: null, avatarPublicId: null } });

  let providerCleanup: AvatarOutcome['providerCleanup'] = 'skipped';
  if (current.avatarPublicId) {
    try {
      await destroyMedia(current.avatarPublicId);
      providerCleanup = 'deleted';
    } catch (error) {
      logger.error({ err: error, userId, publicId: current.avatarPublicId }, 'media.avatar_cleanup_failed');
      providerCleanup = 'failed';
    }
  }
  return { avatarUrl: null, providerCleanup };
}
