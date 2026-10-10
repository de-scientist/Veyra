'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';

import { getSessionUser } from '../lib/admin-api';
import {
  PASSWORD_REQUIREMENTS_TEXT,
  loginSchema,
  mapAuthServerError,
  normalizeEmail,
  passwordHint,
  registerSchema,
  safeRedirectTarget as safeTarget,
  type LoginInput,
  type RegisterInput,
} from '../lib/auth-validation';
import { JB_CONTACT_PHONE_DISPLAY, JB_CONTACT_PHONE_TEL } from '../lib/business-contact';
import { notifySessionUpdated, useSession } from '../lib/session';
import { AuthAlert } from './AuthAlert';
import { JBButtonLoader, JBLoading } from './JBLoading';
import { PasswordField } from './PasswordField';

/** Re-exported for backward compatibility with existing imports/tests. */
export function safeRedirectTarget(raw: string | null): string {
  return safeTarget(raw);
}

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type ApiEnvelope = {
  data?: unknown;
  error?: { message?: string; code?: string; details?: unknown };
};

async function authRequest(path: string, body: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Connection problem. Check your internet connection and try again.');
  }
  const data = (await response.json().catch(() => null)) as ApiEnvelope | null;
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? 'Something went wrong. Please try again.');
    (error as Error & { code?: string }).code = data?.error?.code;
    (error as Error & { details?: unknown }).details = data?.error?.details;
    throw error;
  }
  return data?.data;
}

/** Minimal zod→react-hook-form resolver (avoids a new @hookform/resolvers dep). */
function zodResolver<T extends z.ZodTypeAny>(schema: T) {
  return async (values: Record<string, unknown>) => {
    const parsed = schema.safeParse(values);
    if (parsed.success) return { values: parsed.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'root';
      if (!errors[key]) errors[key] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors };
  };
}

function focusFirstInvalid<T extends Record<string, unknown>>(errors: FieldErrors<T>, scopeId: string) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  const scope = document.getElementById(scopeId);
  const target = scope?.querySelector<HTMLElement>(`[name="${first}"]`);
  target?.focus({ preventScroll: false });
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p className="auth-field-error" id={id} role="alert">
      {message}
    </p>
  );
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, refresh } = useSession();
  const formId = useId();
  const scopeId = `login-${formId}`;
  const emailErrorId = `login-email-error-${formId}`;
  const [formAlert, setFormAlert] = useState<{ tone: 'error' | 'success'; title: string; message: string } | null>(null);
  const inFlight = useRef(false);

  const target = safeTarget(searchParams.get('redirect'));

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<LoginInput>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (status === 'authenticated') router.replace(target as '/account');
  }, [status, router, target]);

  async function onValid(values: LoginInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormAlert(null);
    try {
      await authRequest('/auth/login', { email: normalizeEmail(values.email), password: values.password });
      // Verify the session was actually established — never redirect on HTTP alone.
      try {
        await getSessionUser();
      } catch {
        const mapped = { title: 'Your session could not be established', message: 'Please try signing in again.' };
        setFormAlert({ tone: 'error', ...mapped });
        return;
      }
      notifySessionUpdated();
      await refresh().catch(() => undefined);
      setFormAlert({ tone: 'success', title: 'You are signed in successfully.', message: 'Taking you to your account…' });
      window.setTimeout(() => {
        router.push(target as '/account');
        router.refresh();
      }, 650);
    } catch (reason) {
      const mapped = mapAuthServerError(reason);
      if (mapped.fieldErrors) {
        for (const [field, message] of Object.entries(mapped.fieldErrors)) {
          setError(field as keyof LoginInput, { type: 'server', message });
        }
      }
      setFormAlert({ tone: 'error', title: mapped.formError.title, message: mapped.formError.message });
    } finally {
      inFlight.current = false;
    }
  }

  function onInvalid(formErrors: FieldErrors<LoginInput>) {
    setFormAlert({
      tone: 'error',
      title: 'Check the highlighted fields',
      message: 'Enter your details below to continue.',
    });
    focusFirstInvalid(formErrors, scopeId);
  }

  if (status === 'authenticated') return <JBLoading context="account" />;
  if (status === 'loading') return <JBLoading context="account" />;

  const busy = isSubmitting || inFlight.current;
  const emailReg = register('email');
  const passwordReg = register('password');

  return (
    <form
      id={scopeId}
      className="auth-form"
      onSubmit={handleSubmit(onValid, onInvalid)}
      noValidate
      aria-busy={busy || undefined}
    >
      {formAlert ? (
        <AuthAlert
          tone={formAlert.tone}
          title={formAlert.title}
          message={formAlert.message}
          dismissible={formAlert.tone === 'error'}
          onDismiss={() => setFormAlert(null)}
        />
      ) : null}

      <div className="auth-field">
        <label htmlFor={`${scopeId}-email`}>Email address</label>
        <input
          id={`${scopeId}-email`}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="you@example.com"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? emailErrorId : undefined}
          {...emailReg}
          onChange={(e) => {
            emailReg.onChange(e);
            if (touchedFields.email || errors.email) clearErrors('email');
          }}
        />
        <FieldError id={emailErrorId} message={errors.email?.message} />
      </div>

      <PasswordField
        id={`${scopeId}-password`}
        name="password"
        label="Password"
        autoComplete="current-password"
        error={errors.password?.message}
        inputProps={{
          ...passwordReg,
          onChange: (e) => {
            passwordReg.onChange(e);
            if (touchedFields.password || errors.password) clearErrors('password');
          },
        }}
      />

      <div className="auth-form__meta">
        <p className="muted-copy auth-form__reset-note">
          Password reset is not available yet. Need help signing in? Call{' '}
          <a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a>.
        </p>
      </div>

      <button type="submit" className="button auth-submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? <JBButtonLoader label="Signing in…" /> : 'Sign in'}
      </button>
      <p className="auth-switch">
        New to JB Mercantile? <Link href="/register">Create an account</Link>
      </p>
    </form>
  );
}



export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, refresh } = useSession();
  const formId = useId();
  const scopeId = `register-${formId}`;
  const [formAlert, setFormAlert] = useState<{ tone: 'error' | 'success'; title: string; message: string } | null>(null);
  const inFlight = useRef(false);

  const target = safeTarget(searchParams.get('redirect'));

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting, touchedFields },
  } = useForm<RegisterInput>({
    mode: 'onTouched',
    reValidateMode: 'onChange',
    resolver: zodResolver(registerSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' },
  });

  const passwordValue = watch('password') ?? '';

  useEffect(() => {
    if (status === 'authenticated') router.replace(target as '/account');
  }, [status, router, target]);

  async function onValid(values: RegisterInput) {
    if (inFlight.current) return;
    inFlight.current = true;
    setFormAlert(null);
    try {
      await authRequest('/auth/register', {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: normalizeEmail(values.email),
        ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}),
        password: values.password,
      });
      try {
        await getSessionUser();
      } catch {
        setFormAlert({
          tone: 'error',
          title: 'Your session could not be established',
          message: 'Your account may have been created. Try signing in.',
        });
        return;
      }
      notifySessionUpdated();
      await refresh().catch(() => undefined);
      setFormAlert({
        tone: 'success',
        title: 'Your account has been created.',
        message: 'You are signed in. Taking you to your account…',
      });
      window.setTimeout(() => {
        router.push(target as '/account');
        router.refresh();
      }, 850);
    } catch (reason) {
      const mapped = mapAuthServerError(reason);
      if (mapped.fieldErrors) {
        for (const [field, message] of Object.entries(mapped.fieldErrors)) {
          setError(field as keyof RegisterInput, { type: 'server', message });
        }
      }
      setFormAlert({ tone: 'error', title: mapped.formError.title, message: mapped.formError.message });
    } finally {
      inFlight.current = false;
    }
  }

  function onInvalid(formErrors: FieldErrors<RegisterInput>) {
    setFormAlert({
      tone: 'error',
      title: 'Check the highlighted fields',
      message: 'Some details need attention before we can create your account.',
    });
    focusFirstInvalid(formErrors, scopeId);
  }

  if (status === 'authenticated') return <JBLoading context="account" />;
  if (status === 'loading') return <JBLoading context="account" />;

  const busy = isSubmitting || inFlight.current;
  const hint = passwordHint(passwordValue);

  return (
    <form
      id={scopeId}
      className="auth-form"
      onSubmit={handleSubmit(onValid, onInvalid)}
      noValidate
      aria-busy={busy || undefined}
    >
      {formAlert ? (
        <AuthAlert
          tone={formAlert.tone}
          title={formAlert.title}
          message={formAlert.message}
          dismissible={formAlert.tone === 'error'}
          onDismiss={() => setFormAlert(null)}
        />
      ) : null}

      <div className="form-grid">
        <TextField
          scopeId={scopeId}
          name="firstName"
          label="First name"
          autoComplete="given-name"
          placeholder="Amina"
          registration={register('firstName')}
          error={errors.firstName?.message}
          described={`Enter your first name.`}
          onFix={() => clearErrors('firstName')}
          showFix={Boolean(touchedFields.firstName || errors.firstName)}
        />
        <TextField
          scopeId={scopeId}
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          placeholder="Otieno"
          registration={register('lastName')}
          error={errors.lastName?.message}
          described={`Enter your last name.`}
          onFix={() => clearErrors('lastName')}
          showFix={Boolean(touchedFields.lastName || errors.lastName)}
        />
      </div>

      <TextField
        scopeId={scopeId}
        name="email"
        label="Email address"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        registration={register('email')}
        error={errors.email?.message}
        onFix={() => clearErrors('email')}
        showFix={Boolean(touchedFields.email || errors.email)}
        switchTo="/login"
        switchLabel="Already have an account? Sign in"
      />

      <TextField
        scopeId={scopeId}
        name="phone"
        label="Phone (optional, for delivery updates)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="0712 345 678"
        registration={register('phone')}
        error={errors.phone?.message}
        hint="Kenyan mobile format, e.g. 0712 345 678."
        onFix={() => clearErrors('phone')}
        showFix={Boolean(touchedFields.phone || errors.phone)}
      />

      <RegisterPasswordPair
        scopeId={scopeId}
        passwordReg={register('password')}
        confirmReg={register('confirm')}
        passwordError={errors.password?.message}
        confirmError={errors.confirm?.message}
        hint={hint}
        requirements={PASSWORD_REQUIREMENTS_TEXT}
        clearPassword={() => clearErrors('password')}
        clearConfirm={() => clearErrors('confirm')}
      />

      <button type="submit" className="button auth-submit" disabled={busy} aria-busy={busy || undefined}>
        {busy ? <JBButtonLoader label="Creating account…" /> : 'Create account'}
      </button>
      <p className="auth-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}

function TextField({
  scopeId,
  name,
  label,
  registration,
  error,
  hint,
  described,
  type = 'text',
  inputMode,
  autoComplete,
  placeholder,
  onFix,
  showFix,
  switchTo,
  switchLabel,
}: {
  scopeId: string;
  name: string;
  label: string;
  registration: {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
    name: string;
    ref: React.Ref<HTMLInputElement>;
  };
  error?: string;
  hint?: string;
  described?: string;
  type?: string;
  inputMode?: 'email' | 'tel' | 'text';
  autoComplete?: string;
  placeholder?: string;
  onFix: () => void;
  showFix: boolean;
  switchTo?: string;
  switchLabel?: string;
}) {
  const fieldId = `${scopeId}-${name}`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;
  const describedBy = [error ? errorId : null, hint || described ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className="auth-field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        autoCorrect={type === 'email' ? 'off' : undefined}
        spellCheck={false}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...registration}
        onChange={(e) => {
          registration.onChange(e);
          if (showFix || error) onFix();
        }}
      />
      {hint && !error ? (
        <p className="auth-hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {described && !error && !hint ? (
        <span className="visually-hidden" id={hintId}>
          {described}
        </span>
      ) : null}
      <FieldError id={errorId} message={error} />
      {switchTo && error && switchLabel ? (
        <p className="auth-field-switch">
          <Link href={switchTo as '/login'}>{switchLabel}</Link>
        </p>
      ) : null}
    </div>
  );
}

function RegisterPasswordPair({
  scopeId,
  passwordReg,
  confirmReg,
  passwordError,
  confirmError,
  hint,
  requirements,
  clearPassword,
  clearConfirm,
}: {
  scopeId: string;
  passwordReg: { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur: (e: React.FocusEvent<HTMLInputElement>) => void; name: string; ref: React.Ref<HTMLInputElement> };
  confirmReg: { onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onBlur: (e: React.FocusEvent<HTMLInputElement>) => void; name: string; ref: React.Ref<HTMLInputElement> };
  passwordError?: string;
  confirmError?: string;
  hint: string | null;
  requirements: string;
  clearPassword: () => void;
  clearConfirm: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const pwId = `${scopeId}-password`;
  const confirmId = `${scopeId}-confirm`;
  const pwErrorId = `${pwId}-error`;
  const confirmErrorId = `${confirmId}-error`;
  const reqId = `${pwId}-requirements`;
  return (
    <>
      <div className="auth-field">
        <label htmlFor={pwId}>Password</label>
        <div className="auth-password-wrap">
          <input
            id={pwId}
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Minimum 8 characters"
            aria-invalid={passwordError ? true : undefined}
            aria-describedby={`${reqId}${passwordError ? ` ${pwErrorId}` : ''}`}
            {...passwordReg}
            onChange={(e) => {
              passwordReg.onChange(e);
              clearPassword();
            }}
          />
          <button
            type="button"
            className="auth-password-toggle"
            aria-label={showPw ? 'Hide password' : 'Show password'}
            aria-pressed={showPw}
            onClick={() => setShowPw((v) => !v)}
          >
            <ShowHideIcon visible={showPw} />
          </button>
        </div>
        <p className="auth-hint" id={reqId}>
          {requirements}
          {hint ? ` ${hint}` : ''}
        </p>
        <FieldError id={pwErrorId} message={passwordError} />
      </div>
      <div className="auth-field">
        <label htmlFor={confirmId}>Confirm password</label>
        <div className="auth-password-wrap">
          <input
            id={confirmId}
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repeat your password"
            aria-invalid={confirmError ? true : undefined}
            aria-describedby={confirmError ? confirmErrorId : undefined}
            {...confirmReg}
            onChange={(e) => {
              confirmReg.onChange(e);
              clearConfirm();
            }}
          />
          <button
            type="button"
            className="auth-password-toggle"
            aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'}
            aria-pressed={showConfirm}
            onClick={() => setShowConfirm((v) => !v)}
          >
            <ShowHideIcon visible={showConfirm} />
          </button>
        </div>
        <FieldError id={confirmErrorId} message={confirmError} />
      </div>
    </>
  );
}
