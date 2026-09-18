'use client';

import { useEffect, useState } from 'react';
import { getSessions, changePassword, revokeSession, revokeOtherSessions, deactivateAccount, deleteAccount, type AccountSession } from '../../../lib/shopping-api';

export default function SecurityPage() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Password change form
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await getSessions();
      setSessions(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError(null);
    setSuccess(null);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setChangingPassword(true);
    setError(null);
    setSuccess(null);
    try {
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        confirmPassword: passwordForm.confirmPassword,
      });
      setSuccess('Password changed successfully. Other sessions have been revoked.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (id: string) => {
    if (!confirm('Revoke this session? You will be logged out from that device.')) return;
    setError(null);
    try {
      await revokeSession(id);
      setSuccess('Session revoked');
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke session');
    }
  };

  const handleRevokeOthers = async () => {
    if (!confirm('Revoke all other sessions? You will be logged out from all other devices.')) return;
    setError(null);
    try {
      await revokeOtherSessions();
      setSuccess('All other sessions revoked');
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revoke sessions');
    }
  };

  function formatDateTime(dateString: string) {
    return new Date(dateString).toLocaleString('en-KE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="account-page">
      <header className="account-page__header">
        <h1>Security</h1>
        <p className="muted-copy">Manage your password and active sessions</p>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {success && <div className="success-message" role="status">{success}</div>}

      <section className="account-section account-security-section">
        <h2>Change Password</h2>
        <form onSubmit={handlePasswordSubmit} className="account-form">
          <div className="form-grid">
            <label>
              <span>Current Password</span>
              <input
                type="password"
                name="currentPassword"
                value={passwordForm.currentPassword}
                onChange={handlePasswordChange}
                required
                autoComplete="current-password"
              />
            </label>
            <label>
              <span>New Password</span>
              <input
                type="password"
                name="newPassword"
                value={passwordForm.newPassword}
                onChange={handlePasswordChange}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>Confirm New Password</span>
              <input
                type="password"
                name="confirmPassword"
                value={passwordForm.confirmPassword}
                onChange={handlePasswordChange}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button" disabled={changingPassword}>
              {changingPassword ? 'Changing…' : 'Change Password'}
            </button>
          </div>
        </form>
      </section>

      <section className="account-section account-security-section">
        <div className="account-section__header">
          <h2>Active Sessions</h2>
          <button type="button" className="text-button text-button--danger" onClick={handleRevokeOthers} disabled={sessions.filter(s => !s.revokedAt).length <= 1}>
            Revoke All Other Sessions
          </button>
        </div>

        {loading ? (
          <div className="empty-state"><p>Loading sessions…</p></div>
        ) : sessions.length === 0 ? (
          <div className="empty-state"><p>No active sessions</p></div>
        ) : (
          <div className="account-sessions">
            {sessions.map((session) => (
              <article key={session.id} className={`account-session-card ${session.isCurrent ? 'current' : ''} ${session.revokedAt ? 'revoked' : ''}`}>
                <header className="account-session-card__header">
                  <div className="account-session-card__device">
                    {session.isCurrent && <span className="badge badge--current">Current</span>}
                    <strong>{session.device}</strong>
                    {session.revokedAt && <span className="badge badge--revoked">Revoked</span>}
                  </div>
                  <div className="account-session-card__meta">
                    <span>Created: {formatDateTime(session.createdAt)}</span>
                    {session.lastUsedAt && <span>Last used: {formatDateTime(session.lastUsedAt)}</span>}
                    <span>Expires: {formatDateTime(session.expiresAt)}</span>
                    {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                  </div>
                </header>
                {!session.revokedAt && !session.isCurrent && (
                  <footer className="account-session-card__actions">
                    <button
                      type="button"
                      className="text-button text-button--danger"
                      onClick={() => handleRevokeSession(session.id)}
                    >
                      Revoke
                    </button>
                  </footer>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="account-section account-security-section">
        <h2>Account Actions</h2>
        <div className="account-danger-zone">
          <div>
            <h3>Deactivate Account</h3>
            <p className="muted-copy">Temporarily disable your account. You can reactivate later by contacting support.</p>
            <button type="button" className="button button--secondary button--danger" onClick={async () => {
              if (confirm('Are you sure you want to deactivate your account? This will log you out and disable your account.')) {
                try {
                  await deactivateAccount();
                  alert('Account deactivated');
                  window.location.href = '/';
                } catch {
                  alert('Failed to deactivate account');
                }
              }
            }}>
              Deactivate Account
            </button>
          </div>
          <hr />
          <div>
            <h3>Delete Account</h3>
            <p className="muted-copy">Permanently delete your account and all personal data. This action cannot be undone.</p>
            <button type="button" className="button button--danger" onClick={async () => {
              if (confirm('Are you absolutely sure you want to delete your account? Your orders and payment records are retained for legal/financial reasons; personal access will be disabled.')) {
                try {
                  await deleteAccount();
                  alert('Account deletion requested');
                  window.location.href = '/';
                } catch {
                  alert('Failed to delete account');
                }
              }
            }}>
              Delete Account
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}