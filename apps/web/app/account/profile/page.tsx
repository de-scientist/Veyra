'use client';

import { useEffect, useState } from 'react';
import { getProfile, updateProfile, type AccountProfile } from '../../../lib/shopping-api';

export default function ProfilePage() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({ firstName: '', lastName: '', phone: '' });

  useEffect(() => {
    let mounted = true;
    getProfile()
      .then((p) => {
        if (mounted) {
          setProfile(p);
          setFormData({ firstName: p.firstName, lastName: p.lastName, phone: p.phone ?? '' });
        }
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load profile');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateProfile({
        firstName: formData.firstName.trim() || undefined,
        lastName: formData.lastName.trim() || undefined,
        phone: formData.phone.trim() || null,
      });
      setSuccess('Profile updated successfully');
      const updated = await getProfile();
      setProfile(updated);
      setFormData({ firstName: updated.firstName, lastName: updated.lastName, phone: updated.phone ?? '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="empty-state"><p>Loading profile…</p></div>;
  if (error && !profile) return <div className="empty-state"><h1>Unable to load profile</h1><p>{error}</p></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Profile</h1>
        <p className="muted-copy">Manage your personal information</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {success && <div className="success-message" role="status">{success}</div>}

      <form onSubmit={handleSubmit} className="account-form">
        <div className="form-grid">
          <label>
            <span>First Name</span>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              required
              maxLength={120}
              autoComplete="given-name"
            />
          </label>

          <label>
            <span>Last Name</span>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              required
              maxLength={120}
              autoComplete="family-name"
            />
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={profile?.email ?? ''}
              disabled
              className="input--disabled"
            />
            <small>Email cannot be changed. Contact support if you need to update it.</small>
          </label>

          <label>
            <span>Phone</span>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+254 7XX XXX XXX"
              autoComplete="tel"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      {profile && (
        <details className="account-meta">
          <summary>Account Information</summary>
          <dl className="account-meta-list">
            <dt>Account ID</dt>
            <dd>{profile.id}</dd>
            <dt>Member Since</dt>
            <dd>{new Date(profile.createdAt).toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</dd>
            <dt>Last Login</dt>
            <dd>{profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString('en-KE') : 'Never'}</dd>
            <dt>Email Verified</dt>
            <dd>{profile.emailVerifiedAt ? 'Yes' : 'Not verified'}</dd>
            <dt>Status</dt>
            <dd>{profile.status}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}