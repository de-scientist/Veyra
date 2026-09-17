'use client';

import { useEffect, useState } from 'react';

import { approveReturn, getReturnQueue, inspectReturn, receiveReturn, rejectReturn, requestRefund, reviewReturn, type ReturnRequest } from '../lib/shopping-api';

const labels: Record<string, string> = { REQUESTED: 'Requested', UNDER_REVIEW: 'Under review', APPROVED: 'Approved', REJECTED: 'Rejected', RECEIVED: 'Received', INSPECTING: 'Inspecting', APPROVED_FOR_RESOLUTION: 'Ready to resolve', RESOLVED: 'Resolved' };

export function ReturnsQueueClient() {
  const [items, setItems] = useState<ReturnRequest[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  function refresh() { getReturnQueue().then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load returns.')); }
  useEffect(() => { refresh(); }, []);

  async function run(id: string, operation: () => Promise<unknown>) {
    setBusy(id);
    try { await operation(); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'That return action is unavailable.'); } finally { setBusy(null); }
  }

  return <div className="operations-page"><div className="section-heading"><div><p className="eyebrow">Operations</p><h1>Returns queue</h1></div><button className="button button--secondary" onClick={refresh}>Refresh</button></div>{error ? <p className="inline-message" role="alert">{error}</p> : null}{!items ? <div className="empty-state"><p>Loading returns...</p></div> : !items.length ? <div className="empty-state"><h2>No return requests</h2><p>Customer requests will appear here after submission.</p></div> : <div className="operations-list">{items.map((item) => <article className="operations-item" key={item.id}><div><p className="eyebrow">{item.returnNumber} · {item.orderNumber}</p><h2>{labels[item.status] ?? item.status}</h2><p>{item.type} · {item.reason}</p><p>{item.items.length} item line(s)</p></div><div className="cta-row">{item.status === 'REQUESTED' ? <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => reviewReturn(item.id))}>Review</button> : null}{item.status === 'UNDER_REVIEW' ? <><button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => approveReturn(item.id))}>Approve</button><button className="button button--secondary" disabled={busy === item.id} onClick={() => run(item.id, () => rejectReturn(item.id, 'Return does not meet the current review requirements.'))}>Reject</button></> : null}{item.status === 'APPROVED' ? <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => receiveReturn(item.id))}>Mark received</button> : null}{item.status === 'RECEIVED' ? <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => inspectReturn(item.id, item.items.map((returnItem) => ({ returnItemId: returnItem.id, condition: 'LIKE_NEW' as const, disposition: 'RESTOCK' as const }))))}>Inspect and restock</button> : null}{item.status === 'APPROVED_FOR_RESOLUTION' && item.type === 'REFUND' ? <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => requestRefund(item.id))}>Request refund</button> : null}</div></article>)}</div>}</div>;
}
