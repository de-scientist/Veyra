'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { createAdminProduct, getAdminCategories } from '../../../../lib/admin-api';

export default function NewAdminProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', categoryId: '', slug: '', status: 'DRAFT' });

  useEffect(() => {
    getAdminCategories().then(setCategories).catch(() => undefined);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.currentTarget;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const product = await createAdminProduct({
        name: form.name.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId || undefined,
        slug: form.slug.trim() || undefined,
        status: form.status,
      });
      router.push(`/admin/products/${(product as { id: string }).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create product');
      setSaving(false);
    }
  };

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/admin/products" className="text-button">← Back to Products</Link>
          <h1 style={{ marginTop: '0.5rem' }}>New Product</h1>
          <p className="muted-copy">Products start as drafts; publishing rules are enforced before activation.</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <form onSubmit={handleSubmit} className="account-form">
        <div className="form-grid">
          <label>
            <span>Name *</span>
            <input type="text" name="name" value={form.name} onChange={handleChange} required minLength={2} maxLength={200} />
          </label>
          <label>
            <span>Slug (optional)</span>
            <input type="text" name="slug" value={form.slug} onChange={handleChange} maxLength={220} placeholder="auto-generated" />
          </label>
          <label className="form-field-full">
            <span>Description * (min 12 characters)</span>
            <textarea name="description" value={form.description} onChange={handleChange} required minLength={12} rows={4} />
          </label>
          <label>
            <span>Category</span>
            <select name="categoryId" value={form.categoryId} onChange={handleChange}>
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select name="status" value={form.status} onChange={handleChange}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit" className="button" disabled={saving}>{saving ? 'Creating…' : 'Create Product'}</button>
        </div>
      </form>
    </div>
  );
}
