'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function authRequest(path: string, body: Record<string, string>) {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { data?: unknown; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(data?.error?.message ?? 'Something went wrong. Please try again.');
  return data?.data;
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authRequest('/auth/login', { email: email.trim(), password });
      router.push('/account');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit} noValidate={false}>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <label>
        Email address
        <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label>
        Password
        <input type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
      </label>
      <label className="confirm-price" style={{ fontWeight: 500 }}>
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show password
      </label>
      <button type="submit" className="button" disabled={busy} aria-busy={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="auth-switch">New to JB Mercantile? <Link href="/register">Create an account</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await authRequest('/auth/register', {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        password: form.password,
      });
      router.push('/account');
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      {error ? <p className="auth-error" role="alert">{error}</p> : null}
      <div className="form-grid">
        <label>
          First name
          <input name="firstName" autoComplete="given-name" required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} />
        </label>
        <label>
          Last name
          <input name="lastName" autoComplete="family-name" required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} />
        </label>
      </div>
      <label>
        Email address
        <input type="email" name="email" autoComplete="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" />
      </label>
      <label>
        Phone <span className="muted-copy">(optional, for delivery updates)</span>
        <input type="tel" name="phone" autoComplete="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="0712 345 678" />
      </label>
      <label>
        Password
        <input type={showPassword ? 'text' : 'password'} name="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Minimum 8 characters" />
      </label>
      <label>
        Confirm password
        <input type={showPassword ? 'text' : 'password'} name="confirm" autoComplete="new-password" required minLength={8} value={form.confirm} onChange={(e) => update('confirm', e.target.value)} />
      </label>
      <label className="confirm-price" style={{ fontWeight: 500 }}>
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} /> Show passwords
      </label>
      <button type="submit" className="button" disabled={busy} aria-busy={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>
    </form>
  );
}
