import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { RegisterForm } from '../../components/AuthForms';

export const metadata: Metadata = {
  title: 'Create account | JB',
  description: 'Create a JB account to shop faster, track orders, and manage returns.',
  robots: { index: false, follow: false },
};

export default function RegisterPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="auth-card__logo" aria-label="JB home">
          <Image src="/jb-logo.png" alt="" width={40} height={40} />
          <span>JB</span>
        </Link>
        <div>
          <p className="eyebrow">Join JB</p>
          <h1>Create your account</h1>
          <p className="muted-copy">Faster checkout, order tracking, and easy returns.</p>
        </div>
        <RegisterForm />
      </div>
    </main>
  );
}
