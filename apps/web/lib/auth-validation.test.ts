import { describe, expect, it } from 'vitest';

import {
  PASSWORD_MIN_LENGTH,
  loginSchema,
  mapAuthServerError,
  normalizeEmail,
  passwordHint,
  registerSchema,
  safeRedirectTarget,
} from './auth-validation';

function codeError(code: string, message = 'Something went wrong. Please try again.', details?: unknown) {
  const error = new Error(message) as Error & { code?: string; details?: unknown };
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

describe('login validation', () => {
  it('rejects empty fields with actionable messages', () => {
    const result = loginSchema.safeParse({ email: '', password: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Enter your email address.');
      expect(messages).toContain('Enter your password.');
    }
  });

  it('rejects invalid email syntax without being overly restrictive', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'password123' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b', password: 'password123' }).success).toBe(false);
    // Permissive: plus-tags, subdomains, long TLDs pass client-side.
    expect(
      loginSchema.safeParse({ email: 'amina.otieno+shop@sub.example.co.ke', password: 'password123' }).success,
    ).toBe(true);
  });

  it('trims accidental whitespace and enforces the backend min-length', () => {
    expect(loginSchema.safeParse({ email: '  you@example.com  ', password: 'password123' }).success).toBe(true);
    const short = loginSchema.safeParse({ email: 'you@example.com', password: 'short' });
    expect(short.success).toBe(false);
  });

  it('matches the backend password policy (minimum 8)', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });
});

describe('registration validation', () => {
  const valid = {
    firstName: 'Amina',
    lastName: "Otieno-Njoroge",
    email: 'amina@example.com',
    phone: '',
    password: 'password123',
    confirm: 'password123',
  };

  it('accepts a complete valid payload', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects whitespace-only names', () => {
    for (const field of ['firstName', 'lastName'] as const) {
      const result = registerSchema.safeParse({ ...valid, [field]: '   ' });
      expect(result.success).toBe(false);
    }
  });

  it('preserves legitimate names (hyphens, apostrophes, non-English characters)', () => {
    expect(
      registerSchema.safeParse({ ...valid, firstName: "Anne-Marie", lastName: "O'Neill Wanjikũ" }).success,
    ).toBe(true);
  });

  it('rejects mismatched confirmation', () => {
    const result = registerSchema.safeParse({ ...valid, confirm: 'different123' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'confirm')).toBe(true);
      expect(result.error.issues.map((i) => i.message)).toContain('The passwords do not match.');
    }
  });

  it('enforces the backend password minimum', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'short', confirm: 'short' });
    expect(result.success).toBe(false);
  });

  it('cannot grant privileged roles or statuses (no such fields survive parsing)', () => {
    const parsed = registerSchema.safeParse({
      ...valid,
      role: 'admin',
      roles: ['super_admin'],
      status: 'ACTIVE',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('role');
      expect(parsed.data).not.toHaveProperty('roles');
      expect(parsed.data).not.toHaveProperty('status');
    }
  });

  it('treats phone as optional', () => {
    expect(registerSchema.safeParse({ ...valid, phone: '' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, phone: '0712 345 678' }).success).toBe(true);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases exactly like the backend', () => {
    expect(normalizeEmail('  Amina@Example.COM  ')).toBe('amina@example.com');
  });
});

describe('safeRedirectTarget', () => {
  it('defaults to /account', () => {
    expect(safeRedirectTarget(null)).toBe('/account');
    expect(safeRedirectTarget('')).toBe('/account');
  });

  it('preserves legitimate internal destinations (e.g. checkout)', () => {
    expect(safeRedirectTarget('/checkout')).toBe('/checkout');
    expect(safeRedirectTarget('/account/orders')).toBe('/account/orders');
  });

  it('rejects external, protocol-relative, and scheme destinations', () => {
    expect(safeRedirectTarget('https://evil.example.com')).toBe('/account');
    expect(safeRedirectTarget('//evil.example.com')).toBe('/account');
    expect(safeRedirectTarget('javascript:alert(1)')).toBe('/account');
    expect(safeRedirectTarget('/account:evil')).toBe('/account');
  });

  it('rejects malformed values', () => {
    expect(safeRedirectTarget('%')).toBe('/account');
  });
});

describe('mapAuthServerError', () => {
  it('maps invalid credentials without enumerating accounts', () => {
    const mapped = mapAuthServerError(codeError('INVALID_CREDENTIALS', 'Invalid email or password.'));
    expect(mapped.formError.title).toBe('Unable to sign in');
    expect(mapped.formError.message).not.toMatch(/exists|registered|unknown email/i);
    expect(mapped.fieldErrors).toBeUndefined();
  });

  it('maps duplicate accounts to the email field with a safe message', () => {
    const mapped = mapAuthServerError(codeError('USER_EXISTS', 'A user with this email already exists.'));
    expect(mapped.formError.title).toBe('Unable to create your account');
    expect(mapped.fieldErrors?.email).toBeTruthy();
  });

  it('maps rate limiting to a wait-and-retry message', () => {
    const mapped = mapAuthServerError(codeError('RATE_LIMITED', 'Too many requests.'));
    expect(mapped.formError.title).toBe('Too many attempts');
  });

  it('maps network failures to a recoverable message', () => {
    const mapped = mapAuthServerError(new Error('Failed to fetch'));
    expect(mapped.formError.title).toBe('Connection problem');
  });

  it('maps session-establishment failures explicitly', () => {
    const mapped = mapAuthServerError(codeError('SESSION_FAILED', 'Session failed.'));
    expect(mapped.formError.title).toMatch(/session/i);
  });

  it('maps structured field issues onto fields', () => {
    const mapped = mapAuthServerError(
      codeError('VALIDATION_FAILED', 'Validation failed.', {
        issues: [{ field: 'email', code: 'invalid', message: 'Enter a valid email address.' }],
      }),
    );
    expect(mapped.fieldErrors?.email).toBe('Enter a valid email address.');
  });

  it('never surfaces internals (SQL, stack, tokens, cookies)', () => {
    for (const leak of [
      'PrismaClientKnownRequestError: SQL constraint',
      'stack trace at node:internal/main',
      'token abc123 leaked',
      'cookie veyra_session=xyz',
    ]) {
      const mapped = mapAuthServerError(new Error(leak));
      expect(`${mapped.formError.title} ${mapped.formError.message}`).not.toMatch(/prisma|sql|stack|token|cookie/i);
    }
  });

  it('handles non-Error failures with a generic message', () => {
    const mapped = mapAuthServerError(null);
    expect(mapped.formError.message).toBeTruthy();
  });
});

describe('passwordHint', () => {
  it('returns null for empty or sufficient passwords', () => {
    expect(passwordHint('')).toBeNull();
    expect(passwordHint('password123')).toBeNull();
  });

  it('explains how many characters remain', () => {
    expect(passwordHint('abc')).toMatch(/5 more characters/);
  });
});
