'use client';

import { useEffect, useState } from 'react';
import {
  getNotificationPreferences,
  getPreferences,
  updateNotificationPreference,
  updatePreferences,
  type AccountPreferences,
  type NotificationPreferenceMatrix,
} from '../../../lib/shopping-api';
import { useTheme, type ThemeMode } from '../../../components/ThemeProvider';

const CHANNEL_LABELS: Record<string, string> = { IN_APP: 'In-app', EMAIL: 'Email', SMS: 'SMS' };
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  TRANSACTIONAL: 'Order, payment, delivery, return, and refund updates',
  SECURITY: 'Password changes and account security alerts',
  MARKETING: 'Promotions and new collection announcements',
};

export default function PreferencesPage() {
  const { mode, setMode } = useTheme();
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
  const [channelMatrix, setChannelMatrix] = useState<NotificationPreferenceMatrix | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([getPreferences(), getNotificationPreferences()])
      .then(([p, matrix]) => {
        if (mounted) {
          setPreferences(p);
          setFormData({
            emailOrderUpdates: p.emailOrderUpdates,
            emailDelivery: p.emailDelivery,
            emailReturns: p.emailReturns,
            emailMarketing: p.emailMarketing,
          });
          setChannelMatrix(matrix);
        }
      })
      .catch((e) => { if (mounted) setError(e instanceof Error ? e.message : 'Failed to load preferences'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleChannelToggle = async (category: string, channel: string, enabled: boolean) => {
    setError(null);
    setSuccess(null);
    try {
      const matrix = await updateNotificationPreference({ category, channel, enabled });
      setChannelMatrix(matrix);
      setSuccess('Channel preference updated');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update channel preference');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.currentTarget;
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

      <section className="account-preferences-section" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <p className="muted-copy">Choose how JB Mercantile looks. System follows your device setting.</p>
        <div className="choice-list" role="radiogroup" aria-label="Appearance">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((value) => (
            <label className="choice" key={value}>
              <input
                type="radio"
                name="appearance"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              <span>
                <strong style={{ textTransform: 'capitalize' }}>{value}</strong>
                <small>
                  {value === 'light' ? 'Bright surfaces, royal-blue accents.' : value === 'dark' ? 'Dark navy surfaces for low light.' : 'Match your device automatically.'}
                </small>
              </span>
            </label>
          ))}
        </div>
      </section>

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

      <section className="account-preferences-section" aria-label="Notification channels">
        <h2>Notification Channels</h2>
        <p className="muted-copy">
          Choose how you receive each type of update. Order, payment, delivery, return, refund, and security
          notifications always appear in your account. SMS is currently in a limited rollout.
        </p>
        {!channelMatrix ? (
          <p className="muted-copy">Loading channel preferences…</p>
        ) : (
          channelMatrix.map((group) => (
            <div key={group.category} className="account-channel-group">
              <h3>{group.category.toLowerCase()}</h3>
              <p className="muted-copy">{CATEGORY_DESCRIPTIONS[group.category] ?? ''}</p>
              {group.channels.map((entry) => (
                <div key={entry.channel} className="account-preference-toggle">
                  <div>
                    <strong>{CHANNEL_LABELS[entry.channel] ?? entry.channel}</strong>
                    {entry.locked && <p className="muted-copy">Always on for important updates</p>}
                  </div>
                  <label className="account-toggle">
                    <input
                      type="checkbox"
                      checked={entry.enabled}
                      disabled={entry.locked}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChannelToggle(group.category, entry.channel, e.currentTarget.checked)}
                      aria-label={`${CHANNEL_LABELS[entry.channel] ?? entry.channel} notifications for ${group.category.toLowerCase()}`}
                    />
                    <span className="account-toggle-slider" />
                  </label>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

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