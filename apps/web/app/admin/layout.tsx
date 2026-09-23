import type { Metadata } from 'next';

import { AdminShell } from './AdminShell';

export const metadata: Metadata = {
  title: 'Admin | JB Mercantile',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
