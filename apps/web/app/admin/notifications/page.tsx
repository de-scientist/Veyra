import type { Metadata } from 'next';

import { NotificationsQueueClient } from '../../../components/NotificationsQueueClient';

export const metadata: Metadata = { title: 'Notifications | JB', robots: { index: false, follow: false } };

export default function NotificationsAdminPage() {
  return <main className="container page-shell"><NotificationsQueueClient /></main>;
}
