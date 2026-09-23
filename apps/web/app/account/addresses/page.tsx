'use client';

import { useEffect, useState } from 'react';
import { getAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type AccountAddress } from '../../../lib/shopping-api';
import { useConfirm } from '../../../components/ConfirmDialog';

export default function AddressesPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [addresses, setAddresses] = useState<AccountAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    label: '',
    line1: '',
    line2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'KE',
  });

  useEffect(() => {
    loadAddresses();
  }, []);

  const loadAddresses = async () => {
    try {
      const data = await getAddresses();
      setAddresses(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.currentTarget;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const resetForm = () => {
    setFormData({ label: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: 'KE' });
    setEditingId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.line1.trim() || !formData.city.trim()) {
      setError('Address line 1 and city are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateAddress(editingId, formData);
      } else {
        await createAddress(formData);
      }
      resetForm();
      await loadAddresses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (address: AccountAddress) => {
    setFormData({
      label: address.label ?? '',
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      state: address.state ?? '',
      postalCode: address.postalCode ?? '',
      country: address.country,
    });
    setEditingId(address.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete this address?',
      description: 'The address will be removed from your account. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: () => deleteAddress(id),
    });
    if (!confirmed) return;
    setError(null);
    await loadAddresses();
  };

  const handleSetDefault = async (id: string, type: 'shipping' | 'billing') => {
    setError(null);
    try {
      await setDefaultAddress(id, type);
      await loadAddresses();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set default address');
    }
  };

  if (loading) return <div className="empty-state"><p>Loading addresses…</p></div>;

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <h1>Addresses</h1>
          <p className="muted-copy">Manage your shipping and billing addresses</p>
        </div>
        <button type="button" className="button" onClick={() => { resetForm(); setShowForm(true); }}>
          Add Address
        </button>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      {showForm && (
        <section className="account-form-section">
          <h2>{editingId ? 'Edit Address' : 'Add Address'}</h2>
          <form onSubmit={handleSubmit} className="account-form">
            <div className="form-grid">
              <label>
                <span>Label (optional)</span>
                <input
                  type="text"
                  name="label"
                  value={formData.label}
                  onChange={handleChange}
                  placeholder="Home, Work, etc."
                  maxLength={60}
                />
              </label>

              <label className="form-field-full">
                <span>Address Line 1 *</span>
                <input
                  type="text"
                  name="line1"
                  value={formData.line1}
                  onChange={handleChange}
                  required
                  maxLength={180}
                  autoComplete="address-line1"
                />
              </label>

              <label>
                <span>Address Line 2</span>
                <input
                  type="text"
                  name="line2"
                  value={formData.line2}
                  onChange={handleChange}
                  maxLength={180}
                  autoComplete="address-line2"
                />
              </label>

              <label>
                <span>City *</span>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  required
                  maxLength={180}
                  autoComplete="address-level2"
                />
              </label>

              <label>
                <span>State/County</span>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  maxLength={60}
                  autoComplete="address-level1"
                />
              </label>

              <label>
                <span>Postal Code</span>
                <input
                  type="text"
                  name="postalCode"
                  value={formData.postalCode}
                  onChange={handleChange}
                  maxLength={20}
                  autoComplete="postal-code"
                />
              </label>

              <label>
                <span>Country</span>
                <select name="country" value={formData.country} onChange={handleChange}>
                  <option value="KE">Kenya</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <button type="button" className="button button--secondary" onClick={resetForm}>Cancel</button>
              <button type="submit" className="button" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update Address' : 'Add Address'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="account-addresses">
        {addresses.length === 0 ? (
          <div className="empty-state">
            <h2>No addresses saved</h2>
            <p>Add an address to speed up checkout</p>
            <button type="button" className="button" onClick={() => { resetForm(); setShowForm(true); }}>
              Add Address
            </button>
          </div>
        ) : (
          <div className="account-addresses-grid">
            {addresses.map((address) => (
              <article key={address.id} className="account-address-card">
                <header className="account-address-card__header">
                  <h3>{address.label ?? 'Unnamed Address'}</h3>
                  {address.isDefault && <span className="badge badge--default">Default</span>}
                </header>
                <address className="account-address-card__details">
                  {address.line1}<br />
                  {address.line2 && `${address.line2}<br />`}
                  {address.city}
                  {address.state && `, ${address.state}`}
                  {address.postalCode && ` ${address.postalCode}`}
                  <br />
                  {address.country}
                </address>
                <footer className="account-address-card__actions">
                  {!address.isDefault && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => handleSetDefault(address.id, 'shipping')}
                    >
                      Set as default
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => handleEdit(address)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-button text-button--danger"
                    onClick={() => handleDelete(address.id)}
                  >
                    Delete
                  </button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}