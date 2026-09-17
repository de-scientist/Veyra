import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';

import { env } from './env.js';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(`${env.AUTH_SECRET}:${token}`).digest('hex');
}

export function buildPermissionKey(resource: string, action: string): string {
  return `${resource}.${action}`;
}

export function hasRequiredPermission(
  roles: Array<{ role?: { slug?: string | null } | null }>,
  permission: string,
): boolean {
  const normalizedPermission = permission.toLowerCase();
  const roleSlugs = roles
    .map((entry) => entry.role?.slug?.toLowerCase())
    .filter((role): role is string => typeof role === 'string');

  if (roleSlugs.some((role) => role === 'admin' || role === 'super_admin' || role === 'super-admin')) {
    return true;
  }

  return normalizedPermission === 'account.read' && roleSlugs.includes('customer');
}
