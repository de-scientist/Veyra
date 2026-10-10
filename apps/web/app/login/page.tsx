import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { LoginForm } from '../../components/AuthForms';
import { JBIcon } from '../../components/JBIcons';
import { JBLogo } from '../../components/JBLogo';
import { JBLoading } from '../../components/JBLoading';
import { JB_CONTACT_PHONE_DISPLAY, JB_CONTACT_PHONE_TEL } from '../../lib/business-contact';

export const metadata: Metadata = {
  title: 'Sign in | JB Mercantile',
  description: 'Sign in to your JB Mercantile account to shop faster, track orders, and manage returns.',
  robots: { index: false, follow: false },
};

const BENEFITS = [
  { icon: 'box' as const, title: 'Track your orders', text: 'Follow every order from payment to delivery.' },
  { icon: 'refresh' as const, title: 'Easy returns', text: 'Request returns and refunds in minutes.' },
  { icon: 'lock' as const, title: 'Secure checkout', text: 'Pay safely with M-Pesa at checkout.' },
];

export default function LoginPage() {
  return (
    <main className="auth-shell auth-shell--split">
      <div className="auth-split">
        <aside className="auth-brand" aria-label="About JB Mercantile">
          <Link href="/" className="auth-brand__logo" aria-label="JB Mercantile home">
            <JBLogo variant="full" alt="JB Mercantile" height={52} />
          </Link>
          <p className="eyebrow eyebrow--on-brand">Welcome back</p>
          <h1 className="auth-brand__title">Sign in to shop faster.</h1>
          <p className="auth-brand__text">
            Track orders, manage returns, and check out in seconds with your saved details.
          </p>
          <ul className="auth-brand__benefits">
            {BENEFITS.map((benefit) => (
              <li key={benefit.title}>
                <span className="auth-brand__benefit-icon" aria-hidden="true">
                  <JBIcon name={benefit.icon} size={18} />
                </span>
                <span>
                  <strong>{benefit.title}</strong>
                  <span>{benefit.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="auth-brand__support">
            Need help? Call <a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a>
          </p>
        </aside>
        <div className="auth-panel">
          <p className="eyebrow">Welcome back</p>
          <h2 className="auth-panel__title">Sign in to JB Mercantile</h2>
          <p className="muted-copy">Track orders, manage returns, and check out faster.</p>
          <Suspense fallback={<JBLoading context="account" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
