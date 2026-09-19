import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { JBLogo } from '../../components/JBLogo';
import { LoginForm } from '../../components/AuthForms';

export const metadata: Metadata = {
  title: 'Sign in | JB Mercantile',
  description: 'Sign in to your JB Mercantile account to shop faster, track orders, and manage returns.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo" aria-label="JB Mercantile home">
          <JBLogo variant="full" alt="JB Mercantile" height={56} />
        </Link>
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1>Sign in to JB Mercantile</h1>
          <p className="muted-copy">Track orders, manage returns, and check out faster.</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
