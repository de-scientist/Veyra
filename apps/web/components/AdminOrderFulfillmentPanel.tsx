'use client';

import { useEffect, useState } from 'react';

import {
  assignDelivery,
  getFulfillmentEligibility,
  getOperationsUsers,
  updateDeliveryDetails,
  updateDeliveryStatus,
  updateFulfillment,
  type Delivery,
  type FulfillmentEligibility,
} from '../lib/shopping-api';
import { useConfirm } from './ConfirmDialog';

type PanelDelivery = Pick<
  Delivery,
  'id' | 'orderNumber' | 'status' | 'trackingNumber' | 'provider' | 'estimatedDeliveryAt' | 'shippedAt' | 'pickedUpAt' | 'deliveredAt'
> & { method: { name: string; type: string } | null };

interface PanelProps {
  orderNumber: string;
  delivery: PanelDelivery;
  paymentStatus: string;
  onChanged: () => void;
}

const labels: Record<string, string> = {
  PENDING: 'Awaiting processing',
  PREPARING: 'Preparing',
  PICKED: 'Picked',
  PACKED: 'Packed',
  READY_FOR_PICKUP: 'Ready for pickup',
  ASSIGNED: 'Assigned',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERY_ATTEMPTED: 'Delivery attempted',
  DELIVERED: 'Delivered',
  PICKED_UP: 'Picked up',
  FAILED: 'Failed',
};

/**
 * Fulfillment operations for the admin order detail page. Mirrors the queue
 * state machine (backend remains authoritative): every mutation is
 * busy-guarded, consequential transitions confirm via the accessible dialog,
 * and the parent order re-fetches on success — never window.location.reload().
 */
export function AdminOrderFulfillmentPanel({ orderNumber, delivery, paymentStatus, onChanged }: PanelProps) {
  const [eligibility, setEligibility] = useState<FulfillmentEligibility | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [courier, setCourier] = useState(delivery.provider ?? '');
  const [eta, setEta] = useState(delivery.estimatedDeliveryAt ? delivery.estimatedDeliveryAt.slice(0, 16) : '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const methodType = delivery.method?.type ?? null;
  const paid = paymentStatus === 'PAID';

  useEffect(() => {
    let mounted = true;
    getFulfillmentEligibility(orderNumber)
      .then((result) => {
        if (mounted) setEligibility(result);
      })
      .catch(() => {
        if (mounted) setEligibility(null);
      });
    getOperationsUsers()
      .then((result) => {
        if (mounted) setUsers(result);
      })
      .catch(() => {
        if (mounted) setUsers([]);
      });
    return () => {
      mounted = false;
    };
  }, [orderNumber, delivery.id, delivery.status]);

  async function run(key: string, task: () => Promise<unknown>) {
    setBusy(key);
    setError('');
    try {
      await task();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That action is unavailable.');
    } finally {
      setBusy(null);
    }
  }

  function guarded(key: string, title: string, description: string, task: () => Promise<unknown>) {
    void confirm({ title, description, confirmLabel: title, variant: 'default', onConfirm: () => run(key, task) });
  }

  function saveDetails() {
    const input: { courierProvider?: string; estimatedDeliveryAt?: string | null } = {};
    const trimmed = courier.trim();
    if (trimmed && trimmed !== (delivery.provider ?? '')) input.courierProvider = trimmed;
    if (eta) {
      const iso = new Date(eta).toISOString();
      if (iso !== delivery.estimatedDeliveryAt) input.estimatedDeliveryAt = iso;
    } else if (delivery.estimatedDeliveryAt) {
      input.estimatedDeliveryAt = null;
    }
    if (!input.courierProvider && input.estimatedDeliveryAt === undefined) {
      setError('Change the courier name or estimated delivery before saving.');
      return;
    }
    void run('details', () => updateDeliveryDetails(delivery.id, input));
  }

  const actions: Array<{ key: string; label: string; confirm?: { title: string; description: string }; task: () => Promise<unknown> }> = [];
  if (delivery.status === 'PENDING') actions.push({ key: 'start', label: 'Start processing', task: () => updateFulfillment(orderNumber, 'start') });
  if (delivery.status === 'PREPARING') actions.push({ key: 'pick', label: 'Mark picked', task: () => updateFulfillment(orderNumber, 'pick') });
  if (delivery.status === 'PICKED') actions.push({ key: 'pack', label: 'Mark packed', task: () => updateFulfillment(orderNumber, 'pack') });
  if (delivery.status === 'PACKED' && methodType === 'PICKUP') {
    actions.push({
      key: 'ready',
      label: 'Ready for pickup',
      confirm: { title: 'Ready for pickup', description: `Mark ${orderNumber} as ready for pickup? The customer will be notified.` },
      task: () => updateDeliveryStatus(delivery.id, 'READY_FOR_PICKUP'),
    });
  }
  if (delivery.status === 'PACKED' && methodType === 'COURIER') {
    actions.push({
      key: 'ship',
      label: 'Ship',
      confirm: { title: 'Ship order', description: `Mark ${orderNumber} as shipped? A tracking number will be generated.` },
      task: () => updateDeliveryStatus(delivery.id, 'IN_TRANSIT'),
    });
  }
  if (delivery.status === 'ASSIGNED') {
    actions.push({
      key: 'ship',
      label: 'Ship',
      confirm: { title: 'Ship order', description: `Mark ${orderNumber} as shipped? A tracking number will be generated.` },
      task: () => updateDeliveryStatus(delivery.id, 'IN_TRANSIT'),
    });
  }
  if (delivery.status === 'IN_TRANSIT') {
    actions.push({
      key: 'out',
      label: 'Out for delivery',
      confirm: { title: 'Out for delivery', description: `Mark ${orderNumber} as out for delivery?` },
      task: () => updateDeliveryStatus(delivery.id, 'OUT_FOR_DELIVERY'),
    });
  }
  if (delivery.status === 'OUT_FOR_DELIVERY' || delivery.status === 'DELIVERY_ATTEMPTED') {
    actions.push({
      key: 'delivered',
      label: 'Mark delivered',
      confirm: { title: 'Mark delivered', description: `Confirm ${orderNumber} was delivered? This completes the order.` },
      task: () => updateDeliveryStatus(delivery.id, 'DELIVERED'),
    });
  }
  if (delivery.status === 'READY_FOR_PICKUP') {
    actions.push({
      key: 'picked-up',
      label: 'Complete pickup',
      confirm: { title: 'Complete pickup', description: `Confirm ${orderNumber} was picked up by the customer?` },
      task: () => updateDeliveryStatus(delivery.id, 'PICKED_UP'),
    });
  }

  return (
    <section className="account-section" aria-label="Fulfillment actions">
      {confirmDialog}
      <h2>Fulfillment</h2>
      <p className="muted-copy">
        {delivery.method?.name ?? 'Delivery'} · {labels[delivery.status] ?? delivery.status}
        {delivery.trackingNumber ? ` · Tracking ${delivery.trackingNumber}` : ''}
      </p>
      {!paid ? (
        <p className="inline-message" role="alert">
          Payment is {paymentStatus}. Fulfillment requires a confirmed (PAID) payment.
        </p>
      ) : null}
      {eligibility && !eligibility.eligible ? (
        <div className="inline-message" role="alert">
          <p>Not eligible for fulfillment:</p>
          <ul>
            {eligibility.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? (
        <p className="inline-message" role="alert">
          {error}
        </p>
      ) : null}
      {actions.length ? (
        <div className="cta-row">
          {actions.map((entry) =>
            entry.confirm ? (
              <button
                key={entry.key}
                type="button"
                className="button"
                disabled={busy !== null || !paid}
                onClick={() => guarded(entry.key, entry.confirm!.title, entry.confirm!.description, entry.task)}
              >
                {busy === entry.key ? 'Working…' : entry.label}
              </button>
            ) : (
              <button
                key={entry.key}
                type="button"
                className="button"
                disabled={busy !== null || !paid}
                onClick={() => run(entry.key, entry.task)}
              >
                {busy === entry.key ? 'Working…' : entry.label}
              </button>
            ),
          )}
        </div>
      ) : (
        <p className="muted-copy">No further fulfillment actions are available for this delivery state.</p>
      )}
      {delivery.status === 'PACKED' && methodType === 'LOCAL_DELIVERY' ? (
        <div className="cta-row">
          <label className="muted-copy" htmlFor={`assign-${delivery.id}`}>
            Assign staff
          </label>
          <select
            id={`assign-${delivery.id}`}
            aria-label={`Assign ${orderNumber}`}
            value={assigneeId}
            disabled={busy !== null || !paid}
            onChange={(event) => setAssigneeId(event.target.value)}
          >
            <option value="">Assign staff</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="button"
            disabled={busy !== null || !assigneeId || !paid}
            onClick={() => run('assign', () => assignDelivery(delivery.id, assigneeId))}
          >
            {busy === 'assign' ? 'Working…' : 'Assign'}
          </button>
        </div>
      ) : null}
      <div className="cta-row">
        <label className="muted-copy" htmlFor={`courier-${delivery.id}`}>
          Courier
        </label>
        <input
          id={`courier-${delivery.id}`}
          type="text"
          value={courier}
          maxLength={120}
          placeholder="Courier name"
          disabled={busy !== null}
          onChange={(event) => setCourier(event.target.value)}
        />
        <label className="muted-copy" htmlFor={`eta-${delivery.id}`}>
          Estimated delivery
        </label>
        <input
          id={`eta-${delivery.id}`}
          type="datetime-local"
          value={eta}
          disabled={busy !== null}
          onChange={(event) => setEta(event.target.value)}
        />
        <button type="button" className="button button--secondary" disabled={busy !== null} onClick={saveDetails}>
          {busy === 'details' ? 'Saving…' : 'Save delivery details'}
        </button>
      </div>
    </section>
  );
}
