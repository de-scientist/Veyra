import type { Metadata } from 'next';

import { ReturnsClient } from '../../components/ReturnsClient';

export const metadata: Metadata = { title: 'Returns and Exchanges | JB', robots: { index: false, follow: false } };

export default function ReturnsPage() {
  return <main className="container page-shell"><ReturnsClient /></main>;
}
