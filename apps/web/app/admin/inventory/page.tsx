'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { adjustVariant, getAdminInventory, getInventoryReservations, restockVariant, type AdminInventoryRow, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, formatAdminDate } from '../../../components/admin';

export default function AdminInventoryPage() {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<AdminInventoryRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [params, setParams] = useState({
    page: 1,
    pageSize: 20,
    search: '',
    lowStock: searchParams.get('lowStock') === 'true',
    outOfStock: searchParams.get('outOfStock') === 'true',
  });
  const [action, setAction] = useState({ variantId: '', mode: 'restock' as 'restock' | 'adjust', quantity: '', reason: '' });
  const [reservations, setReservations] = useState<Array<{ id: string; quantity: number; status: string; createdAt: string; expiresAt: string | null; variant: { id: string; sku: string }; order: { id: string; orderNumber: string } }>>([]);
  const [reservationStatus, setReservationStatus] = useState('');
  const [reservationsError, setReservationsError] = useState<string | null>(null);

  const loadReservations = useCallback(async () => {
    setReservationsError(null);
    try {
      const result = await getInventoryReservations({ status: reservationStatus || undefined, pageSize: 20 });
      setReservations(result.reservations);
    } catch (e) {
      setReservationsError(e instanceof Error ? e.message : 'Failed to load reservations');
    }
  }, [reservationStatus]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminInventory({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, lowStock: params.lowStock || undefined, outOfStock: params.outOfStock || undefined });
      setRows(result.inventory);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const quantity = Number(action.quantity);
    if (!action.variantId || !Number.isInteger(quantity) || quantity === 0) {
      setError('Select a variant and enter a non-zero whole quantity.');
      return;
    }
    if (!action.reason.trim() || action.reason.trim().length < 3) {
      setError('A reason of at least 3 characters is required for every stock change.');
      return;
    }
    try {
      if (action.mode === 'restock') {
        if (quantity < 1) throw new Error('Restock quantity must be positive.');
        await restockVariant(action.variantId, { quantity, reason: action.reason.trim() });
        setMessage('Restocked and recorded as an IN movement.');
      } else {
        await adjustVariant(action.variantId, { delta: quantity, reason: action.reason.trim() });
        setMessage('Adjustment applied and recorded.');
      }
      setAction({ variantId: '', mode: 'restock', quantity: '', reason: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock operation failed');
    }
  };

  if (loading && rows.length === 0) return <div className="empty-state"><p>Loading inventory…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Inventory</h1>
          <p className="muted-copy">Controlled stock operations — every change writes a movement record</p>
        </div>
        <Link href="/admin/inventory/movements" className="button button--secondary">Movement History</Link>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}

      <section className="account-section">
        <h2>Restock / Adjust</h2>
        <form onSubmit={handleSubmit} className="account-form">
          <div className="form-grid">
            <label>
              <span>Variant (SKU)</span>
              <select value={action.variantId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAction((prev) => ({ ...prev, variantId: e.currentTarget.value }))} required>
                <option value="">Select…</option>
                {rows.map((row) => (
                  <option key={row.variantId} value={row.variantId}>{row.variant.sku} — avail {row.availableQuantity}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Operation</span>
              <select value={action.mode} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setAction((prev) => ({ ...prev, mode: e.currentTarget.value as 'restock' | 'adjust' }))}>
                <option value="restock">Restock (add stock)</option>
                <option value="adjust">Adjust (positive or negative)</option>
              </select>
            </label>
            <label>
              <span>Quantity {action.mode === 'adjust' ? '(use negative to reduce)' : ''}</span>
              <input type="number" step="1" value={action.quantity} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAction((prev) => ({ ...prev, quantity: e.currentTarget.value }))} required />
            </label>
            <label>
              <span>Reason *</span>
              <input type="text" value={action.reason} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAction((prev) => ({ ...prev, reason: e.currentTarget.value }))} required minLength={3} placeholder="damaged, stock count correction…" />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button">Apply Stock Change</button>
          </div>
        </form>
      </section>

      <section className="account-filters">
        <form
          className="account-search"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setParams((prev) => ({ ...prev, page: 1, search: String(form.get('search') ?? '') }));
          }}
        >
          <input type="search" name="search" defaultValue={params.search} placeholder="SKU or product name…" aria-label="Search inventory" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Stock filters">
          <button type="button" className={`account-filter-chip ${!params.lowStock && !params.outOfStock ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, lowStock: false, outOfStock: false }))}>All</button>
          <button type="button" className={`account-filter-chip ${params.lowStock ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, lowStock: !prev.lowStock, outOfStock: false }))}>Low stock</button>
          <button type="button" className={`account-filter-chip ${params.outOfStock ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, outOfStock: !prev.outOfStock, lowStock: false }))}>Out of stock</button>
        </div>
      </section>

      {rows.length === 0 ? (
        <AdminEmptyState title="No inventory records" message="Try adjusting the filters." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>On Hand</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.variant.sku}</strong></td>
                    <td>{row.variant.product.name}</td>
                    <td>{row.quantityOnHand}</td>
                    <td>{row.quantityReserved}</td>
                    <td>{row.availableQuantity}</td>
                    <td><AdminStatusBadge status={row.availableQuantity <= 0 ? 'OUT_OF_STOCK' : row.availableQuantity <= row.lowStockThreshold ? 'LOW_STOCK' : row.variant.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagination && <AdminPagination pagination={pagination} onPage={(page) => setParams((prev) => ({ ...prev, page }))} />}
        </>
      )}

      <section className="account-section">
        <div className="section-heading">
          <div>
            <h2>Active Reservations</h2>
            <p className="muted-copy">Read-only: stock held for open orders. Reservations convert or release through order processing — there is no manual mutation.</p>
          </div>
          <label>
            <span className="muted-copy">Status</span>
            <select value={reservationStatus} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReservationStatus(e.currentTarget.value)}>
              <option value="">All</option>
              <option value="ACTIVE">Active</option>
              <option value="CONVERTED">Converted</option>
              <option value="RELEASED">Released</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>
        </div>

        {reservationsError && <div className="inline-message" role="alert">{reservationsError}</div>}

        {reservations.length === 0 ? (
          <p className="muted-copy">No reservations match the current filter.</p>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>SKU</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {reservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td><Link href={`/admin/orders/${reservation.order.orderNumber}`}>{reservation.order.orderNumber}</Link></td>
                    <td>{reservation.variant.sku}</td>
                    <td>{reservation.quantity}</td>
                    <td><AdminStatusBadge status={reservation.status} /></td>
                    <td>{formatAdminDate(reservation.createdAt)}</td>
                    <td>{formatAdminDate(reservation.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
