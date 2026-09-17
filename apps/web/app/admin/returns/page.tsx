import type { Metadata } from 'next';

import { ReturnsQueueClient } from '../../../components/ReturnsQueueClient';

export const metadata: Metadata = { title: 'Returns | Veyra', robots: { index: false, follow: false } };

export default function AdminReturnsPage() {
  return <main className="container page-shell"><ReturnsQueueClient /></main>;
}
