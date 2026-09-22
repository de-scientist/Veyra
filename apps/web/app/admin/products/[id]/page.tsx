'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { createAdminVariant, getAdminAttributes, getAdminCategories, getAdminProduct, updateAdminProduct, updateAdminVariant, type AdminAttribute } from '../../../../lib/admin-api';
import { AdminStatusBadge, ConfirmAction } from '../../../../components/admin';
import { ProductMediaManager } from '../../../../components/ProductMediaManager';

type ProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  variants: Array<{ id: string; sku: string; name: string | null; status: string; priceOverride: number | null; compareAtPrice: number | null }>;
  images: Array<{ id: string; url: string; altText: string | null }>;
};

async function fetchProduct(id: string): Promise<ProductDetail> {
  // Operations endpoint: works for DRAFT/ARCHIVED products the public
  // catalogue route no longer exposes.
  return getAdminProduct(id);
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function AdminProductDetailPage({ params }: PageProps) {
  const [productId, setProductId] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [attributes, setAttributes] = useState<AdminAttribute[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', description: '', categoryId: '', status: 'DRAFT' });
  const [variantForm, setVariantForm] = useState({ sku: '', name: '', price: '', attributeId: '', attributeValue: '' });

  const load = useCallback(async (id: string) => {
    try {
      const [detail, cats, attrs] = await Promise.all([fetchProduct(id), getAdminCategories(), getAdminAttributes()]);
      setProduct(detail);
      setCategories(cats);
      setAttributes(attrs);
      setForm({ name: detail.name, description: detail.description ?? '', categoryId: detail.categoryId ?? '', status: detail.status });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    params.then(({ id }) => {
      if (mounted) {
        setProductId(id);
        load(id);
      }
    });
    return () => {
      mounted = false;
    };
  }, [params, load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;
    setError(null);
    try {
      await updateAdminProduct(productId, {
        name: form.name.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        status: form.status,
      });
      setMessage('Product updated');
      await load(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const handleVariantStatus = async (variantId: string, status: string) => {
    if (!productId) return;
    try {
      await updateAdminVariant(productId, variantId, { status });
      await load(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Variant update failed');
    }
  };

  const handleVariantPrice = async (variantId: string, price: string) => {
    if (!productId) return;
    const value = Number(price);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a valid non-negative price.');
      return;
    }
    try {
      await updateAdminVariant(productId, variantId, { price: value });
      setMessage('Price updated and audited');
      await load(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Price update failed');
    }
  };

  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;
    const price = Number(variantForm.price);
    if (!variantForm.sku.trim() || !Number.isFinite(price) || price < 0) {
      setError('SKU and a valid non-negative price are required.');
      return;
    }
    try {
      await createAdminVariant(productId, {
        sku: variantForm.sku.trim(),
        name: variantForm.name.trim() || undefined,
        price,
        attributeValues: variantForm.attributeId && variantForm.attributeValue ? [{ attributeId: variantForm.attributeId, value: variantForm.attributeValue }] : [],
      });
      setVariantForm({ sku: '', name: '', price: '', attributeId: '', attributeValue: '' });
      setMessage('Variant created with zeroed inventory record');
      await load(productId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Variant creation failed');
    }
  };

  if (loading) return <div className="empty-state"><p>Loading product…</p></div>;
  if (error && !product) return <div className="empty-state"><h1>Product not found</h1><p>{error}</p><Link href="/admin/products" className="button">Back to Products</Link></div>;
  if (!product) return <div className="empty-state"><h1>Product not found</h1></div>;

  return (
    <div className="account-page">
      <header className="account-page__header">
        <div>
          <Link href="/admin/products" className="text-button">← Back to Products</Link>
          <h1 style={{ marginTop: '0.5rem' }}>{product.name}</h1>
          <p className="muted-copy">{product.slug} • <AdminStatusBadge status={product.status} /></p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}

      <section className="account-section">
        <h2>Details</h2>
        <form onSubmit={handleSave} className="account-form">
          <div className="form-grid">
            <label>
              <span>Name *</span>
              <input type="text" value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((prev) => ({ ...prev, name: e.currentTarget.value }))} required minLength={2} />
            </label>
            <label>
              <span>Status</span>
              <select value={form.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((prev) => ({ ...prev, status: e.currentTarget.value }))}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="form-field-full">
              <span>Description *</span>
              <textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, description: e.currentTarget.value }))} required minLength={12} rows={4} />
            </label>
            <label>
              <span>Category</span>
              <select value={form.categoryId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm((prev) => ({ ...prev, categoryId: e.currentTarget.value }))}>
                <option value="">No category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button">Save Changes</button>
          </div>
        </form>
      </section>

      <section className="account-section" aria-labelledby="product-media-heading">
        <h2 id="product-media-heading">Images</h2>
        {productId ? <ProductMediaManager productId={productId} editable={product.status !== 'ARCHIVED'} /> : null}
      </section>

      <section className="account-section">
        <h2>Variants ({product.variants.length})</h2>
        {product.variants.map((variant) => (
          <div key={variant.id} className="account-summary-card">
            <p><strong>{variant.sku}</strong> {variant.name ? `• ${variant.name}` : ''} • <AdminStatusBadge status={variant.status} /></p>
            <p className="muted-copy">Price: {variant.priceOverride ?? '—'}{variant.compareAtPrice ? ` (was ${variant.compareAtPrice})` : ''}</p>
            <div className="account-actions">
              <form
                onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get('price');
                  handleVariantPrice(variant.id, String(value ?? ''));
                }}
              >
                <input type="number" name="price" min="0" step="0.01" placeholder="New price" aria-label={`New price for ${variant.sku}`} />
                <button type="submit" className="button button--secondary">Update Price</button>
              </form>
              {variant.status !== 'ARCHIVED' ? (
                <ConfirmAction
                  label="Archive"
                  confirmMessage={`Archive variant ${variant.sku}? It will stop being purchasable. Stock history is preserved.`}
                  onConfirm={() => handleVariantStatus(variant.id, 'ARCHIVED')}
                  danger
                />
              ) : (
                <ConfirmAction
                  label="Restore"
                  confirmMessage={`Restore variant ${variant.sku} to ACTIVE?`}
                  onConfirm={() => handleVariantStatus(variant.id, 'ACTIVE')}
                />
              )}
            </div>
          </div>
        ))}

        <h3>Add Variant</h3>
        <form onSubmit={handleCreateVariant} className="account-form">
          <div className="form-grid">
            <label>
              <span>SKU *</span>
              <input type="text" value={variantForm.sku} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVariantForm((prev) => ({ ...prev, sku: e.currentTarget.value }))} required minLength={3} />
            </label>
            <label>
              <span>Name</span>
              <input type="text" value={variantForm.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVariantForm((prev) => ({ ...prev, name: e.currentTarget.value }))} />
            </label>
            <label>
              <span>Price (KES) *</span>
              <input type="number" value={variantForm.price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVariantForm((prev) => ({ ...prev, price: e.currentTarget.value }))} required min="0" step="0.01" />
            </label>
            <label>
              <span>Attribute</span>
              <select value={variantForm.attributeId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setVariantForm((prev) => ({ ...prev, attributeId: e.currentTarget.value }))}>
                <option value="">None</option>
                {attributes.map((attribute) => (
                  <option key={attribute.id} value={attribute.id}>{attribute.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Attribute value</span>
              <input type="text" value={variantForm.attributeValue} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVariantForm((prev) => ({ ...prev, attributeValue: e.currentTarget.value }))} placeholder="e.g. Large" />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button button--secondary">Add Variant</button>
          </div>
        </form>
      </section>
    </div>
  );
}
