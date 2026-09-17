import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Account | Veyra', robots: { index: false, follow: false } };

export default function AccountPage() {
  return (
    <main className="container page-shell">
      <div className="empty-state">
        <p className="eyebrow">Account</p>
        <h1>Account access is coming together</h1>
        <p>Sign-in and account management are provided by the existing authentication API. Customer order history remains outside Phase 5.</p>
      </div>
    </main>
  );
}
