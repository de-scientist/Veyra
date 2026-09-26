'use client';

import { useEffect, useState } from 'react';

import { assignDelivery, getFulfillmentQueue, getOperationsUsers, updateDeliveryStatus, updateFulfillment, type Delivery } from '../lib/shopping-api';

const labels: Record<string, string> = { PENDING: 'Awaiting processing', PREPARING: 'Preparing', PICKED: 'Picked', PACKED: 'Packed', READY_FOR_PICKUP: 'Ready for pickup', ASSIGNED: 'Assigned', IN_TRANSIT: 'In transit', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERY_ATTEMPTED: 'Delivery attempted', DELIVERED: 'Delivered', PICKED_UP: 'Picked up', FAILED: 'Failed' };

export function FulfillmentQueueClient() {
  const [items, setItems] = useState<Delivery[] | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; firstName: string; lastName: string; email: string }>>([]);
  const [assignees, setAssignees] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  function refresh() { Promise.all([getFulfillmentQueue(), getOperationsUsers()]).then(([queue, operationsUsers]) => { setItems(queue); setUsers(operationsUsers); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load fulfillment queue.')); }
  useEffect(() => { refresh(); }, []);

  async function action(orderNumber: string, name: 'start' | 'pick' | 'pack') {
    setBusy(orderNumber);
    try { await updateFulfillment(orderNumber, name); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'That action is unavailable.'); } finally { setBusy(null); }
  }

  async function deliveryAction(delivery: Delivery, status: string) {
    setBusy(delivery.id);
    try { await updateDeliveryStatus(delivery.id, status); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'That delivery action is unavailable.'); } finally { setBusy(null); }
  }

  async function assign(delivery: Delivery) {
    const assigneeId = assignees[delivery.id];
    if (!assigneeId) return;
    setBusy(delivery.id);
    try { await assignDelivery(delivery.id, assigneeId); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to assign delivery.'); } finally { setBusy(null); }
  }

  if (!items) return <div className="empty-state"><p>Loading fulfillment queue...</p></div>;
  return <div className="operations-page"><div className="section-heading"><div><p className="eyebrow">Operations</p><h1>Fulfillment queue</h1></div><button type="button" className="button button--secondary" onClick={refresh}>Refresh</button></div>{error ? <p className="inline-message" role="alert">{error}</p> : null}{!items.length ? <div className="empty-state"><h2>No paid orders need fulfillment</h2><p>The queue will populate after a verified payment.</p></div> : <div className="operations-list">{items.map((delivery) => <article className="operations-item" key={delivery.id}><div><p className="eyebrow">{delivery.orderNumber}</p><h2>{labels[delivery.status] ?? delivery.status}</h2><p>{delivery.method?.name ?? 'Delivery'}{delivery.zone ? ` · ${delivery.zone.name}` : ''}</p>{delivery.trackingNumber ? <p>Tracking: {delivery.trackingNumber}</p> : null}</div><div className="cta-row">{delivery.status === 'PENDING' ? <button className="button" disabled={busy === delivery.orderNumber} onClick={() => action(delivery.orderNumber, 'start')}>Start</button> : null}{delivery.status === 'PREPARING' ? <button className="button" disabled={busy === delivery.orderNumber} onClick={() => action(delivery.orderNumber, 'pick')}>Mark picked</button> : null}{delivery.status === 'PICKED' ? <button className="button" disabled={busy === delivery.orderNumber} onClick={() => action(delivery.orderNumber, 'pack')}>Mark packed</button> : null}{delivery.status === 'PACKED' && delivery.method?.type === 'PICKUP' ? <button className="button" disabled={busy === delivery.id} onClick={() => deliveryAction(delivery, 'READY_FOR_PICKUP')}>Ready for pickup</button> : null}{delivery.status === 'PACKED' && delivery.method?.type === 'LOCAL_DELIVERY' ? <><select aria-label={`Assign ${delivery.orderNumber}`} value={assignees[delivery.id] ?? ''} onChange={(event) => {
                          const value = (event.target as unknown as { value: string }).value;
                          setAssignees((current) => ({ ...current, [delivery.id]: value }));
                        }}><option value="">Assign staff</option>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</select><button className="button" disabled={busy === delivery.id || !assignees[delivery.id]} onClick={() => assign(delivery)}>Assign</button></> : null}{delivery.status === 'PACKED' && delivery.method?.type === 'COURIER' ? <button className="button" disabled={busy === delivery.id} onClick={() => deliveryAction(delivery, 'IN_TRANSIT')}>Ship</button> : null}{delivery.status === 'READY_FOR_PICKUP' ? <button className="button" disabled={busy === delivery.id} onClick={() => deliveryAction(delivery, 'PICKED_UP')}>Complete pickup</button> : null}{delivery.status === 'ASSIGNED' ? <button className="button" disabled={busy === delivery.id} onClick={() => deliveryAction(delivery, 'IN_TRANSIT')}>Ship</button> : null}{delivery.status === 'IN_TRANSIT' ? <button className="button" disabled={busy === delivery.id} onClick={() => deliveryAction(delivery, 'OUT_FOR_DELIVERY')}>Out for delivery</button> : null}{delivery.status === 'OUT_FOR_DELIVERY' ? <button className="button" disabled={busy === delivery.id} onClick={() => deliveryAction(delivery, 'DELIVERED')}>Mark delivered</button> : null}</div></article>)}</div>}</div>;
}
