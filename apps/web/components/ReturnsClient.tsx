'use client';

import { useEffect, useState } from 'react';

import { createReturn, getOrder, getReturns, type Order, type ReturnRequest } from '../lib/shopping-api';
import { PriceDisplay } from './PriceDisplay';

export function ReturnsClient() {
  const [returns, setReturns] = useState<ReturnRequest[]>([]);
  const [orderNumber, setOrderNumber] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [type, setType] = useState<'REFUND' | 'EXCHANGE'>('REFUND');
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { getReturns().then(setReturns).catch(() => undefined); }, []);

  async function loadOrder() {
    setMessage('');
    try { setOrder(await getOrder(orderNumber)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Order not found.'); }
  }

  async function submit() {
    const items = Object.entries(selected).filter(([, quantity]) => quantity > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity, reason: reason || 'Customer requested return' }));
    if (!items.length || !reason) { setMessage('Select an item and provide a reason.'); return; }
    setBusy(true);
    try { const created = await createReturn({ orderNumber, type, reason, items }); setReturns((current) => [created, ...current]); setMessage(`Return ${created.returnNumber} submitted.`); setOrder(null); setSelected({}); } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to submit the return.'); } finally { setBusy(false); }
  }

  return <div className="returns-layout"><section className="returns-panel"><p className="eyebrow">Post-purchase care</p><h1>Returns and exchanges</h1><p className="muted-copy">Returns are reviewed after delivery. The final decision and refund amount are always calculated by JB Mercantile.</p><div className="return-order-search"><label>Order number<input value={orderNumber} placeholder="ORD-..." onChange={(event) => setOrderNumber((event.target as unknown as { value: string }).value)} /></label><button type="button" className="button" onClick={loadOrder}>Load order</button></div>{order ? <div className="return-form"><label>Resolution<select value={type} onChange={(event) => setType((event.target as unknown as { value: 'REFUND' | 'EXCHANGE' }).value)}><option value="REFUND">Refund</option><option value="EXCHANGE">Exchange</option></select></label><label>Reason<textarea required value={reason} onChange={(event) => setReason((event.target as unknown as { value: string }).value)} placeholder="Tell us what happened" /></label><h2>Select items</h2>{order.items.map((item) => <label className="return-item-choice" key={item.id}><span><strong>{item.productName}</strong><small>{item.variantDescription} · {item.quantity} purchased · <PriceDisplay price={item.total} /></small></span><input type="number" min="0" max={item.quantity} value={selected[item.id] ?? 0} onChange={(event) => {
                        const value = Number((event.target as unknown as { value: string }).value);
                        setSelected((current) => ({ ...current, [item.id]: value }));
                      }} /></label>)}<button type="button" className="button" disabled={busy} onClick={submit}>{busy ? 'Submitting...' : 'Submit request'}</button></div> : null}{message ? <p className="inline-message" role="status">{message}</p> : null}</section><section className="returns-panel"><p className="eyebrow">Your requests</p><h2>Return history</h2>{!returns.length ? <p className="muted-copy">No return requests yet.</p> : <div className="return-history">{returns.map((item) => <article key={item.id}><div><strong>{item.returnNumber}</strong><p>{item.orderNumber} · {item.type}</p></div><span>{item.status.replaceAll('_', ' ')}</span>{item.refund ? <PriceDisplay price={item.refund.amount} /> : null}</article>)}</div>}</section></div>;
}
