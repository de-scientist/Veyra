import './globals.css';
import type { Metadata } from 'next';

import { Footer } from '../components/Footer';
import { Header } from '../components/Header';

export const metadata: Metadata = {
  title: 'Veyra Commerce',
  description: 'Kenya-first clothing commerce foundation',
  metadataBase: new URL('https://veyra.example.com'),
  openGraph: {
    title: 'Veyra Commerce',
    description: 'Kenya-first essentials for everyday life.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
