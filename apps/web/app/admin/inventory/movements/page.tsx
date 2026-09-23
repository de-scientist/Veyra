'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getInventoryMovements, type Pagination } from '../../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate } from '../../../../components/admin';

const TYPES = ['', 'IN', 'OUT', 'ADJUSTMENT', 'RESERVED', 'RELEASED', 'RETURN'];

type Movement = {
  id: string;
  movementType: string;
  quantity: number;
  reason: string;
  referenceType: string | null;
  referenceId: string | null;
  note: string | null;
  actorId: string | null;
  createdAt: string;
  variant: { id: string; sku: string; product: { name: string } };
};

export default function InventoryMovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', movementType: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getInventoryMovements({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, movementType: params.movementType || undefined });
      setMovements(result.movements as unknown as Movement[]);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load movements');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && movements.length === 0) return <div className="empty-state"><p>Loading movements…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/admin/inventory" className="text-button">← Back to Inventory</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Inventory Movements</h1>
          <p className="muted-copy">Immutable stock audit trail</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-filters">
        <form
          className="account-search"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setParams((prev) => ({ ...prev, page: 1, search: String(form.get('search') ?? '') }));
          }}
        >
          <input type="search" name="search" defaultValue={params.search} placeholder="Reason or reference…" aria-label="Search movements" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Movement type">
          {TYPES.map((type) => (
            <button key={type || 'all'} type="button" className={`account-filter-chip ${params.movementType === type ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, movementType: type }))}>
              {type || 'All types'}
            </button>
          ))}
        </div>
      </section>

      {movements.length === 0 ? (
        <AdminEmptyState title="No movements" message="No stock movements match the current filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>SKU</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Reason</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatAdminDate(movement.createdAt)}</td>
                    <td><strong>{movement.variant.sku}</strong><br /><span className="muted-copy">{movement.variant.product.name}</span></td>
                    <td><AdminStatusBadge status={movement.movementType} /></td>
                    <td>{movement.quantity}</td>
                    <td>{movement.reason}{movement.note ? <><br /><span className="muted-copy">{movement.note}</span></> : null}</td>
                    <td>{movement.referenceType ?? '—'}{movement.referenceId ? <><br /><span className="muted-copy">{movement.referenceId.slice(0, 8)}…</span></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && <AdminPagination pagination={pagination} onPage={(page) => setParams((prev) => ({ ...prev, page }))} />}
        </>
      )}
    </div>
  );
}
