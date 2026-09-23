/**
 * Reusable direct-to-Cloudinary upload helper (Phase C infrastructure).
 * No Phase D/F UI here — this is the transport future screens will use.
 *
 * Flow: authorize via JB API → XHR POST to Cloudinary (progress events;
 * fetch cannot report upload progress) → normalize + validate result.
 * The helper never sees the Cloudinary API secret; only the signed fields.
 */

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export type MediaContext = 'product' | 'profile';

export type UploadAuthorization = {
  provider: 'cloudinary';
  cloudName: string;
  apiKey: string;
  uploadUrl: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  resourceType: 'image';
  allowedFormats: string[];
  allowedMimeTypes: string[];
  maxBytes: number;
};

export type UploadedMedia = {
  provider: 'cloudinary';
  publicId: string;
  secureUrl: string;
  width: number;
  height: number;
  format: string;
  bytes?: number;
};

export type UploadStatus = 'idle' | 'authorizing' | 'uploading' | 'success' | 'error';

export class MediaUploadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaUploadError';
    this.code = code;
  }
}

async function parseApiBody(response: Response): Promise<{ data?: unknown; error?: { code?: string; message?: string } }> {
  return (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  } | null ?? {};
}

/** Step 1: request a server-signed upload authorization (never the secret). */
export async function requestUploadAuthorization(
  context: MediaContext,
  file: { type: string; size: number },
): Promise<UploadAuthorization> {
  const response = await fetch(`${apiBaseUrl}/api/v1/media/sign-upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ context, contentType: file.type, bytes: file.size }),
  });
  const body = await parseApiBody(response);
  if (!response.ok) {
    throw new MediaUploadError(
      body.error?.code ?? 'AUTHORIZATION_FAILED',
      body.error?.message ?? 'Media upload is not available right now. Please try again.',
    );
  }
  const auth = body.data as UploadAuthorization;
  if (!auth || auth.provider !== 'cloudinary' || !auth.signature || !auth.uploadUrl) {
    throw new MediaUploadError('INVALID_AUTHORIZATION', 'The server returned an unusable upload authorization.');
  }
  return auth;
}

/**
 * Normalize + validate a Cloudinary upload response (pure — unit-tested).
 * Defense in depth: the domain finalization endpoints re-validate
 * server-side in Phase D/F before persisting anything.
 */
export function normalizeCloudinaryResponse(
  auth: Pick<UploadAuthorization, 'folder' | 'publicId' | 'allowedFormats' | 'maxBytes'>,
  result: {
    public_id?: unknown;
    secure_url?: unknown;
    resource_type?: unknown;
    format?: unknown;
    width?: unknown;
    height?: unknown;
    bytes?: unknown;
    error?: { message?: unknown };
  },
): UploadedMedia {
  if (result && typeof result.error?.message === 'string') {
    throw new MediaUploadError('PROVIDER_REJECTED', 'Cloudinary rejected the upload. Check the file type and size, then try again.');
  }
  const publicId = typeof result.public_id === 'string' ? result.public_id : '';
  const secureUrl = typeof result.secure_url === 'string' ? result.secure_url : '';
  const resourceType = typeof result.resource_type === 'string' ? result.resource_type : '';
  const format = typeof result.format === 'string' ? result.format.toLowerCase() : '';
  const width = typeof result.width === 'number' ? result.width : NaN;
  const height = typeof result.height === 'number' ? result.height : NaN;
  const bytes = typeof result.bytes === 'number' ? result.bytes : undefined;

  const expectedPublicId = `${auth.folder}/${auth.publicId}`;
  if (!publicId || publicId !== expectedPublicId) {
    throw new MediaUploadError('UNEXPECTED_ASSET', 'The upload response did not match the authorized asset.');
  }
  if (resourceType !== 'image') {
    throw new MediaUploadError('INVALID_RESOURCE', 'Only image uploads are accepted.');
  }
  if (!secureUrl.startsWith('https://res.cloudinary.com/')) {
    throw new MediaUploadError('UNTRUSTED_URL', 'The upload did not return a trusted secure delivery URL.');
  }
  if (!format || !auth.allowedFormats.map((f) => f.toLowerCase()).includes(format)) {
    throw new MediaUploadError('UNSUPPORTED_FORMAT', 'The uploaded file format is not allowed.');
  }
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new MediaUploadError('INVALID_DIMENSIONS', 'The uploaded asset is missing valid dimensions.');
  }
  if (bytes !== undefined && (!Number.isInteger(bytes) || bytes <= 0 || bytes > auth.maxBytes)) {
    throw new MediaUploadError('FILE_TOO_LARGE', 'The uploaded file exceeds the maximum allowed size.');
  }
  return { provider: 'cloudinary', publicId, secureUrl, width, height, format, bytes };
}

/** Step 2: direct browser upload with real progress (XHR) + cancellation. */
export function uploadFileDirectlyToCloudinary(
  auth: UploadAuthorization,
  file: File,
  options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    // Exactly the server-signed fields — nothing else is authorized.
    form.append('file', file);
    form.append('api_key', auth.apiKey);
    form.append('timestamp', String(auth.timestamp));
    form.append('signature', auth.signature);
    form.append('folder', auth.folder);
    form.append('public_id', auth.publicId);

    if (options?.signal?.aborted) {
      reject(new MediaUploadError('CANCELLED', 'The upload was cancelled.'));
      return;
    }
    const onAbort = () => {
      xhr.abort();
      reject(new MediaUploadError('CANCELLED', 'The upload was cancelled.'));
    };
    options?.signal?.addEventListener('abort', onAbort, { once: true });

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && event.total > 0) {
        options?.onProgress?.(Math.min(1, Math.max(0, event.loaded / event.total)));
      }
    });
    xhr.addEventListener('load', () => {
      options?.signal?.removeEventListener('abort', onAbort);
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new MediaUploadError('UPLOAD_FAILED', 'The upload failed. Please check your connection and try again.'));
        return;
      }
      try {
        const result = JSON.parse(xhr.responseText) as Parameters<typeof normalizeCloudinaryResponse>[1];
        resolve(normalizeCloudinaryResponse(auth, result));
      } catch (error) {
        reject(error instanceof MediaUploadError ? error : new MediaUploadError('INVALID_RESPONSE', 'The upload returned an unreadable response.'));
      }
    });
    xhr.addEventListener('error', () => {
      options?.signal?.removeEventListener('abort', onAbort);
      reject(new MediaUploadError('NETWORK_ERROR', 'The upload failed. Please check your connection and try again.'));
    });
    xhr.open('POST', auth.uploadUrl);
    xhr.send(form);
  });
}

/** Full helper flow for future Phase D/F screens. */
export async function uploadMedia(
  context: MediaContext,
  file: File,
  options?: { onProgress?: (fraction: number) => void; signal?: AbortSignal },
): Promise<UploadedMedia> {
  const auth = await requestUploadAuthorization(context, file);
  return uploadFileDirectlyToCloudinary(auth, file, options);
}
