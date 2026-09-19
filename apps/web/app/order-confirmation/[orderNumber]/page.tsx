import type { Metadata } from 'next';

import { OrderConfirmationClient } from '../../../components/OrderConfirmationClient';

export const metadata: Metadata = { title: 'Order Confirmation | JB Mercantile', robots: { index: false, follow: false } };

export default function OrderConfirmationPage({ params, searchParams }: { params: { orderNumber: string }; searchParams: { token?: string } }) {
  return <main className="container page-shell"><OrderConfirmationClient orderNumber={params.orderNumber} confirmationToken={searchParams.token} /></main>;
}
