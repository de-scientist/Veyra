import type { Metadata } from 'next';

import { AdminShell } from './AdminShell';

export const metadata: Metadata = {
  title: 'Admin | JB',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
