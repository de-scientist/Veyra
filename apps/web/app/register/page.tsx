import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { RegisterForm } from '../../components/AuthForms';
import { JBIcon } from '../../components/JBIcons';
import { JBLogo } from '../../components/JBLogo';
import { JBLoading } from '../../components/JBLoading';
import { JB_CONTACT_PHONE_DISPLAY, JB_CONTACT_PHONE_TEL } from '../../lib/business-contact';

export const metadata: Metadata = {
  title: 'Create account | JB Mercantile',
  description: 'Create a JB Mercantile account to shop faster, track orders, and manage returns.',
  robots: { index: false, follow: false },
};

const BENEFITS = [
  { icon: 'cart' as const, title: 'Faster checkout', text: 'Saved details and M-Pesa payments.' },
  { icon: 'box' as const, title: 'Order tracking', text: 'Follow every delivery from our shop to your door.' },
  { icon: 'refresh' as const, title: 'Easy returns', text: 'Returns and refunds without the hassle.' },
];

export default function RegisterPage() {
  return (
    <main className="auth-shell auth-shell--split">
      <div className="auth-split">
        <aside className="auth-brand" aria-label="About JB Mercantile">
          <Link href="/" className="auth-brand__logo" aria-label="JB Mercantile home">
            <JBLogo variant="full" alt="JB Mercantile" height={52} />
          </Link>
          <p className="eyebrow eyebrow--on-brand">Join JB Mercantile</p>
          <h1 className="auth-brand__title">One account for all of JB.</h1>
          <p className="auth-brand__text">
            Fashion, footwear, kitchen &amp; home — with faster checkout and order tracking across Kenya.
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
            Questions? Call <a href={JB_CONTACT_PHONE_TEL}>{JB_CONTACT_PHONE_DISPLAY}</a>
          </p>
        </aside>
        <div className="auth-panel">
          <p className="eyebrow">Join JB Mercantile</p>
          <h2 className="auth-panel__title">Create your account</h2>
          <p className="muted-copy">Faster checkout, order tracking, and easy returns.</p>
          <Suspense fallback={<JBLoading context="account" />}>
            <RegisterForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
