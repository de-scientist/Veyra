import './globals.css';
import type { Metadata } from 'next';

import { Footer } from '../components/Footer';
import { Header } from '../components/Header';
import { ThemeProvider, ThemeScript } from '../components/ThemeProvider';
import { ToastProvider } from '../components/Toast';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://jb.example.com';
const brandName = 'JB Mercantile';
const brandDescriptor = 'Fashion • Footwear • Kitchen & Home';
const brandDescription = `JB Mercantile — ${brandDescriptor}. Shop fashion, footwear and kitchen & home essentials with secure checkout and M-Pesa payments.`;

export const metadata: Metadata = {
  title: {
    default: `${brandName} — ${brandDescriptor}`,
    template: `%s | ${brandName}`,
  },
  description: brandDescription,
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    title: `${brandName} — ${brandDescriptor}`,
    description: brandDescription,
    type: 'website',
    siteName: brandName,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${brandName} — ${brandDescriptor}`,
    description: brandDescription,
  },
  icons: {
    icon: '/jb-logo.png',
    apple: '/jb-logo.png',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: brandName,
  slogan: brandDescriptor,
  url: siteUrl,
  logo: `${siteUrl}/jb-logo.png`,
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: brandName,
  url: siteUrl,
  potentialAction: {
    '@type': 'SearchAction',
    target: `${siteUrl}/search?q={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />
        <a href="#main-content" className="visually-hidden">
          Skip to main content
        </a>
        <ThemeProvider>
          <ToastProvider>
            <Header />
            <div id="main-content" tabIndex={-1}>{children}</div>
            <Footer />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
