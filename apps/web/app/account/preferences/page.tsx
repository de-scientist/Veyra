'use client';

import { useEffect, useState } from 'react';
import { getPreferences, updatePreferences, type AccountPreferences } from '../../../lib/shopping-api';

export default function PreferencesPage() {
  const [preferences, setPreferences] = useState<AccountPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    emailOrderUpdates: true,
    emailDelivery: true,
    emailReturns: true,
    emailMarketing: false,
  });

  useEffect(() => {
    let mounted = true;
    getPreferences()
      .then((p) => {
        if (mounted) {
          setPreferences(p);
          setFormData({
            emailOrderUpdates: p.emailOrderUpdates,
            emailDelivery: p.emailDelivery,
            emailReturns: p.emailReturns,
            emailMarketing: p.emailMarketing,
          });
        }
      })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load preferences'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updatePreferences(formData);
      setSuccess('Preferences updated successfully');
      const updated = await getPreferences();
      setPreferences(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state"><p>Loading preferences…</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Preferences</h1>
        <p className="muted-copy">Manage your notification and communication preferences</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {success && <div className="success-message" role="status">{success}</div>}

      <form onSubmit={handleSubmit} className="account-preferences-form">
        <section className="account-preferences-section">
          <h2>Order & Delivery Notifications</h2>
          <p className="muted-copy">Receive emails about your orders and deliveries</p>

          <div className="account-preference-toggle">
            <div>
              <strong>Order Updates</strong>
              <p className="muted-copy">Order confirmations, status changes, and receipts</p>
            </div>
            <label className="account-toggle">
              <input
                type="checkbox"
                name="emailOrderUpdates"
                checked={formData.emailOrderUpdates}
                onChange={handleChange}
              />
              <span className="account-toggle-slider" />
            </label>
          </div>

          <div className="account-preference-toggle">
            <div>
              <strong>Delivery Notifications</strong>
              <p className="muted-copy">Shipping updates, tracking, and delivery confirmations</p>
            </div>
            <label className="account-toggle">
              <input
                type="checkbox"
                name="emailDelivery"
                checked={formData.emailDelivery}
                onChange={handleChange}
              />
              <span className="account-toggle-slider" />
            </label>
          </div>

          <div className="account-preference-toggle">
            <div>
              <strong>Return & Refund Updates</strong>
              <p className="muted-copy">Return status changes and refund confirmations</p>
            </div>
            <label className="account-toggle">
              <input
                type="checkbox"
                name="emailReturns"
                checked={formData.emailReturns}
                onChange={handleChange}
              />
              <span className="account-toggle-slider" />
            </label>
          </div>
        </section>

        <section className="account-preferences-section">
          <h2>Marketing Communications</h2>
          <p className="muted-copy">Receive promotional emails about new products, sales, and offers</p>

          <div className="account-preference-toggle">
            <div>
              <strong>Marketing Emails</strong>
              <p className="muted-copy">Newsletters, promotions, and product recommendations</p>
            </div>
            <label className="account-toggle">
              <input
                type="checkbox"
                name="emailMarketing"
                checked={formData.emailMarketing}
                onChange={handleChange}
              />
              <span className="account-toggle-slider" />
            </label>
          </div>
        </section>

        <div className="form-actions">
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save Preferences'}
          </button>
        </div>
      </form>

      {preferences && (
        <details className="account-meta">
          <summary>Preference Details</summary>
          <dl className="account-meta-list">
            <dt>Last Updated</dt>
            <dd>{new Date(preferences.updatedAt).toLocaleString('en-KE')}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}