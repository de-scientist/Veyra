import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { LoginForm } from '../components/AuthForms';

export const metadata: Metadata = {
  title: 'Sign in | JB',
  description: 'Sign in to your JB account to shop faster, track orders, and manage returns.',
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo" aria-label="JB home">
          <Image src="/jb-logo.png" alt="" width={40} height={40} />
          <span>JB</span>
        </Link>
        <div>
          <p className="eyebrow">Welcome back</p>
          <h1>Sign in to JB</h1>
          <p className="muted-copy">Track orders, manage returns, and check out faster.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
