export type MetricDefinition = {
  metric: string;
  definition: string;
  formula: string;
  source: string;
  dateBasis: string;
  exclusions: string;
  limitations: string;
};

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    metric: 'Gross Sales',
    definition: 'Sum of grand totals for non-cancelled orders created in the selected period.',
    formula: 'SUM(Order.grandTotal) WHERE status != CANCELLED',
    source: 'Order records.',
    dateBasis: 'Order.createdAt in Africa/Nairobi half-open range [from, to).',
    exclusions: 'Cancelled orders. Refunds are not deducted.',
    limitations: 'Includes unpaid orders; use Paid Revenue for cash-collected sales.',
  },
  {
    metric: 'Paid Revenue',
    definition: 'Sum of grand totals for non-cancelled orders with paymentStatus PAID in the selected period.',
    formula: 'SUM(Order.grandTotal) WHERE status != CANCELLED AND paymentStatus = PAID',
    source: 'Order records.',
    dateBasis: 'Order.createdAt in Africa/Nairobi half-open range [from, to).',
    exclusions: 'Cancelled orders, unpaid/pending/failed payments.',
    limitations: 'Attributed by order creation date, not payment date.',
  },
  {
    metric: 'Net Sales',
    definition: 'Paid Revenue minus succeeded refunds created in the selected period.',
    formula: 'Paid Revenue − SUM(Refund.amount WHERE status = SUCCEEDED)',
    source: 'Order and Refund records.',
    dateBasis: 'Order.createdAt and Refund.createdAt respectively; windows may mix cohorts.',
    exclusions: 'Pending/failed refunds.',
    limitations: 'Refunds are attributed by refund date, not original order date. Not audited accounting revenue.',
  },
  {
    metric: 'Average Order Value',
    definition: 'Paid Revenue divided by paid order count.',
    formula: 'Paid Revenue / paidOrders; null when no paid orders.',
    source: 'Order records.',
    dateBasis: 'Same window as Paid Revenue.',
    exclusions: 'Unpaid and cancelled orders.',
    limitations: 'Null (not zero) is returned for empty periods.',
  },
  {
    metric: 'Payment Success Rate',
    definition: 'Concluded M-Pesa/provider attempts ending PAID over all concluded (PAID + FAILED) attempts.',
    formula: 'PAID / (PAID + FAILED) × 100; pending attempts excluded.',
    source: 'PaymentTransaction records.',
    dateBasis: 'Transaction.createdAt.',
    exclusions: 'Pending attempts, duplicate STK prompts collapsed by idempotency.',
    limitations: 'STK initiation is not success; only verified callbacks count.',
  },
  {
    metric: 'Unit Return Rate',
    definition: 'Returned units over units sold within the same window.',
    formula: 'SUM(ReturnItem.quantity) / SUM(OrderItem.quantity) × 100.',
    source: 'ReturnItem and OrderItem records.',
    dateBasis: 'Return requestedAt window vs order createdAt window.',
    exclusions: 'REJECTED and CANCELLED returns.',
    limitations: 'Windowed proxy, not cohort-tracked; a return may relate to an older order.',
  },
  {
    metric: 'Repeat Purchase Rate',
    definition: 'Purchasing customers with more than one qualifying order (all time) over purchasing customers in the window.',
    formula: 'repeatCustomers / purchasingCustomers × 100.',
    source: 'Order records.',
    dateBasis: 'Window for denominator; all-time first-order lookup for new/returning split.',
    exclusions: 'Cancelled orders, guest checkouts (no customer identity).',
    limitations: 'Guest purchases are invisible to identity-based metrics.',
  },
  {
    metric: 'Observed Lifetime Value',
    definition: 'Average historical spend per purchasing customer. Observed history only — not a prediction.',
    formula: 'SUM(window order totals) / purchasingCustomers.',
    source: 'Order records.',
    dateBasis: 'Selected window.',
    exclusions: 'Cancelled orders, guests.',
    limitations: 'Young stores will understate true lifetime value; never presented as predicted LTV.',
  },
  {
    metric: 'Fulfillment Durations',
    definition: 'Average hours between authoritative timestamps (order creation → shipment, shipment → delivery, payment → delivery).',
    formula: 'AVG(deliveredAt − paidAt) etc. over rows where both timestamps exist.',
    source: 'Order, Payment, Delivery records.',
    dateBasis: 'Delivery.createdAt window.',
    exclusions: 'Rows missing either timestamp are excluded from that stage; sample counts shown.',
    limitations: 'Small samples are volatile; averages hide outliers.',
  },
  {
    metric: 'Inventory Availability',
    definition: 'Available units per variant.',
    formula: 'quantityOnHand − quantityReserved.',
    source: 'Inventory records (live, not historical).',
    dateBasis: 'Point-in-time snapshot.',
    exclusions: 'Archived variants remain listed with status context.',
    limitations: 'No cost data exists, so no inventory valuation is reported.',
  },
  {
    metric: 'Delivery Failure Rate',
    definition: 'Failed and attempted-but-incomplete deliveries over all terminal delivery outcomes in the window.',
    formula: '(FAILED + DELIVERY_ATTEMPTED) / (FAILED + DELIVERY_ATTEMPTED + DELIVERED + PICKED_UP) × 100.',
    source: 'Delivery records.',
    dateBasis: 'Delivery.createdAt.',
    exclusions: 'In-transit deliveries not yet terminal.',
    limitations: 'DELIVERY_ATTEMPTED may still convert to delivered on retry.',
  },
];
