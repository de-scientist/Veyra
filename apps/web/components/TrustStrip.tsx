'use client';

import { JBIcon, type JBIconName } from './JBIcons';

type TrustItem = { icon: JBIconName; title: string; body: string };

/**
 * Reusable trust/value strip. Every claim reflects a real system capability:
 * backend-authoritative totals, M-Pesa checkout, zone-based delivery
 * configured at checkout, and the audited account returns flow. No invented
 * rates, phone numbers, or coverage promises.
 */
const ITEMS: TrustItem[] = [
  {
    icon: 'truck',
    title: 'Delivery across Kenya',
    body: 'Choose pickup, local, or courier delivery at checkout.',
  },
  {
    icon: 'lock',
    title: 'Secure M-Pesa payments',
    body: 'Only verified M-Pesa callbacks mark an order as paid.',
  },
  {
    icon: 'box',
    title: 'Quality checked',
    body: 'Catalogue, stock, and prices stay authoritative on the backend.',
  },
  {
    icon: 'refresh',
    title: 'Easy returns',
    body: 'Request returns or exchanges from your account anytime.',
  },
];

export function TrustStrip({ items = ITEMS }: { items?: TrustItem[] }) {
  return (
    <section className="trust-strip" aria-label="Why shop with JB Mercantile">
      {items.map((item) => (
        <div key={item.title} className="trust-strip__item trust-strip__item--icon">
          <span className="trust-strip__icon" aria-hidden="true">
            <JBIcon name={item.icon} size={20} />
          </span>
          <strong>{item.title}</strong>
          <span>{item.body}</span>
        </div>
      ))}
    </section>
  );
}
