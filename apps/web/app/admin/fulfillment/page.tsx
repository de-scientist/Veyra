import type { Metadata } from 'next';

import { FulfillmentQueueClient } from '../../../components/FulfillmentQueueClient';

export const metadata: Metadata = { title: 'Fulfillment | Veyra', robots: { index: false, follow: false } };

export default function FulfillmentPage() {
  return <main className="container page-shell"><FulfillmentQueueClient /></main>;
}
