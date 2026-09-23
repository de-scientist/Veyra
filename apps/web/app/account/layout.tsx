import type { Metadata } from 'next';
import { AccountNav } from '../../components/AccountNav';

export const metadata: Metadata = {
  title: 'Account | JB Mercantile',
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-layout">
      <AccountNav />
      <main className="account-main" role="main">
        <div className="container page-shell">
          {children}
        </div>
      </main>
    </div>
  );
}