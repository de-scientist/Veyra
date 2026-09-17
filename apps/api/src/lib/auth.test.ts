import { describe, expect, it } from 'vitest';

import {
  buildPermissionKey,
  hashPassword,
  hasRequiredPermission,
  hashToken,
  verifyPassword,
} from './auth.js';

describe('auth utilities', () => {
  it('hashes and verifies passwords', async () => {
    const password = 'StrongPass123!';
    const hash = await hashPassword(password);

    expect(hash).not.toBe(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('WrongPass123!', hash)).toBe(false);
  });

  it('hashes session and reset tokens consistently', () => {
    const token = 'session-token-123';
    const first = hashToken(token);
    const second = hashToken(token);

    expect(first).toBe(second);
    expect(first).not.toBe(token);
  });

  it('evaluates permissions from role metadata', () => {
    const roles = [
      { role: { slug: 'customer' } },
      { role: { slug: 'staff' } },
    ];

    expect(hasRequiredPermission(roles, 'orders.read')).toBe(false);
    expect(hasRequiredPermission(roles, 'users.read')).toBe(false);
    expect(hasRequiredPermission([{ role: { slug: 'admin' } }], 'users.read')).toBe(true);
    expect(buildPermissionKey('products', 'manage')).toBe('products.manage');
  });
});
