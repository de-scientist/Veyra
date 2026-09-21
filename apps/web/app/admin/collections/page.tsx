'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  createAdminCollection,
  deleteAdminCollection,
  getAdminCollections,
  updateAdminCollection,
  type AdminCollection,
} from '../../../lib/admin-api';
import { AdminEmptyState } from '../../../components/admin';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';

export default function AdminCollectionsPage() {
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', status: 'ACTIVE' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCollections(await getAdminCollections());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load collections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({ name: '', slug: '', description: '', status: 'ACTIVE' });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setError('Collection name must be at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const input = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status,
      };
      if (editingId) {
        await updateAdminCollection(editingId, input);
        notify('success', 'Collection updated.');
      } else {
        await createAdminCollection({ ...input, slug: form.slug.trim() || undefined });
        notify('success', 'Collection created.');
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (collection: AdminCollection) => {
    const confirmed = await confirm({
      title: `Archive “${collection.name}”?`,
      description: `It holds ${collection._count.products} product(s). Memberships will be removed and the collection hidden from the storefront.`,
      confirmLabel: 'Archive collection',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    try {
      await deleteAdminCollection(collection.id);
      notify('success', 'Collection archived.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    }
  };

  if (loading) return <div className="empty-state"><p>Loading collections…</p></div>;

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <h1>Collections</h1>
          <p className="muted-copy">Curated merchandising sets for the storefront</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-section">
        <h2>{editingId ? 'Edit collection' : 'New collection'}</h2>
        <form onSubmit={handleSubmit} className="account-form">
          <div className="form-grid">
            <label>
              <span>Name *</span>
              <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required minLength={2} maxLength={120} />
            </label>
            {!editingId ? (
              <label>
                <span>Slug (optional)</span>
                <input type="text" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} maxLength={140} placeholder="auto-generated" />
              </label>
            ) : null}
            <label>
              <span>Status</span>
              <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}>
                <option value="ACTIVE">Active</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="form-field-full">
              <span>Description</span>
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} maxLength={2000} rows={2} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create collection'}</button>
            {editingId ? <button type="button" className="text-button" onClick={resetForm}>Cancel</button> : null}
          </div>
        </form>
      </section>

      <section className="account-section">
        <h2>All collections ({collections.length})</h2>
        {collections.length === 0 ? (
          <AdminEmptyState title="No collections" message="Create curated sets to merchandise the storefront." />
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Slug</th><th>Status</th><th>Products</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {collections.map((collection) => (
                  <tr key={collection.id}>
                    <td>{collection.name}</td>
                    <td className="muted-copy">{collection.slug}</td>
                    <td>{collection.status}</td>
                    <td>{collection._count.products}</td>
                    <td>
                      <div className="account-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setEditingId(collection.id);
                            setForm({ name: collection.name, slug: collection.slug, description: collection.description ?? '', status: collection.status });
                          }}
                        >
                          Edit
                        </button>
                        <button type="button" className="text-button text-button--danger" onClick={() => handleArchive(collection)}>Archive</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
