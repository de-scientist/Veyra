'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  createAdminCategory,
  deleteAdminCategory,
  getAdminCategories,
  updateAdminCategory,
  type AdminCategory,
} from '../../../lib/admin-api';
import { AdminEmptyState } from '../../../components/admin';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';

export default function AdminCategoriesPage() {
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', description: '', parentId: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCategories(await getAdminCategories());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm({ name: '', slug: '', description: '', parentId: '' });
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setError('Category name must be at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateAdminCategory(editingId, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          parentId: form.parentId || null,
        });
        notify('success', 'Category updated.');
      } else {
        await createAdminCategory({
          name: form.name.trim(),
          slug: form.slug.trim() || undefined,
          description: form.description.trim() || undefined,
          parentId: form.parentId || null,
        });
        notify('success', 'Category created.');
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (category: AdminCategory) => {
    setEditingId(category.id);
    setForm({ name: category.name, slug: category.slug, description: category.description ?? '', parentId: category.parentId ?? '' });
  };

  const handleArchive = async (category: AdminCategory) => {
    const confirmed = await confirm({
      title: `Archive “${category.name}”?`,
      description:
        category._count.products > 0
          ? 'This category has products and cannot be archived. Move its products first.'
          : 'The category will be hidden from the storefront. This can be reversed by support if needed.',
      confirmLabel: 'Archive category',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    try {
      await deleteAdminCategory(category.id);
      notify('success', 'Category archived.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Archive failed');
    }
  };

  if (loading) return <div className="empty-state"><p>Loading categories…</p></div>;

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <h1>Categories</h1>
          <p className="muted-copy">Department hierarchy for discovery and navigation</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-section">
        <h2>{editingId ? 'Edit category' : 'New category'}</h2>
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
              <span>Parent</span>
              <select value={form.parentId} onChange={(e) => setForm((p) => ({ ...p, parentId: e.target.value }))}>
                <option value="">Top level (department)</option>
                {categories.filter((c) => c.id !== editingId).map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label className="form-field-full">
              <span>Description</span>
              <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} maxLength={2000} rows={2} />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create category'}</button>
            {editingId ? <button type="button" className="text-button" onClick={resetForm}>Cancel</button> : null}
          </div>
        </form>
      </section>

      <section className="account-section">
        <h2>All categories ({categories.length})</h2>
        {categories.length === 0 ? (
          <AdminEmptyState title="No categories" message="Create the department pillars first (Fashion, Footwear, Kitchen & Home)." />
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr><th>Name</th><th>Slug</th><th>Parent</th><th>Products</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.name}</td>
                    <td className="muted-copy">{category.slug}</td>
                    <td>{categories.find((c) => c.id === category.parentId)?.name ?? '—'}</td>
                    <td>{category._count.products}</td>
                    <td>
                      <div className="account-actions">
                        <button type="button" className="text-button" onClick={() => handleEdit(category)}>Edit</button>
                        <button type="button" className="text-button text-button--danger" onClick={() => handleArchive(category)}>Archive</button>
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
