import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Components use the automatic JSX runtime, but vitest transpiles them with
// the classic runtime outside Next/SWC — provide the global they expect.
vi.stubGlobal('React', React);

import { AuthAlert } from '../components/AuthAlert';
import { PasswordField } from '../components/PasswordField';
import {
  NAME_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  loginSchema,
  mapAuthServerError,
  registerSchema,
  safeRedirectTarget,
} from './auth-validation';

function codeError(code: string, message = 'Something went wrong. Please try again.', details?: unknown) {
  const error = new Error(message) as Error & { code?: string; details?: unknown };
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

// ---------------------------------------------------------------------------
// Extra validation edge cases (beyond auth-validation.test.ts)
// ---------------------------------------------------------------------------

describe('auth validation edge cases', () => {
  it('accepts uppercase emails (backend lowercases)', () => {
    expect(
      loginSchema.safeParse({ email: 'AMINA@EXAMPLE.COM', password: 'password123' }).success,
    ).toBe(true);
  });

  it('accepts a password of exactly the backend minimum', () => {
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH);
    expect(loginSchema.safeParse({ email: 'a@b.co', password: exact }).success).toBe(true);
    expect(
      registerSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.co',
        phone: '',
        password: exact,
        confirm: exact,
      }).success,
    ).toBe(true);
  });

  it('rejects names longer than the server limit', () => {
    const long = 'A'.repeat(NAME_MAX_LENGTH + 1);
    const base = {
      firstName: 'Amina',
      lastName: 'Otieno',
      email: 'a@b.co',
      phone: '',
      password: 'password123',
      confirm: 'password123',
    };
    expect(registerSchema.safeParse({ ...base, firstName: long }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, lastName: long }).success).toBe(false);
  });

  it('requires password confirmation with an actionable message', () => {
    const result = registerSchema.safeParse({
      firstName: 'Amina',
      lastName: 'Otieno',
      email: 'a@b.co',
      phone: '',
      password: 'password123',
      confirm: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain('Confirm your password.');
    }
  });

  it('keeps phone truly optional (absent, empty, or Kenyan format)', () => {
    const base = {
      firstName: 'Amina',
      lastName: 'Otieno',
      email: 'a@b.co',
      password: 'password123',
      confirm: 'password123',
    };
    expect(registerSchema.safeParse({ ...base }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, phone: '' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, phone: '0712 345 678' }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, phone: '+254712345678' }).success).toBe(true);
  });
});

describe('safeRedirectTarget extras', () => {
  it('preserves internal paths with query strings', () => {
    expect(safeRedirectTarget('/checkout?step=pay')).toBe('/checkout?step=pay');
  });

  it('rejects backslash, encoded-slash, and data-scheme tricks', () => {
    expect(safeRedirectTarget('\\evil.com')).toBe('/account');
    expect(safeRedirectTarget('%2F%2Fevil.example.com')).toBe('/account');
    expect(safeRedirectTarget('data:text/html,hi')).toBe('/account');
  });
});

describe('mapAuthServerError extras', () => {
  it('maps suspended/disabled accounts without leaking status internals', () => {
    for (const code of ['ACCOUNT_SUSPENDED', 'ACCOUNT_DISABLED']) {
      const mapped = mapAuthServerError(codeError(code, 'Account suspended.'));
      expect(mapped.formError.title).toBe('Account unavailable');
    }
  });

  it('maps multiple structured field issues onto their fields', () => {
    const mapped = mapAuthServerError(
      codeError('VALIDATION_FAILED', 'Validation failed.', {
        issues: [
          { field: 'firstName', code: 'too_small', message: 'Enter your first name.' },
          { field: 'password', code: 'too_small', message: 'Your password must be at least 8 characters.' },
        ],
      }),
    );
    expect(mapped.formError.title).toBe('Check the highlighted fields');
    expect(mapped.fieldErrors?.firstName).toBe('Enter your first name.');
    expect(mapped.fieldErrors?.password).toContain('at least 8 characters');
  });

  it('passes through short safe server messages, falls back on long ones', () => {
    expect(mapAuthServerError(new Error('Please verify your details.')).formError.message).toBe(
      'Please verify your details.',
    );
    expect(
      mapAuthServerError(new Error('x'.repeat(500))).formError.message,
    ).toBe('Please check your connection and try again.');
  });
});

// ---------------------------------------------------------------------------
// Rendered component contracts (react-dom/server, no new test dependencies)
// ---------------------------------------------------------------------------

describe('PasswordField rendered contract', () => {
  it('associates label with input and exposes current-password autocomplete', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, {
        id: 'login-password',
        name: 'password',
        label: 'Password',
        autoComplete: 'current-password',
      }),
    );
    expect(html).toContain('<label for="login-password">Password</label>');
    expect(html).toContain('id="login-password"');
    // React 18 static markup keeps the camelCase prop name; browsers treat
    // the attribute case-insensitively, so autocomplete still applies.
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('type="password"');
  });

  it('renders a keyboard-accessible toggle that never submits the form', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, {
        id: 'login-password',
        name: 'password',
        label: 'Password',
        autoComplete: 'current-password',
      }),
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('wires error state accessibly (aria-invalid, describedby, role=alert)', () => {
    const html = renderToStaticMarkup(
      createElement(PasswordField, {
        id: 'login-password',
        name: 'password',
        label: 'Password',
        autoComplete: 'current-password',
        error: 'Enter your password.',
      }),
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="login-password-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Enter your password.');
  });
});

describe('AuthAlert rendered contract', () => {
  it('announces errors assertively and success politely', () => {
    const errorHtml = renderToStaticMarkup(
      createElement(AuthAlert, { tone: 'error', title: 'Unable to sign in', message: 'Try again.' }),
    );
    expect(errorHtml).toContain('role="alert"');
    expect(errorHtml).toContain('Unable to sign in');

    const successHtml = renderToStaticMarkup(
      createElement(AuthAlert, {
        tone: 'success',
        title: 'Your account has been created.',
        message: 'You are signed in.',
      }),
    );
    expect(successHtml).toContain('role="status"');
    expect(successHtml).toContain('Your account has been created.');
  });

  it('renders an accessible dismiss control only when dismissible', () => {
    const dismissible = renderToStaticMarkup(
      createElement(AuthAlert, {
        tone: 'error',
        title: 'Unable to sign in',
        dismissible: true,
        onDismiss: () => undefined,
      }),
    );
    expect(dismissible).toContain('type="button"');
    expect(dismissible).toContain('aria-label="Dismiss message"');

    const fixed = renderToStaticMarkup(
      createElement(AuthAlert, { tone: 'success', title: 'You are signed in successfully.' }),
    );
    expect(fixed).not.toContain('Dismiss message');
  });
});

// ---------------------------------------------------------------------------
// AuthForms source contract: interaction behaviour that needs next/navigation
// at runtime is verified statically so regressions fail fast in CI.
// ---------------------------------------------------------------------------

const formsPath = resolve(process.cwd(), 'apps/web/components/AuthForms.tsx');
const formsSrc = readFileSync(formsPath, 'utf8');

describe('AuthForms interaction contract', () => {
  it('submits through the cookie-session API with credentials included', () => {
    expect(formsSrc).toContain("credentials: 'include'");
    expect(formsSrc).toContain("'/auth/login'");
    expect(formsSrc).toContain("'/auth/register'");
  });

  it('verifies the session via /auth/me before redirecting (never HTTP alone)', () => {
    expect(formsSrc).toContain('await getSessionUser()');
    expect(formsSrc).toContain('Your session could not be established');
  });

  it('synchronises session state without a full-page reload', () => {
    expect(formsSrc).toContain('notifySessionUpdated()');
    expect(formsSrc).toContain('await refresh()');
    expect(formsSrc).not.toContain('window.location.reload');
    expect(formsSrc).not.toContain('location.reload');
  });

  it('guards duplicate submissions (sync ref + render-driving lock + disabled button)', () => {
    expect(formsSrc).toContain('inFlight.current');
    expect(formsSrc).toContain('setLocked(true)');
    expect(formsSrc).toContain('disabled={busy}');
    expect(formsSrc).toContain('aria-busy={busy');
    expect(formsSrc).toContain('Signing in…');
    expect(formsSrc).toContain('Creating account…');
  });

  it('routes redirects through the same-origin safeRedirectTarget helper', () => {
    expect(formsSrc).toContain('safeTarget(searchParams.get(');
    expect(formsSrc).toContain('router.replace(target');
    expect(formsSrc).toContain('router.push(target');
  });

  it('uses correct autocomplete, input types, and accessible error wiring', () => {
    expect(formsSrc).toContain('autoComplete="email"');
    expect(formsSrc).toContain('autoComplete="current-password"');
    expect(formsSrc).toContain('autoComplete="new-password"');
    expect(formsSrc).toContain('type="email"');
    expect(formsSrc).toContain('inputMode="email"');
    expect(formsSrc).toContain('aria-invalid={');
    expect(formsSrc).toContain('aria-describedby');
    expect(formsSrc).toContain('noValidate');
  });

  it('preserves entered values after failures (never resets the form)', () => {
    expect(formsSrc).not.toMatch(/\breset\(\)/);
  });

  it('never stores credentials client-side and never logs passwords', () => {
    expect(formsSrc).not.toContain('localStorage');
    expect(formsSrc).not.toContain('sessionStorage');
    expect(formsSrc).not.toMatch(/console\.log.*password/i);
  });

  it('does not invent Remember-me, password-reset, terms, or role fields', () => {
    expect(formsSrc).not.toMatch(/remember/i);
    expect(formsSrc).not.toMatch(/forgot-?password|reset-?password|one-time|otp/i);
    expect(formsSrc).not.toMatch(/name="role"|name="status"|isAdmin/);
  });
});
