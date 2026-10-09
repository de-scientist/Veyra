'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { getAdminAttributes, getAdminCategories, getAdminCollections, getAdminProduct, getProductCollections, setProductCollections, updateAdminProduct, type AdminAttribute, type AdminCategory, type AdminProductDetail } from '../../../../lib/admin-api';
import { AdminStatusBadge } from '../../../../components/admin';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { JBIcon } from '../../../../components/JBIcons';
import { OptionsToggle, PricingStockSection, availabilityLabel } from '../../../../components/PricingStockSection';
import { ProductMediaManager } from '../../../../components/ProductMediaManager';
import { publishChecklist } from '../../../../lib/product-publish';
import { useToast } from '../../../../components/Toast';
import { VariantManager } from '../../../../components/VariantManager';
import { formatKES } from '../../../../lib/variant-matrix';

async function fetchProduct(id: string): Promise<AdminProductDetail> {
  // Operations endpoint: works for DRAFT/ARCHIVED products the public
  // catalogue route no longer exposes.
  return getAdminProduct(id);
}

interface PageProps {
  // Next.js 14 (installed: 14.2.15): route params are synchronous.
  params: { id: string };
}

export default function AdminProductDetailPage({ params }: PageProps) {
  const routeId = params.id;
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [productId, setProductId] = useState<string | null>(null);
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [attributes, setAttributes] = useState<AdminAttribute[]>([]);
  const [collections, setCollections] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [assignedCollections, setAssignedCollections] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [collectionsSaving, setCollectionsSaving] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasOptions, setHasOptions] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', categoryId: '', status: 'DRAFT' });

  // Event values must be captured synchronously: React clears `currentTarget`
  // once the handler returns, so a functional updater that dereferences the
  // event would read `null.value` (same pattern as `new/page.tsx`).
  const set = (key: 'name' | 'description' | 'categoryId' | 'status', value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const load = useCallback(async (id: string) => {
    try {
      const [detail, cats, attrs, colls, assigned] = await Promise.all([fetchProduct(id), getAdminCategories(), getAdminAttributes(), getAdminCollections(), getProductCollections(id)]);
      setProduct(detail);
      setCategories(cats);
      setAttributes(attrs);
      setCollections(colls);
      const ids = assigned.collections.map((c) => c.id);
      setAssignedCollections(ids);
      setSelectedCollections(ids);
      setCollectionsError(null);
      setForm({ name: detail.name, description: detail.description ?? '', categoryId: detail.categoryId ?? '', status: detail.status });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setProductId(routeId);
    load(routeId);
  }, [routeId, load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId) return;
    setError(null);
    setSaving(true);
    try {
      await updateAdminProduct(productId, {
        name: form.name.trim(),
        description: form.description.trim(),
        categoryId: form.categoryId || null,
        status: form.status,
      });
      setMessage('Product updated');
      notify('success', 'Product updated.');
      await load(productId);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Update failed';
      // The backend enforces publish readiness on any transition to ACTIVE;
      // surface its checklist so staff know what is still missing.
      const friendly = /PRODUCT_NOT_READY|NOT_PUBLISHABLE|readiness/i.test(message)
        ? `This product cannot be published yet: ${message} Complete the missing items (category, item with price, primary image) and try again.`
        : message;
      setError(friendly);
      notify('error', friendly);
    } finally {
      setSaving(false);
    }
  };

  const reloadVariants = useCallback(async () => {
    if (!productId) return;
    await load(productId);
  }, [productId, load]);

  const handleOptionsChange = async (value: boolean) => {
    const multi = (product?.variants.length ?? 0) > 1;
    if (multi && !value) {
      notify('info', 'This product already has multiple items — options stay on. Archive extra items to return to a single item.');
      return;
    }
    if (value && !hasOptions && (product?.variants.length ?? 0) > 0) {
      const proceed = await confirm({
        title: 'Add options or variations?',
        description: 'Your current price and stock stay on the single item. You can then add options such as Size or Colour and set a price per item.',
        confirmLabel: 'Show options',
        onConfirm: () => undefined,
      });
      if (!proceed) return;
    }
    setHasOptions(value);
  };

  const toggleCollection = (collectionId: string) => {
    setSelectedCollections((prev) =>
      prev.includes(collectionId) ? prev.filter((id) => id !== collectionId) : [...prev, collectionId],
    );
  };

  const saveCollections = async () => {
    if (!productId) return;
    setCollectionsError(null);
    setCollectionsSaving(true);
    try {
      const result = await setProductCollections(productId, selectedCollections);
      const ids = result.collections.map((c) => c.id);
      setAssignedCollections(ids);
      setSelectedCollections(ids);
      setMessage('Collection assignments saved.');
      notify('success', 'Collection assignments saved.');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not save collections.';
      setCollectionsError(message);
      notify('error', message);
    } finally {
      setCollectionsSaving(false);
    }
  };

  const collectionsDirty =
    assignedCollections.length !== selectedCollections.length ||
    assignedCollections.some((id) => !selectedCollections.includes(id));

  if (loading) return <div className="empty-state"><p>Loading product…</p></div>;
  if (error && !product) return <div className="empty-state"><h1>Product not found</h1><p>{error}</p><Link href="/admin/products" className="button">Back to Products</Link></div>;
  if (!product) return <div className="empty-state"><h1>Product not found</h1></div>;

  const readiness = publishChecklist({
    name: form.name,
    slug: product.slug,
    categoryId: form.categoryId,
    description: form.description,
    variantCount: product.variants.length,
    imageCount: product.images.length,
  });
  const switchingToActive = form.status === 'ACTIVE' && product.status !== 'ACTIVE';
  const readinessBlockers = readiness.filter((item) => !item.ok);
  const multiVariant = product.variants.length > 1;
  const optionsOn = hasOptions || multiVariant;
  const archived = product.status === 'ARCHIVED';

  return (
    <div className="account-page product-workspace">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <Link href="/admin/products" className="text-button">← Back to Products</Link>
          <h1 style={{ marginTop: '0.5rem' }}>{product.name}</h1>
          <p className="muted-copy">
            {product.slug} • <AdminStatusBadge status={product.status} /> • {product.variants.length} item(s) • {product.images.length} image(s)
          </p>
        </div>
        <div className="account-page__actions">
          <Link href={`/products/${product.slug}`} className="button button--secondary">View storefront</Link>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}
      {message && <div className="success-message" role="status">{message}</div>}

      <div className="product-workspace__layout">
        <div className="product-workspace__main">
          <section className="workspace-card" aria-labelledby="edit-details-heading" id="ws-details">
            <h2 id="edit-details-heading">1 · Product Details</h2>
            <p className="muted-copy workspace-card__hint">
              Editable: name, description, category, status. The web address and item SKUs are set automatically and
              cannot be changed afterwards.
            </p>
            <form onSubmit={handleSave} className="account-form">
              <div className="form-grid">
                <label className="form-field-full">
                  <span>Product name *</span>
                  <input type="text" value={form.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.currentTarget.value)} required minLength={2} maxLength={200} disabled={saving} />
                </label>
                <label className="form-field-full">
                  <span>Description * (min 12 characters)</span>
                  <textarea value={form.description} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('description', e.currentTarget.value)} required minLength={12} rows={4} disabled={saving} />
                </label>
                <label>
                  <span>Category *</span>
                  <select value={form.categoryId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('categoryId', e.currentTarget.value)} disabled={saving}>
                    <option value="">No category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select value={form.status} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => set('status', e.currentTarget.value)} disabled={saving}>
                    <option value="DRAFT">Draft — not purchasable</option>
                    <option value="ACTIVE">Active — visible in the shop</option>
                    <option value="ARCHIVED">Archived — hidden from storefront</option>
                  </select>
                </label>
                <div className="form-field-full" role="note" aria-label="Immutable fields">
                  <span className="muted-copy">Web address (cannot be changed): /products/{product.slug}</span>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="button" disabled={saving} aria-busy={saving}><JBIcon name="check" size={16} /> {saving ? 'Saving…' : 'Save Changes'}</button>
                <Link href="/admin/products" className="button button--secondary">Cancel</Link>
              </div>
              {switchingToActive && readinessBlockers.length > 0 ? (
                <p className="inline-message" role="note">
                  Publishing checklist incomplete: {readinessBlockers.map((b) => b.label).join('; ')}. The server will
                  reject the change until these are complete.
                </p>
              ) : null}
            </form>
          </section>

          <section className="workspace-card" aria-labelledby="product-media-heading" id="ws-media">
            <h2 id="product-media-heading">2 · Images</h2>
            <p className="muted-copy workspace-card__hint">
              JPEG, PNG, or WebP photos. At least one photo is needed before publishing, and the primary photo is shown
              first in the shop.
            </p>
            {productId ? <ProductMediaManager productId={productId} editable={!archived} /> : null}
          </section>

          <section className="workspace-card" aria-labelledby="edit-pricing-heading" id="ws-pricing">
            <h2 id="edit-pricing-heading">3 · Pricing &amp; Stock</h2>
            {productId ? (
              <PricingStockSection
                productId={productId}
                productName={product.name}
                categoryId={form.categoryId || product.categoryId}
                categories={categories}
                attributes={attributes}
                existingVariants={product.variants}
                hasOptions={optionsOn}
                onHasOptionsChange={(v) => void handleOptionsChange(v)}
                onChanged={reloadVariants}
                disabled={archived}
                hideToggle
                variantTable="external"
                variantSectionId="ws-variant"
              />
            ) : null}
          </section>

          <section className="workspace-card" aria-labelledby="edit-variants-heading" id="ws-variant">
            <h2 id="edit-variants-heading">4 · Options &amp; Variants ({product.variants.length})</h2>
            <OptionsToggle
              id="edit-has-options"
              checked={optionsOn}
              disabled={archived}
              locked={multiVariant}
              lockedCount={product.variants.length}
              onChange={(v) => void handleOptionsChange(v)}
            />
            {optionsOn ? (
              productId ? (
                <VariantManager
                  productId={productId}
                  productName={product.name}
                  categoryId={form.categoryId || product.categoryId}
                  basePrice={product.basePrice === null || product.basePrice === undefined ? null : Number(product.basePrice)}
                  categories={categories}
                  attributes={attributes}
                  existingVariants={product.variants}
                  onChanged={reloadVariants}
                />
              ) : null
            ) : (
              <p className="muted-copy" role="note">
                Not needed for a single item — the price and stock above cover it. Turn options on only when customers
                choose between versions of this product.
              </p>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="edit-organisation-heading" id="ws-organisation">
            <h2 id="edit-organisation-heading">5 · Organisation &amp; Visibility</h2>
            <dl className="media-meta">
              <dt>Category</dt>
              <dd>{product.category?.name ?? 'None'}</dd>
              <dt>Status</dt>
              <dd>{product.status}</dd>
            </dl>
            {collections.length === 0 ? (
              <p className="muted-copy" role="note">No collections available yet.</p>
            ) : (
              <fieldset className="workspace-fieldset">
                <legend>Collections (optional)</legend>
                {collections.slice(0, 20).map((c) => (
                  <label key={c.id} className="facet-option" htmlFor={`edit-collection-${c.id}`}>
                    <input
                      id={`edit-collection-${c.id}`}
                      type="checkbox"
                      checked={selectedCollections.includes(c.id)}
                      onChange={() => toggleCollection(c.id)}
                      disabled={archived}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
            {collectionsError ? <p className="error-message" role="alert">{collectionsError}</p> : null}
            <div className="form-actions">
              <button type="button" className="button button--secondary" disabled={collectionsSaving || !collectionsDirty} onClick={saveCollections} title={!collectionsDirty ? 'No collection changes' : 'Save collection assignments'}>
                {collectionsSaving ? 'Saving…' : 'Save collections'}
              </button>
              <Link href="/admin/collections" className="button button--secondary">Open Collections</Link>
            </div>
          </section>
        </div>

        <div className="product-workspace__side">
          <section className="workspace-card" aria-labelledby="edit-inventory-heading">
            <h2 id="edit-inventory-heading">Stock summary</h2>
            {product.variants.length === 0 ? (
              <p className="muted-copy" role="note">No items yet — set the price and stock above to create the first item.</p>
            ) : (
              <ul className="workspace-progress" aria-label="Item stock levels">
                {product.variants.slice(0, 12).map((v) => {
                  const onHand = v.inventory?.quantityOnHand ?? null;
                  const reserved = v.inventory?.quantityReserved ?? 0;
                  const threshold = v.inventory?.lowStockThreshold ?? 5;
                  return (
                    <li key={v.id} className={onHand !== null && onHand - reserved <= 0 ? 'is-missing' : 'is-ok'}>
                      <JBIcon name={onHand !== null && onHand - reserved <= 0 ? 'close' : 'check'} size={14} />
                      <span>
                        <strong>{v.variantAttributeValues.map((m) => m.attributeValue.value).join(' / ') || v.name || v.sku}</strong>
                        {' — '}
                        {v.priceOverride === null || v.priceOverride === undefined ? 'no price yet' : formatKES(Number(v.priceOverride))}
                        {' · '}
                        {onHand === null ? 'not stocked' : availabilityLabel(onHand, reserved, threshold)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="muted-copy workspace-card__hint">
              Stock is audited and managed through inventory movements — item creation starts each item at zero on hand.
            </p>
            <Link href="/admin/inventory" className="button button--secondary">Open Inventory</Link>
          </section>

          <section className="workspace-card" aria-labelledby="edit-meta-heading">
            <h2 id="edit-meta-heading">Activity &amp; metadata</h2>
            <dl className="media-meta">
              <dt>Product ID</dt>
              <dd>{product.id}</dd>
              <dt>Web address</dt>
              <dd>/products/{product.slug}</dd>
              <dt>Status</dt>
              <dd>{product.status}</dd>
            </dl>
            <p className="muted-copy">IDs, web address, and item SKUs cannot be changed. Price and stock changes are audited.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
