/**
 * Controlled Cloudinary delivery variants (Phase D).
 * The stored canonical `secureUrl` is never rewritten; display sizes are
 * derived at render time by inserting ONE of the fixed presets below.
 * No user input ever reaches the transformation string.
 */

export type DisplayPreset = 'thumbnail' | 'detail';

const PRESETS: Record<DisplayPreset, string> = {
  // Bounded (never upscale), format/quality auto — identical output everywhere.
  thumbnail: 'c_limit,w_400/f_auto/q_auto',
  detail: 'c_limit,w_1200/f_auto/q_auto',
};

const DELIVERY_HOST = 'https://res.cloudinary.com/';
const UPLOAD_SEGMENT = '/image/upload/';

/** Returns the canonical URL unchanged for non-Cloudinary/legacy assets. */
export function cloudinaryDisplayUrl(secureUrl: string | null | undefined, preset: DisplayPreset): string | null {
  if (!secureUrl) return null;
  const marker = `${DELIVERY_HOST}`;
  const uploadMarker = `${UPLOAD_SEGMENT}`;
  if (!secureUrl.startsWith(marker) || !secureUrl.includes(uploadMarker)) return secureUrl;
  if (secureUrl.includes('/upload/c_limit,')) return secureUrl; // already derived
  return secureUrl.replace(uploadMarker, `/image/upload/${PRESETS[preset]}/`);
}
