import type { FastifyRequest } from 'fastify';

import { HttpError } from '../errors.js';
import { logger } from '../logger.js';
import { authorizeDirectUpload, type UploadAuthorization } from './cloudinary.js';
import { isMediaContext, type MediaContext } from './policy.js';

type ServiceRequest = FastifyRequest & { user?: { id: string; roles?: Array<{ role?: { slug?: string | null } | null }> } };

function requesterId(request: ServiceRequest): string {
  const id = request.user?.id;
  if (!id) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required.');
  return id;
}

/**
 * Application media service — owns the WHO/WHAT decisions; the provider
 * module owns the HOW (signing). Route layer owns HTTP + coarse guards.
 *
 * - `profile`: any authenticated user, strictly scoped to their own session
 *   identity. Client-supplied user IDs are never accepted.
 * - `product`: caller must already have passed `requireOperationsAccess`
 *   (existing catalogue permission model — no new permission invented).
 */
export function authorizeUpload(
  request: ServiceRequest,
  input: { context: unknown; contentType?: unknown; bytes?: unknown },
): UploadAuthorization {
  if (!isMediaContext(input.context)) {
    throw new HttpError(400, 'INVALID_MEDIA_CONTEXT', 'Unknown media context.');
  }
  const context: MediaContext = input.context;
  const userId = requesterId(request);

  const declaredMimeType =
    typeof input.contentType === 'string' && input.contentType.length > 0 ? input.contentType : undefined;
  const declaredBytes = typeof input.bytes === 'number' ? input.bytes : undefined;

  const authorization = authorizeDirectUpload({
    context,
    // Identity comes from the server-loaded session — never from the body.
    ownerUserId: context === 'profile' ? userId : undefined,
    declaredMimeType,
    declaredBytes,
  });

  // Safe operational log: context + actor only. No signatures, secrets,
  // tokens, or upload payloads.
  logger.info({ context, userId }, 'media.upload_authorized');
  return authorization;
}
