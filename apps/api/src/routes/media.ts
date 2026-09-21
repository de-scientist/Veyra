import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { authorizeUpload } from '../lib/media/service.js';
import { requireAuth, requireOperationsAccess } from '../middleware/auth.js';
import { sensitiveLimit } from '../lib/rateLimits.js';

/**
 * Media upload authorization (Phase C infrastructure).
 *
 * POST /media/sign-upload { context, contentType?, bytes? }
 *   → 200 { provider, cloudName, apiKey, uploadUrl, timestamp, signature,
 *           folder, publicId, resourceType, allowedFormats, allowedMimeTypes,
 *           maxBytes }
 *
 * The browser uploads directly to `uploadUrl` with exactly the signed
 * fields. `CLOUDINARY_API_SECRET` never leaves the server. The schema
 * accepts only the three documented fields — folder/publicId/timestamp
 * overrides, role claims, and user IDs from the client are rejected or
 * (under ajv `removeAdditional`) stripped before they reach the service,
 * and the service derives identity/authorization from the session anyway.
 */
const signUploadSchema = z.object({
  context: z.string(),
  contentType: z.string().max(120).optional(),
  bytes: z.number().optional(),
});

export async function mediaRoutes(app: FastifyInstance) {
  app.post('/media/sign-upload', { ...sensitiveLimit(), preHandler: requireAuth }, async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = signUploadSchema.parse(request.body);

    if (payload.context === 'product') {
      // Product media follows the existing catalogue permission model:
      // operations staff only. requireAuth already ran in preHandler; this
      // adds the role check from the server-loaded session, never client
      // claims. Profile context stays with requireAuth (self-scoped in the
      // service from the session user ID).
      await requireOperationsAccess(request, reply);
    }

    const authorization = authorizeUpload(request, {
      context: payload.context,
      contentType: payload.contentType,
      bytes: payload.bytes,
    });

    return { success: true, data: authorization };
  });
}
