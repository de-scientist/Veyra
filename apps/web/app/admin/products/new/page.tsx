'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { ProductMediaManager } from '../../../../components/ProductMediaManager';
import { JBIcon } from '../../../../components/JBIcons';
import { useToast } from '../../../../components/Toast';
import {
  createAdminProduct,
  createAdminVariant,
  getAdminAttributes,
  getAdminCategories,
  getAdminCollections,
  getAdminProductImages,
  updateAdminProduct,
  type AdminAttribute,
} from '../../../../lib/admin-api';
import {
  firstVariantSchema,
  productDraftSchema,
  publishChecklist,
  slugify,
} from '../../../../lib/product-publish';

type Phase = 'draft' | 'complete';

function fieldError(errors: Record<string, string>, key: string): string | null {
  return errors[key] ?? null;
}

/**
 * Product creation workspace.
 * Backend reality: ProductImage rows require an existing productId, so the
 * flow is draft-first (obtain ID) → signed Cloudinary media → variants →
 * review/publish. No orphan temporaries, no second upload path.
 */
export default function NewAdminProductPage() {
  const router = useRouter();
  const { notify } = useToast();
  const [phase, setPhase] = useState<Phase>('draft');
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [collections, setCollections] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [attributes, setAttributes] = useState<AdminAttribute[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(0);
  const [variantCount, setVariantCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', slug: '', description: '', categoryId: '', status: 'DRAFT' });
  const [variant, setVariant] = useState({ sku: '', name: '', price: '', compareAtPrice: '', attributeId: '', attributeValue: '' });
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    getAdminCategories().then(setCategories).catch(() => undefined);
    getAdminCollections().then(setCollections).catch(() => undefined);
    getAdminAttributes().then(setAttributes).catch(() => undefined);
  }, []);

  // Safe unsaved-changes warning for long editing sessions.
  useEffect(() => {
    if (!dirty || phase === 'complete') return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, phase]);

  const autoSlug = useMemo(() => slugify(form.name), [form.name]);
  const effectiveSlug = form.slug.trim() || autoSlug;
  const checklist = publishChecklist({
    name: form.name,
    slug: effectiveSlug,
    categoryId: form.categoryId,
    description: form.description,
    variantCount,
    imageCount,
  });
  const blockingCount = checklist.filter((c) => !c.ok).length;

  const set = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const setV = (key: string, value: string) => {
    setVariant((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const createDraft = async (publish: boolean): Promise<string | null> => {
    setFormError(null);
    const parsed = productDraftSchema.safeParse({
      ...form,
      slug: form.slug.trim() ? slugify(form.slug) : undefined,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0] ?? 'form')] = issue.message;
      setErrors(next);
      setFormError('Fix the highlighted fields before saving.');
      return null;
    }
    setErrors({});
    setSaving(true);
    try {
      const product = await createAdminProduct({
        name: parsed.data.name,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        slug: parsed.data.slug || undefined,
        status: publish ? 'ACTIVE' : parsed.data.status,
      });
      const id = (product as { id: string }).id;
      setCreatedId(id);
      setPhase('complete');
      setDirty(false);
      notify('success', publish ? 'Product created and published.' : 'Draft created. Add images and the first variant below.');
      return id;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not create product';
      setFormError(message);
      notify('error', message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const refreshMedia = async (productId: string) => {
    try {
      const images = await getAdminProductImages(productId);
      setImageCount(images.length);
    } catch {
      // Gallery shows its own retry state; checklist just stays conservative.
    }
  };

  const addFirstVariant = async () => {
    if (!createdId) return;
    const parsed = firstVariantSchema.safeParse(variant);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0] ?? 'form')] = issue.message;
      setVariantErrors(next);
      return;
    }
    setVariantErrors({});
    setSaving(true);
    try {
      await createAdminVariant(createdId, {
        sku: parsed.data.sku,
        name: parsed.data.name || undefined,
        price: parsed.data.price,
        compareAtPrice: parsed.data.compareAtPrice,
        attributeValues: [{ attributeId: parsed.data.attributeId, value: parsed.data.attributeValue }],
      });
      setVariantCount((c) => c + 1);
      setVariant({ sku: '', name: '', price: '', compareAtPrice: '', attributeId: '', attributeValue: '' });
      notify('success', 'Variant created with a zeroed inventory record.');
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Variant creation failed');
    } finally {
      setSaving(false);
    }
  };

  const publishNow = async () => {
    if (!createdId) return;
    if (variantCount === 0 || imageCount === 0) {
      notify('error', 'Add at least one variant and one image before publishing.');
      return;
    }
    setSaving(true);
    try {
      await updateAdminProduct(createdId, { status: 'ACTIVE' });
      notify('success', 'Product published.');
      router.push(`/admin/products/${createdId}`);
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-page product-workspace">
      <header className="account-page__header">
        <div>
          <Link href="/admin/products" className="text-button">← Back to Products</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Create Product</h1>
          <p className="muted-copy">
            Draft-first workspace: save a draft to unlock signed Cloudinary uploads and variants, then review and publish.
          </p>
        </div>
        <div className="account-page__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={saving || phase === 'complete'}
            onClick={() => createDraft(false)}
            aria-busy={saving}
          >
            <JBIcon name="doc" size={16} /> {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            className="button"
            disabled={saving || phase === 'complete'}
            onClick={() => createDraft(false)}
            aria-busy={saving}
            title={blockingCount > 0 ? `${blockingCount} checklist item(s) still open — the product will stay a draft until variants and images exist` : 'Create product'}
          >
            <JBIcon name="check" size={16} /> {saving ? 'Creating…' : 'Create Product'}
          </button>
        </div>
      </header>

      {formError && (
        <div className="error-message" role="alert">
          {formError}
          {Object.keys(errors).length > 0 && (
            <ul>
              {Object.entries(errors).map(([k, v]) => (
                <li key={k}>{v}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="product-workspace__layout">
        <div className="product-workspace__main">
          <section className="workspace-card" aria-labelledby="ws-basic">
            <h2 id="ws-basic">1 · Basic information</h2>
            <div className="form-grid">
              <label>
                <span>Product name *</span>
                <input
                  type="text"
                  value={form.name}
                  maxLength={200}
                  aria-invalid={Boolean(fieldError(errors, 'name'))}
                  aria-describedby={fieldError(errors, 'name') ? 'err-name' : undefined}
                  onChange={(e) => set('name', e.currentTarget.value)}
                />
                {fieldError(errors, 'name') && <span id="err-name" className="field-error" role="alert">{fieldError(errors, 'name')}</span>}
              </label>
              <label>
                <span>Slug {form.slug ? '' : `(auto: ${autoSlug || '—'})`}</span>
                <input type="text" value={form.slug} maxLength={220} placeholder="auto-generated from name" onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('slug', e.currentTarget.value)} />
                {fieldError(errors, 'slug') && <span className="field-error" role="alert">{fieldError(errors, 'slug')}</span>}
              </label>
              <label className="form-field-full">
                <span>Description * (min 12 characters)</span>
                <textarea value={form.description} rows={4} maxLength={10000} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('description', e.currentTarget.value)} aria-invalid={Boolean(fieldError(errors, 'description'))} />
                {fieldError(errors, 'description') && <span className="field-error" role="alert">{fieldError(errors, 'description')}</span>}
              </label>
              <label>
                <span>Category *</span>
                <select value={form.categoryId} onChange={(e) => set('categoryId', e.currentTarget.value)} aria-invalid={Boolean(fieldError(errors, 'categoryId'))}>
                  <option value="">Select a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {fieldError(errors, 'categoryId') && <span className="field-error" role="alert">{fieldError(errors, 'categoryId')}</span>}
              </label>
              <label>
                <span>Status</span>
                <select value={form.status} onChange={(e) => set('status', e.currentTarget.value)}>
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
            </div>
          </section>

          <section className="workspace-card" aria-labelledby="ws-media">
            <h2 id="ws-media">2 · Product media</h2>
            <p className="muted-copy workspace-card__hint">
              Signed direct-to-Cloudinary uploads — the same workflow as the product editor. Media needs a product record
              first, so this unlocks as soon as the draft is created.
            </p>
            {phase === 'complete' && createdId ? (
              <>
                <ProductMediaManager productId={createdId} editable />
                <button type="button" className="text-button" onClick={() => createdId && refreshMedia(createdId)}>
                  Refresh publish checklist from gallery
                </button>
              </>
            ) : (
              <div className="media-dropzone" role="note" aria-label="Media unlocks after draft creation">
                <p><strong>Upload product images</strong></p>
                <p className="muted-copy">Save a draft first — then drag &amp; drop or browse JPG · PNG · WebP here.</p>
              </div>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="ws-variant">
            <h2 id="ws-variant">3 · Variants &amp; pricing</h2>
            <p className="muted-copy workspace-card__hint">
              The backend requires every variant to carry at least one attribute value, a SKU (min 3 chars) and a
              non-negative price. The first variant unlocks after the draft is created.
            </p>
            {phase === 'complete' && createdId ? (
              <div className="form-grid">
                <label>
                  <span>SKU *</span>
                  <input type="text" value={variant.sku} minLength={3} maxLength={64} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV('sku', e.currentTarget.value)} />
                  {variantErrors.sku && <span className="field-error" role="alert">{variantErrors.sku}</span>}
                </label>
                <label>
                  <span>Variant name</span>
                  <input type="text" value={variant.name} maxLength={200} placeholder="Defaults to SKU" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV('name', e.currentTarget.value)} />
                </label>
                <label>
                  <span>Price (KES) *</span>
                  <input type="number" value={variant.price} min="0" step="0.01" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV('price', e.currentTarget.value)} />
                  {variantErrors.price && <span className="field-error" role="alert">{variantErrors.price}</span>}
                </label>
                <label>
                  <span>Compare-at price (KES)</span>
                  <input type="number" value={variant.compareAtPrice} min="0" step="0.01" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV('compareAtPrice', e.currentTarget.value)} />
                </label>
                <label>
                  <span>Attribute *</span>
                  <select value={variant.attributeId} onChange={(e) => setV('attributeId', e.currentTarget.value)}>
                    <option value="">Select attribute</option>
                    {attributes.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {variantErrors.attributeId && <span className="field-error" role="alert">{variantErrors.attributeId}</span>}
                </label>
                <label>
                  <span>Attribute value *</span>
                  <input type="text" value={variant.attributeValue} maxLength={120} placeholder="e.g. Large" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setV('attributeValue', e.currentTarget.value)} />
                  {variantErrors.attributeValue && <span className="field-error" role="alert">{variantErrors.attributeValue}</span>}
                </label>
                <div className="form-actions">
                  <button type="button" className="button button--secondary" disabled={saving} onClick={addFirstVariant}>
                    <JBIcon name="plus" size={16} /> Add variant
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted-copy" role="note">Create the draft above to add the first purchasable variant.</p>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="ws-taxonomy">
            <h2 id="ws-taxonomy">4 · Categories &amp; collections</h2>
            <p className="muted-copy workspace-card__hint">
              Category is chosen in Basic information and required before publishing. Collection membership is managed
              from the Collections admin area — no product-collection assignment endpoint exists yet.
            </p>
            <ul className="pill-nav" aria-label="Available collections">
              {collections.slice(0, 8).map((c) => (
                <li key={c.id}><span>{c.name}</span></li>
              ))}
            </ul>
          </section>

          <section className="workspace-card" aria-labelledby="ws-attrs">
            <h2 id="ws-attrs">5 · Attributes</h2>
            <p className="muted-copy workspace-card__hint">
              Dynamic attribute system — variant values attach per variant (Fashion: Size/Color/Material · Footwear:
              Shoe Size/Color/Material · Kitchen: Capacity/Power/Material/Color). Nothing is hard-coded per category.
            </p>
            <ul className="pill-nav" aria-label="Available attributes">
              {attributes.map((a) => (
                <li key={a.id}><span>{a.name}</span></li>
              ))}
            </ul>
          </section>
        </div>

        <div className="product-workspace__side">
          <section className="workspace-card" aria-labelledby="ws-seo">
            <h2 id="ws-seo">6 · SEO</h2>
            <dl className="media-meta">
              <dt>Slug</dt>
              <dd>/products/{effectiveSlug || '…'}</dd>
              <dt>Title</dt>
              <dd>{form.name ? `${form.name} | JB Mercantile` : '—'}</dd>
              <dt>Description</dt>
              <dd>{form.description ? form.description.slice(0, 140) : '—'}</dd>
            </dl>
          </section>

          <section className="workspace-card" aria-labelledby="ws-review">
            <h2 id="ws-review">7 · Review &amp; publish</h2>
            <ul className="validation-list">
              {checklist.map((c) => (
                <li key={c.key} className={c.ok ? 'is-ok' : 'is-missing'}>
                  <JBIcon name={c.ok ? 'check' : 'close'} size={14} />
                  <span>{c.label}{c.hint ? ` — ${c.hint}` : ''}</span>
                </li>
              ))}
            </ul>
            {phase === 'complete' && createdId ? (
              <div className="form-actions">
                <button type="button" className="button" disabled={saving || variantCount === 0 || imageCount === 0} onClick={publishNow}>
                  Publish product
                </button>
                <Link href={`/admin/products/${createdId}`} className="button button--secondary">Open product editor</Link>
              </div>
            ) : (
              <p className="muted-copy">Save a draft to unlock media, variants, and publishing.</p>
            )}
          </section>
        </div>
      </div>

      <div className="sticky-actions">
        <div className="cta-row" style={{ marginTop: 0 }}>
          <button type="button" className="button button--secondary" disabled={saving || phase === 'complete'} onClick={() => createDraft(false)}>
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button type="button" className="button" disabled={saving || phase === 'complete'} onClick={() => createDraft(false)}>
            {saving ? 'Creating…' : 'Create Product'}
          </button>
        </div>
      </div>
    </div>
  );
}
