'use client';

import { useCallback, useEffect, useState } from 'react';

import { getCategoryAnalytics, getProductAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, SectionError, formatKes, formatPct } from '../../../../components/analytics';

type Products = {
  topProducts: Array<{ productName: string; sku: string; units: number; revenue: number; orders: number; averagePrice: number | null; returnedUnits: number; returnRate: number | null }>;
  topVariants: Array<{ productName: string; sku: string; variantDescription: string | null; units: number; revenue: number; available: number }>;
  mostReturned: Array<{ productName: string; sku: string; returnedUnits: number; requests: number }>;
};

type Categories = { note: string; byCategory: Array<{ category: string; revenue: number; units: number; orders: number }> };

export default function ProductsAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30', limit: 15 });
  const [data, setData] = useState<Products | null>(null);
  const [categories, setCategories] = useState<Categories | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [products, cats] = await Promise.all([getProductAnalytics(query), getCategoryAnalytics(query)]);
      setData(products as unknown as Products);
      setCategories(cats as unknown as Categories);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product analytics');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Product Analytics</h1>
          <p className="muted-copy">Snapshot-based history — archived products remain reportable</p>
        </div>
      </header>

      <AnalyticsSubNav active="products" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading products…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Top products">
            <h2>Top Products by Revenue</h2>
            <BarList rows={data.topProducts.map((row) => ({ label: `${row.productName} (${row.sku})`, value: row.revenue, sub: `${row.units} units • ${row.orders} orders • returns ${row.returnedUnits}` }))} label="Top products by revenue" format={formatKes} />
          </section>

          <section className="account-section" aria-label="Top variants">
            <h2>Top Variants by Revenue</h2>
            <BarList rows={data.topVariants.map((row) => ({ label: `${row.productName} — ${row.variantDescription ?? row.sku}`, value: row.revenue, sub: `${row.units} units • ${row.available} available` }))} label="Top variants by revenue" format={formatKes} />
          </section>

          <section className="account-section" aria-label="Categories">
            <h2>Revenue by Category</h2>
            <p className="muted-copy">{categories?.note}</p>
            <BarList rows={(categories?.byCategory ?? []).map((row) => ({ label: row.category, value: row.revenue, sub: `${row.units} units` }))} label="Revenue by category" format={formatKes} />
          </section>

          <section className="account-section" aria-label="Product detail">
            <h2>Product Detail</h2>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Units</th>
                    <th>Revenue</th>
                    <th>Avg Price</th>
                    <th>Returned</th>
                    <th>Return Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((row) => (
                    <tr key={row.sku}>
                      <td><strong>{row.productName}</strong><br /><span className="muted-copy">{row.sku}</span></td>
                      <td>{row.units}</td>
                      <td>{formatKes(row.revenue)}</td>
                      <td>{row.averagePrice === null ? '—' : formatKes(row.averagePrice)}</td>
                      <td>{row.returnedUnits}</td>
                      <td>{formatPct(row.returnRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="account-section" aria-label="Most returned">
            <h2>Most Returned Products</h2>
            <BarList rows={data.mostReturned.map((row) => ({ label: `${row.productName} (${row.sku})`, value: row.returnedUnits, sub: `${row.requests} requests` }))} label="Most returned products" />
          </section>
        </>
      )}
    </div>
  );
}
