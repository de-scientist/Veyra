'use client';

import { useEffect, useState } from 'react';

import { getAdminSettings } from '../../../lib/admin-api';
import { AdminStatusBadge, formatMoney } from '../../../components/admin';

type Settings = {
  currency: string;
  shipping: {
    zones: Array<{ id: string; code: string; name: string; country: string; status: string }>;
    methods: Array<{ id: string; code: string; name: string; type: string; status: string }>;
    rates: Array<{ id: string; basePrice: number; minOrderValue: number; status: string; zone: { code: string; name: string }; method: { code: string; name: string } }>;
  };
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getAdminSettings()
      .then((result) => {
        if (mounted) setSettings(result as unknown as Settings);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load settings');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) return <div className="empty-state"><p>Loading settings…</p></div>;
  if (error) return <div className="empty-state"><h1>Unable to load settings</h1><p>{error}</p></div>;
  if (!settings) return <div className="empty-state"><h1>No settings</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <h1>Operational Settings</h1>
          <p className="muted-copy">Read-only business configuration. Infrastructure secrets stay in environment configuration and are never editable here.</p>
        </div>
      </header>

      <section className="account-section">
        <h2>Currency</h2>
        <p><strong>{settings.currency}</strong> (Kenya Shilling)</p>
      </section>

      <section className="account-section">
        <h2>Shipping Zones ({settings.shipping.zones.length})</h2>
        {settings.shipping.zones.map((zone) => (
          <p key={zone.id}><strong>{zone.name}</strong> <span className="muted-copy">{zone.code} • {zone.country} • {zone.status}</span></p>
        ))}
      </section>

      <section className="account-section">
        <h2>Shipping Methods ({settings.shipping.methods.length})</h2>
        {settings.shipping.methods.map((method) => (
          <p key={method.id}><strong>{method.name}</strong> <span className="muted-copy">{method.code} • {method.type} • {method.status}</span></p>
        ))}
      </section>

      <section className="account-section">
        <h2>Shipping Rates ({settings.shipping.rates.length})</h2>
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Method</th>
                <th>Base Price</th>
                <th>Min Order</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {settings.shipping.rates.map((rate) => (
                <tr key={rate.id}>
                  <td>{rate.zone.name}</td>
                  <td>{rate.method.name}</td>
                  <td>{formatMoney(rate.basePrice, settings.currency)}</td>
                  <td>{formatMoney(rate.minOrderValue, settings.currency)}</td>
                  <td><AdminStatusBadge status={rate.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
