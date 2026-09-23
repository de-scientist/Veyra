'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminCategories, getAdminProducts, updateAdminProduct, type AdminProduct, type Pagination } from '../../../lib/admin-api';
import { AdminEmptyState, AdminPagination, AdminStatusBadge, ConfirmAction, formatAdminDate } from '../../../components/admin';

const STATUSES = ['', 'DRAFT', 'ACTIVE', 'ARCHIVED'];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState({ page: 1, pageSize: 20, search: '', status: '', categoryId: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, cats] = await Promise.all([
        getAdminProducts({ page: params.page, pageSize: params.pageSize, search: params.search || undefined, status: params.status || undefined, categoryId: params.categoryId || undefined }),
        categories.length === 0 ? getAdminCategories() : Promise.resolve(categories),
      ]);
      setProducts(result.products);
      setPagination(result.pagination);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    load();
  }, [load]);

  const handleArchiveToggle = async (product: AdminProduct) => {
    const next = product.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED';
    try {
      await updateAdminProduct(product.id, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  if (loading && products.length === 0) return <div className="empty-state"><p>Loading products…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Products</h1>
          <p className="muted-copy">Catalogue management across all statuses</p>
        </div>
        <Link href="/admin/products/new" className="button">New Product</Link>
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
          <input type="search" name="search" defaultValue={params.search} placeholder="Name or slug…" aria-label="Search products" />
        </form>
        <div className="account-status-filters" role="group" aria-label="Status">
          {STATUSES.map((status) => (
            <button key={status || 'all'} type="button" className={`account-filter-chip ${params.status === status ? 'active' : ''}`} onClick={() => setParams((prev) => ({ ...prev, page: 1, status }))}>
              {status || 'All'}
            </button>
          ))}
        </div>
        <label>
          <span className="muted-copy">Category</span>
          <select value={params.categoryId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setParams((prev) => ({ ...prev, page: 1, categoryId: e.currentTarget.value }))}>
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
      </section>

      {products.length === 0 ? (
        <AdminEmptyState title="No products" message="No products match the current filters." actionHref="/admin/products/new" actionLabel="New Product" />
      ) : (
        <>
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Variants</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id}>
                    <td><Link href={`/admin/products/${product.id}`} className="account-order-link"><strong>{product.name}</strong></Link><br /><span className="muted-copy">{product.slug}</span></td>
                    <td>{product.category?.name ?? '—'}</td>
                    <td>{product._count.variants}</td>
                    <td><AdminStatusBadge status={product.status} /></td>
                    <td>{formatAdminDate(product.updatedAt)}</td>
                    <td>
                      <Link href={`/admin/products/${product.id}`} className="text-button">Edit</Link>{' '}
                      <ConfirmAction
                        label={product.status === 'ARCHIVED' ? 'Restore' : 'Archive'}
                        confirmMessage={product.status === 'ARCHIVED' ? `Restore ${product.name}?` : `Archive ${product.name}? It will disappear from the storefront but historical orders are preserved.`}
                        onConfirm={() => handleArchiveToggle(product)}
                        danger={product.status !== 'ARCHIVED'}
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
