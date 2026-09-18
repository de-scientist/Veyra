'use client';

import { useCallback, useEffect, useState } from 'react';

import { getInventoryAnalytics, type AnalyticsQuery } from '../../../../lib/analytics-api';
import { AnalyticsFilterBar, AnalyticsSubNav, BarList, KpiCard, SectionError } from '../../../../components/analytics';

type Inventory = {
  snapshot: { totalSkus: number; unitsOnHand: number; unitsReserved: number; availableUnits: number; lowStockSkus: number; outOfStockSkus: number };
  lowStock: Array<{ sku: string; productName: string; variantStatus: string; onHand: number; reserved: number; available: number; threshold: number; outOfStock: boolean }>;
  movements: { byType: Array<{ movementType: string; movements: number; quantity: number }>; largest: Array<{ id: string; movementType: string; quantity: number; reason: string; sku: string; productName: string }> };
  velocity: Array<{ sku: string; productName: string; soldUnits: number; available: number }>;
};

export default function InventoryAnalyticsPage() {
  const [query, setQuery] = useState<AnalyticsQuery>({ preset: 'last30' });
  const [data, setData] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData((await getInventoryAnalytics(query)) as unknown as Inventory);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load inventory analytics');
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
          <h1>Inventory Analytics</h1>
          <p className="muted-copy">Live snapshot plus period movement. No valuation is reported — no cost data exists.</p>
        </div>
      </header>

      <AnalyticsSubNav active="inventory" />
      <AnalyticsFilterBar query={query} onChange={setQuery} />

      {loading && <div className="empty-state"><p>Loading inventory…</p></div>}
      {error && <SectionError message={error} onRetry={load} />}

      {data && (
        <>
          <section className="account-section" aria-label="Stock snapshot">
            <div className="account-summary-grid">
              <KpiCard label="SKUs" value={String(data.snapshot.totalSkus)} />
              <KpiCard label="Units on Hand" value={String(data.snapshot.unitsOnHand)} />
              <KpiCard label="Units Reserved" value={String(data.snapshot.unitsReserved)} />
              <KpiCard label="Available Units" value={String(data.snapshot.availableUnits)} />
              <KpiCard label="Low-Stock SKUs" value={String(data.snapshot.lowStockSkus)} />
              <KpiCard label="Out-of-Stock SKUs" value={String(data.snapshot.outOfStockSkus)} />
            </div>
          </section>

          <section className="account-section" aria-label="Sales velocity">
            <h2>Sales Velocity (units sold in period)</h2>
            <BarList rows={data.velocity.map((row) => ({ label: `${row.productName} (${row.sku})`, value: row.soldUnits, sub: `${row.available} available` }))} label="Sales velocity" />
          </section>

          <section className="account-section" aria-label="Movements">
            <h2>Movements by Type</h2>
            <BarList rows={data.movements.byType.map((row) => ({ label: row.movementType, value: row.movements, sub: `${row.quantity} units` }))} label="Movements by type" />
          </section>

          <section className="account-section" aria-label="Low stock">
            <h2>Low &amp; Out-of-Stock</h2>
            <div className="admin-table-wrapper">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Available</th>
                    <th>Threshold</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lowStock.map((row) => (
                    <tr key={row.sku}>
                      <td><strong>{row.sku}</strong><br /><span className="muted-copy">{row.productName}</span></td>
                      <td>{row.available}</td>
                      <td>{row.threshold}</td>
                      <td>{row.outOfStock ? 'Out of stock' : 'Low stock'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
