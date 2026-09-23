'use client';

import { useEffect, useState } from 'react';

import { approveReturn, getReturnQueue, inspectReturn, receiveReturn, rejectReturn, requestRefund, reviewReturn, type ReturnRequest } from '../lib/shopping-api';
import { useConfirm } from './ConfirmDialog';

const labels: Record<string, string> = { REQUESTED: 'Requested', UNDER_REVIEW: 'Under review', APPROVED: 'Approved', REJECTED: 'Rejected', RECEIVED: 'Received', INSPECTING: 'Inspecting', APPROVED_FOR_RESOLUTION: 'Ready to resolve', RESOLVED: 'Resolved' };

const CONDITIONS = ['NEW', 'LIKE_NEW', 'USED', 'DAMAGED', 'DEFECTIVE', 'UNSELLABLE', 'UNKNOWN'] as const;
const DISPOSITIONS = ['RESTOCK', 'QUARANTINE', 'DAMAGED', 'UNSELLABLE'] as const;

/**
 * Returns operations queue (Phase H): every state-machine step is an
 * explicit operator decision. Rejections require a written reason and a
 * destructive confirmation; inspections record per-line condition and
 * disposition chosen by the operator (never hard-coded); refund requests
 * require financial confirmation. Backend transition rules stay
 * authoritative — illegal steps fail with the server message.
 */
export function ReturnsQueueClient() {
  const [items, setItems] = useState<ReturnRequest[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [inspections, setInspections] = useState<Record<string, Record<string, { condition: string; disposition: string }>>>({});
  const { confirm, dialog: confirmDialog } = useConfirm();

  function refresh() { getReturnQueue().then(setItems).catch((reason) => setError(reason instanceof Error ? reason.message : 'Unable to load returns.')); }
  useEffect(() => { refresh(); }, []);

  async function run(id: string, operation: () => Promise<unknown>) {
    setBusy(id);
    try { await operation(); refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'That return action is unavailable.'); } finally { setBusy(null); }
  }

  const handleReject = async (id: string) => {
    const reason = (rejectReasons[id] ?? '').trim();
    if (reason.length < 10) {
      setError('A rejection reason of at least 10 characters is required.');
      return;
    }
    const confirmed = await confirm({
      title: 'Reject this return?',
      description: `The customer will be told: “${reason}”. This decision is recorded and audited.`,
      confirmLabel: 'Reject return',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    await run(id, () => rejectReturn(id, reason));
  };

  const handleRefund = async (id: string, returnNumber: string) => {
    const confirmed = await confirm({
      title: `Request a refund for ${returnNumber}?`,
      description: 'This creates a financial refund request for authorized processing. The request is audited.',
      confirmLabel: 'Request refund',
      variant: 'default',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    await run(id, () => requestRefund(id));
  };

  const inspectionFor = (returnId: string, lineId: string) =>
    inspections[returnId]?.[lineId] ?? { condition: 'LIKE_NEW', disposition: 'RESTOCK' };

  const setInspection = (returnId: string, lineId: string, patch: Partial<{ condition: string; disposition: string }>) => {
    setInspections((prev) => ({ ...prev, [returnId]: { ...prev[returnId], [lineId]: { ...inspectionFor(returnId, lineId), ...patch } } }));
  };

  const handleInspect = (item: ReturnRequest) =>
    run(item.id, () =>
      inspectReturn(
        item.id,
        item.items.map((returnItem) => {
          const chosen = inspectionFor(item.id, returnItem.id);
          return {
            returnItemId: returnItem.id,
            condition: chosen.condition as (typeof CONDITIONS)[number],
            disposition: chosen.disposition as (typeof DISPOSITIONS)[number],
          };
        }),
      ),
    );

  return (
    <div className="operations-page">
      {confirmDialog}
      <div className="section-heading">
        <div><p className="eyebrow">Operations</p><h1>Returns queue</h1></div>
        <button className="button button--secondary" onClick={refresh}>Refresh</button>
      </div>
      {error ? <p className="inline-message" role="alert">{error}</p> : null}
      {!items ? (
        <div className="empty-state"><p>Loading returns...</p></div>
      ) : !items.length ? (
        <div className="empty-state"><h2>No return requests</h2><p>Customer requests will appear here after submission.</p></div>
      ) : (
        <div className="operations-list">
          {items.map((item) => (
            <article className="operations-item" key={item.id}>
              <div>
                <p className="eyebrow">{item.returnNumber} · {item.orderNumber}</p>
                <h2>{labels[item.status] ?? item.status}</h2>
                <p>{item.type} · {item.reason}</p>
                <p>{item.items.length} item line(s)</p>
              </div>
              <div className="cta-row">
                {item.status === 'REQUESTED' ? (
                  <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => reviewReturn(item.id))}>Review</button>
                ) : null}
                {item.status === 'UNDER_REVIEW' ? (
                  <>
                    <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => approveReturn(item.id))}>Approve</button>
                    <label>
                      <span className="muted-copy">Rejection reason *</span>
                      <input
                        type="text"
                        value={rejectReasons[item.id] ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRejectReasons((prev) => ({ ...prev, [item.id]: e.currentTarget.value }))}
                        placeholder="At least 10 characters…"
                        minLength={10}
                        aria-label={`Rejection reason for ${item.returnNumber}`}
                      />
                    </label>
                    <button className="button button--secondary" disabled={busy === item.id} onClick={() => handleReject(item.id)}>Reject</button>
                  </>
                ) : null}
                {item.status === 'APPROVED' ? (
                  <button className="button" disabled={busy === item.id} onClick={() => run(item.id, () => receiveReturn(item.id))}>Mark received</button>
                ) : null}
                {item.status === 'RECEIVED' ? (
                  <fieldset>
                    <legend className="muted-copy">Inspection per line</legend>
                    {item.items.map((returnItem) => {
                      const chosen = inspectionFor(item.id, returnItem.id);
                      return (
                        <div key={returnItem.id} className="form-grid">
                          <label>
                            <span>Line condition</span>
                            <select value={chosen.condition} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInspection(item.id, returnItem.id, { condition: e.currentTarget.value })} aria-label={`Condition for return line ${returnItem.id}`}>
                              {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </label>
                          <label>
                            <span>Disposition</span>
                            <select value={chosen.disposition} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInspection(item.id, returnItem.id, { disposition: e.currentTarget.value })} aria-label={`Disposition for return line ${returnItem.id}`}>
                              {DISPOSITIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </label>
                        </div>
                      );
                    })}
                    <button className="button" disabled={busy === item.id} onClick={() => handleInspect(item)}>Submit inspection</button>
                  </fieldset>
                ) : null}
                {item.status === 'APPROVED_FOR_RESOLUTION' && item.type === 'REFUND' ? (
                  <button className="button" disabled={busy === item.id} onClick={() => handleRefund(item.id, item.returnNumber)}>Request refund</button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
