/**
 * Avatar display helpers (pure, framework-free so they are unit-testable).
 *
 * The navbar consumes `avatarUrl` opaquely — whatever storage backs it
 * (Phase C/F Cloudinary work) needs no navbar change.
 */

export type AvatarUser = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

function firstGrapheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  // Array.from splits on code points, so astral-plane characters and most
  // emoji stay intact instead of producing a lone surrogate half.
  return Array.from(trimmed)[0]?.toUpperCase() ?? '';
}

/**
 * Deterministic initials fallback:
 * - first + last name → two letters (`Mark Kinyanjui` → `MK`)
 * - single name → one letter (`Mark` → `M`)
 * - missing names → first letter of the email local part
 * - nothing usable → `?` (never empty, never private data)
 */
export function getInitials(user: AvatarUser): string {
  const first = (user.firstName ?? '').trim();
  const last = (user.lastName ?? '').trim();
  if (first && last) return `${firstGrapheme(first)}${firstGrapheme(last)}`;
  const single = first || last;
  if (single) return firstGrapheme(single);
  const localPart = (user.email ?? '').split('@')[0] ?? '';
  if (localPart.trim()) return firstGrapheme(localPart);
  return '?';
}

/** Concise, non-sensitive display name for labels and menu headers. */
export function getDisplayName(user: AvatarUser): string {
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim().replace(/\s+/g, ' ');
  if (full) return full;
  const localPart = (user.email ?? '').split('@')[0]?.trim();
  if (localPart) return localPart;
  return 'My account';
}

/** Accessible label for the avatar menu trigger button. */
export function getAvatarMenuLabel(user: AvatarUser): string {
  return `Open account menu for ${getDisplayName(user)}`;
}
