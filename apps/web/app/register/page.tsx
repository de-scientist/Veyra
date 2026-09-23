import type { Metadata } from 'next';
import Link from 'next/link';

import { JBLogo } from '../../components/JBLogo';
import { RegisterForm } from '../../components/AuthForms';

export const metadata: Metadata = {
  title: 'Create account | JB Mercantile',
  description: 'Create a JB Mercantile account to shop faster, track orders, and manage returns.',
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo" aria-label="JB Mercantile home">
          <JBLogo variant="full" alt="JB Mercantile" height={56} />
        </Link>
        <div>
          <p className="eyebrow">Join JB Mercantile</p>
          <h1>Create your account</h1>
          <p className="muted-copy">Faster checkout, order tracking, and easy returns.</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
