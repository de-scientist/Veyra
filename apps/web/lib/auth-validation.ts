import { z } from 'zod';

/**
 * Client-side auth validation — mirrors `apps/api/src/routes/auth.ts`.
 * Source of truth stays server-side (min 8 password, email format,
 * first/last required, phone optional). Nothing here invents new rules.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 100;

export const PASSWORD_REQUIREMENTS_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters.`;

function nonBlank(label: string, max = NAME_MAX_LENGTH) {
  return z
    .string()
    .trim()
    .min(1, { message: `Enter your ${label}.` })
    .max(max, { message: `Your ${label} must be ${max} characters or fewer.` })
    .refine((v) => v.trim().length > 0, { message: `Enter your ${label}.` });
}

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Enter your email address.' })
    .refine((v) => EMAIL_PATTERN.test(v.trim()), {
      message: 'Enter a valid email address.',
    }),
  password: z
    .string()
    .min(1, { message: 'Enter your password.' })
    .refine((v) => v.length >= PASSWORD_MIN_LENGTH, {
      message: `Your password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    firstName: nonBlank('first name'),
    lastName: nonBlank('last name'),
    email: z
      .string()
      .trim()
      .min(1, { message: 'Enter your email address.' })
      .refine((v) => EMAIL_PATTERN.test(v.trim()), {
        message: 'Enter a valid email address.',
      }),
    phone: z.string().trim().optional().or(z.literal('')),
    password: z.string().min(PASSWORD_MIN_LENGTH, {
      message: `Your password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    }),
    confirm: z.string().min(1, { message: 'Confirm your password.' }),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'The passwords do not match.',
    path: ['confirm'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/** Normalize credentials exactly like the backend: trim + lowercase email only. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Same-origin path only: must start with a single `/`
 * (blocks `//evil`, `http:`, `javascript:`). Decodes safely.
 */
export function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/account';
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith('/') && !decoded.startsWith('//') && !decoded.includes(':')) {
      return decoded;
    }
  } catch {
    // Fall through to default.
  }
  return '/account';
}

export type ServerIssue = { field?: string; code?: string; message?: string };

/**
 * Map an API failure to a form-level alert + optional per-field errors.
 * Never surfaces stack traces, SQL, cookie values, or raw objects.
 * Generic credentials message is preserved to avoid account enumeration.
 */
export function mapAuthServerError(reason: unknown): {
  formError: { title: string; message: string };
  fieldErrors?: Record<string, string>;
} {
  const fallback = {
    title: 'Something went wrong',
    message: 'Please check your connection and try again.',
  };
  if (!(reason instanceof Error)) return { formError: fallback };

  const code = (reason as Error & { code?: string }).code;
  const details = (reason as Error & { details?: unknown }).details as
    | { issues?: ServerIssue[] }
    | undefined;
  const raw = reason.message ?? '';

  if (code === 'RATE_LIMITED' || /too many|rate|slow down|wait/i.test(raw)) {
    return {
      formError: {
        title: 'Too many attempts',
        message: 'Wait a moment before trying again.',
      },
    };
  }
  if (/network|fetch|failed to fetch|connection|offline/i.test(raw)) {
    return {
      formError: {
        title: 'Connection problem',
        message: 'Check your internet connection and try again.',
      },
    };
  }
  if (code === 'USER_EXISTS' || /already exists|already registered|duplicate/i.test(raw)) {
    return {
      formError: {
        title: 'Unable to create your account',
        message:
          'An account with this email may already exist. Try signing in instead.',
      },
      fieldErrors: { email: 'This email may already be registered. Try signing in.' },
    };
  }
  if (code === 'INVALID_CREDENTIALS' || /invalid email or password|invalid credentials/i.test(raw)) {
    return {
      formError: {
        title: 'Unable to sign in',
        message: 'The email or password you entered is incorrect. Try again.',
      },
    };
  }
  if (code === 'ACCOUNT_SUSPENDED' || code === 'ACCOUNT_DISABLED' || /suspended|disabled|inactive/i.test(raw)) {
    return {
      formError: {
        title: 'Account unavailable',
        message: 'This account is currently unavailable. Contact support for help.',
      },
    };
  }
  if (code === 'SESSION_FAILED' || /session/i.test(raw)) {
    return {
      formError: {
        title: 'Your session could not be established',
        message: 'Please try signing in again.',
      },
    };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of details?.issues ?? []) {
    if (issue.field && issue.message) fieldErrors[issue.field] = issue.message;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      formError: {
        title: 'Check the highlighted fields',
        message: 'Some details need attention before you can continue.',
      },
      fieldErrors,
    };
  }

  if (raw && raw.length < 200 && !/prisma|sql|stack|token|cookie/i.test(raw)) {
    return { formError: { title: 'Unable to continue', message: raw } };
  }
  return { formError: fallback };
}

/** Simple, honest password hint tied ONLY to the backend min-length rule. */
export function passwordHint(password: string): string | null {
  if (!password) return null;
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Enter at least ${PASSWORD_MIN_LENGTH - password.length} more character${PASSWORD_MIN_LENGTH - password.length === 1 ? '' : 's'} (minimum ${PASSWORD_MIN_LENGTH}).`;
  }
  return null;
}
