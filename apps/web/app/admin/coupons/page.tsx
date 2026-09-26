'use client';

import { useCallback, useEffect, useState } from 'react';

import { createAdminCoupon, getAdminCoupons, updateAdminCoupon, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, ConfirmAction, formatAdminDate } from '../../../components/admin';

type CouponRow = {
  id: string;
  code: string;
  discountType: string;
  value: number;
  status: string;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usageCount: number;
  createdAt: string;
};

const COUPON_STATUSES = ['', 'ACTIVE', 'INACTIVE'];

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', status: '' });
  const [form, setForm] = useState({ code: '', discountType: 'PERCENTAGE', value: '', maxUses: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminCoupons({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, status: params.status || undefined });
      setCoupons(result.coupons as unknown as CouponRow[]);
      setPagination(result.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = Number(form.value);
    if (!form.code.trim() || !Number.isFinite(value) || value <= 0) {
      setError('Code and a positive value are required.');
      return;
    }
    try {
      await createAdminCoupon({ code: form.code.trim(), discountType: form.discountType, value, maxUses: form.maxUses ? Number(form.maxUses) : undefined });
      setForm({ code: '', discountType: 'PERCENTAGE', value: '', maxUses: '' });
      setMessage('Coupon created and audited.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Coupon creation failed');
    }
  };

  const handleToggle = async (coupon: CouponRow) => {
    const next = coupon.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await updateAdminCoupon(coupon.id, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Coupon update failed');
    }
  };

  if (loading && coupons.length === 0) return <div className="empty-state"><p>Loading coupons…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Coupons</h1>
          <p className="muted-copy">Existing coupon model administration — no new promotion engine</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}

      <section className="account-filters">
        <form
          className="account-search"
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setParams((prev) => ({ ...prev, page: 1, search: String(form.get('search') ?? '') }));
          }}
        >
          <input type="search" name="search" defaultValue={params.search} placeholder="Coupon code…" aria-label="Search coupons" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Coupon status">
          {COUPON_STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All'}
            </button>
          ))}
        </div>
      </section>

      <section className="account-section">
        <h2>New Coupon</h2>
        <form onSubmit={handleCreate} className="account-form">
          <div className="form-grid">
            <label>
              <span>Code *</span>
              <input type="text" value={form.code} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.currentTarget.value;
                setForm((prev) => ({ ...prev, code: value }));
              }} required minLength={3} placeholder="WELCOME10" />
            </label>
            <label>
              <span>Type</span>
              <select value={form.discountType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                const value = e.currentTarget.value;
                setForm((prev) => ({ ...prev, discountType: value }));
              }}>
                <option value="PERCENTAGE">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </select>
            </label>
            <label>
              <span>Value *</span>
              <input type="number" value={form.value} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.currentTarget.value;
                setForm((prev) => ({ ...prev, value }));
              }} required min="0" step="0.01" />
            </label>
            <label>
              <span>Max uses (optional)</span>
              <input type="number" value={form.maxUses} onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const value = e.currentTarget.value;
                setForm((prev) => ({ ...prev, maxUses: value }));
              }} min="1" step="1" />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button">Create Coupon</button>
          </div>
        </form>
      </section>

      {coupons.length === 0 ? (
        <AdminEmptyState title="No coupons" message="Create the first coupon above." />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Type / Value</th>
                  <th>Uses</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td><strong>{coupon.code}</strong></td>
                    <td>{coupon.discountType} {coupon.value}</td>
                    <td>{coupon.usageCount}{coupon.maxUses ? ` / ${coupon.maxUses}` : ''}</td>
                    <td><AdminStatusBadge status={coupon.status} /></td>
                    <td>{formatAdminDate(coupon.createdAt)}</td>
                    <td>
                      <ConfirmAction
                        label={coupon.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                        confirmMessage={`${coupon.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} coupon ${coupon.code}?`}
                        onConfirm={() => handleToggle(coupon)}
                        danger={coupon.status === 'ACTIVE'}
                      />
                    </td>
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
