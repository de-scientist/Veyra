import './globals.css';
import type { Metadata } from 'next';

import { Footer } from '../components/Footer';
import { Header } from '../components/Header';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com';

export const metadata: Metadata = {
  title: {
    default: 'JB — Kenya-first Clothing Store',
    template: '%s | JB',
  },
  description: 'JB — modern, premium everyday clothing. Shop essentials with secure checkout and M-Pesa payments.',
  metadataBase: new URL(siteUrl),
  openGraph: {
    title: 'JB — Kenya-first Clothing Store',
    description: 'Modern, premium everyday clothing with secure checkout and M-Pesa payments.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'JB — Kenya-first Clothing Store',
    description: 'Modern, premium everyday clothing with secure checkout and M-Pesa payments.',
  },
  icons: {
    icon: '/jb-logo.png',
    apple: '/jb-logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          style={{
            position: 'absolute',
            left: '-9999px',
            top: 'auto',
            width: '1px',
            height: '1px',
            overflow: 'hidden',
          }}
        >
          Skip to main content
        </a>
        <Header />
        <div id="main-content">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
