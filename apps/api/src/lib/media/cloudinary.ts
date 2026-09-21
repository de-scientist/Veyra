import { v2 as cloudinary } from 'cloudinary';

import { HttpError } from '../errors.js';
import { env } from '../env.js';
import { logger } from '../logger.js';
import {
  CLOUDINARY_DELIVERY_HOST,
  MEDIA_POLICY,
  MEDIA_RESOURCE_TYPE,
  folderFor,
  fullPublicId,
  isAllowedFormat,
  isAllowedMimeType,
  isManagedPublicId,
  isMediaContext,
  isTrustedDeliveryUrl,
  isWithinSizeLimit,
  publicIdFor,
  type MediaContext,
} from './policy.js';

/**
 * Server-only Cloudinary provider (Phase C). This module must never be
 * imported by frontend code — it touches `CLOUDINARY_API_SECRET`.
 *
 * Responsibilities: configure, sign controlled upload authorizations,
 * destroy owned assets, normalize/validate provider results.
 * Business decisions (who may upload, ownership) live in `service.ts`.
 */

export type MediaConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  baseFolder: string;
};

/** Test-only seam: lets API tests sign offline without real credentials. */
let testConfigOverride: MediaConfig | null = null;

export function setMediaConfigForTests(config: MediaConfig | null): void {
  testConfigOverride = config;
}

export function getMediaConfig(): MediaConfig {
  if (testConfigOverride) return testConfigOverride;
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    // Fail safe in every environment: never pretend uploads work.
    throw new HttpError(
      503,
      'MEDIA_NOT_CONFIGURED',
      'Media uploads are not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
    );
  }
  return { cloudName, apiKey, apiSecret, baseFolder: env.CLOUDINARY_UPLOAD_FOLDER };
}

function configuredCloudinary(config: MediaConfig) {
  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });
  return cloudinary;
}

export type UploadAuthorization = {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  resourceType: typeof MEDIA_RESOURCE_TYPE;
  allowedFormats: readonly string[];
  allowedMimeTypes: readonly string[];
  maxBytes: number;
};

/**
 * Build the exact parameter set that is signed. Only server-controlled
 * values are signed — the client echoes them back verbatim on upload.
 * `overwrite` is intentionally NOT part of the contract: public IDs are
 * server-generated UUIDs, so collisions/overwrites are infeasible, and
 * omitting it avoids boolean-serialization signature mismatches.
 */
export function buildSignableParams(input: { timestamp: number; folder: string; publicId: string }): Record<string, string | number> {
  return {
    timestamp: input.timestamp,
    folder: input.folder,
    public_id: input.publicId,
  };
}

export function signParams(config: MediaConfig, params: Record<string, string | number>): string {
  return configuredCloudinary(config).utils.api_sign_request(params, config.apiSecret);
}

export function authorizeDirectUpload(input: {
  context: MediaContext;
  ownerUserId?: string;
  declaredMimeType?: string;
  declaredBytes?: number;
}): UploadAuthorization {
  if (!isMediaContext(input.context)) {
    throw new HttpError(400, 'INVALID_MEDIA_CONTEXT', 'Unknown media context.');
  }
  if (input.declaredMimeType !== undefined && !isAllowedMimeType(input.context, input.declaredMimeType)) {
    throw new HttpError(400, 'UNSUPPORTED_MEDIA_TYPE', 'This file type is not allowed for the requested media context.');
  }
  if (input.declaredBytes !== undefined && !isWithinSizeLimit(input.context, input.declaredBytes)) {
    const statusCode = Number.isInteger(input.declaredBytes) && input.declaredBytes > 0 ? 413 : 400;
    throw new HttpError(statusCode, 'MEDIA_TOO_LARGE', 'The file exceeds the maximum allowed size for this media context.');
  }

  const config = getMediaConfig();
  // Backend-generated timestamp: signatures are meant for immediate use.
  // Cloudinary enforces its own timestamp freshness window; we document the
  // prompt-use expectation rather than claiming an expiry we do not enforce.
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = folderFor(config.baseFolder, input.context);
  const publicId = publicIdFor(input.context, input.ownerUserId);
  const signable = buildSignableParams({ timestamp, folder, publicId });
  const signature = signParams(config, signable);

  return {
    provider: 'cloudinary',
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/${MEDIA_RESOURCE_TYPE}/upload`,
    timestamp,
    signature,
    folder,
    publicId,
    resourceType: MEDIA_RESOURCE_TYPE,
    allowedFormats: MEDIA_POLICY[input.context].allowedFormats,
    allowedMimeTypes: MEDIA_POLICY[input.context].allowedMimeTypes,
    maxBytes: MEDIA_POLICY[input.context].maxBytes,
  };
}

export type MediaAsset = {
  provider: 'cloudinary';
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes?: number;
};

export type RawCloudinaryResult = {
  public_id?: unknown;
  secure_url?: unknown;
  resource_type?: unknown;
  format?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
};

/**
 * Normalize + validate a Cloudinary upload response before the application
 * persists anything. Rejects foreign folders, non-image resources,
 * non-HTTPS/off-host URLs, unexpected formats, and over-limit bytes.
 * Declared client MIME/size are advisory only (§14); this is the real gate,
 * applied at domain finalization in Phase D/F.
 */
export function normalizeUploadResult(
  baseFolder: string,
  context: MediaContext,
  result: RawCloudinaryResult,
): MediaAsset {
  const publicId = typeof result.public_id === 'string' ? result.public_id : '';
  const secureUrl = typeof result.secure_url === 'string' ? result.secure_url : '';
  const resourceType = typeof result.resource_type === 'string' ? result.resource_type : '';
  const format = typeof result.format === 'string' ? result.format.toLowerCase() : '';
  const width = typeof result.width === 'number' ? result.width : NaN;
  const height = typeof result.height === 'number' ? result.height : NaN;
  const bytes = typeof result.bytes === 'number' ? result.bytes : undefined;

  const expectedPrefix = `${folderFor(baseFolder, context)}/`;
  if (!publicId || !isManagedPublicId(baseFolder, publicId) || !publicId.startsWith(expectedPrefix)) {
    throw new HttpError(400, 'INVALID_MEDIA_RESULT', 'The uploaded asset does not belong to the requested media context.');
  }
  if (resourceType !== MEDIA_RESOURCE_TYPE) {
    throw new HttpError(400, 'INVALID_MEDIA_RESULT', 'Only image uploads are accepted for this media context.');
  }
  if (!secureUrl || !isTrustedDeliveryUrl(secureUrl)) {
    throw new HttpError(400, 'INVALID_MEDIA_RESULT', `Media must be served over HTTPS from ${CLOUDINARY_DELIVERY_HOST}.`);
  }
  if (!format || !isAllowedFormat(context, format)) {
    throw new HttpError(400, 'INVALID_MEDIA_RESULT', 'The uploaded file format is not allowed for this media context.');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new HttpError(400, 'INVALID_MEDIA_RESULT', 'The uploaded asset is missing valid dimensions.');
  }
  if (bytes !== undefined && !isWithinSizeLimit(context, bytes)) {
    throw new HttpError(413, 'MEDIA_TOO_LARGE', 'The uploaded file exceeds the maximum allowed size.');
  }

  return { provider: 'cloudinary', publicId, secureUrl, width, height, format, bytes };
}

/**
 * Server-side asset destruction for future domain lifecycles (Phase D/F).
 * There is deliberately NO generic HTTP delete endpoint: callers must be
 * domain endpoints with ownership/permission checks. The folder-prefix guard
 * runs before any Cloudinary call so foreign assets can never be targeted.
 */
export async function destroyMedia(publicId: string): Promise<void> {
  const config = getMediaConfig();
  if (!isManagedPublicId(config.baseFolder, publicId)) {
    throw new HttpError(400, 'INVALID_MEDIA_PUBLIC_ID', 'Only application-managed media assets can be deleted.');
  }
  try {
    await configuredCloudinary(config).uploader.destroy(publicId, { resource_type: MEDIA_RESOURCE_TYPE });
  } catch (error) {
    logger.error({ err: error, publicId }, 'media.delete_failed');
    throw new HttpError(502, 'MEDIA_PROVIDER_ERROR', 'The media provider could not delete the asset.');
  }
}

export { fullPublicId };
