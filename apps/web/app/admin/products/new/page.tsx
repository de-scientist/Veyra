'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ProductMediaManager } from '../../../../components/ProductMediaManager';
import { AdminStatusBadge } from '../../../../components/admin';
import { useConfirm } from '../../../../components/ConfirmDialog';
import { JBIcon } from '../../../../components/JBIcons';
import { useToast } from '../../../../components/Toast';
import { VariantManager } from '../../../../components/VariantManager';
import {
  createAdminProduct,
  getAdminAttributes,
  getAdminCategories,
  getAdminCollections,
  getAdminProduct,
  getProductCollections,
  saveProductDraft,
  setProductCollections,
  updateAdminProduct,
  type AdminAttribute,
  type AdminCategory,
  type AdminProductImage,
} from '../../../../lib/admin-api';
import { cloudinaryDisplayUrl } from '../../../../lib/cloudinary-display';
import {
  basicFieldsDirty,
  canPublishNow,
  checklistProgress,
  priceRange,
  productDraftSchema,
  publishChecklist,
  slugify,
  type BasicSnapshot,
} from '../../../../lib/product-publish';
import { formatKES } from '../../../../lib/variant-matrix';
import type { ApiErrorDetails } from '../../../../lib/admin-api';

type Phase = 'draft' | 'complete';

function fieldError(errors: Record<string, string>, key: string): string | null {
  return errors[key] ?? null;
}

const FIELD_IDS: Record<string, string> = {
  name: 'field-name',
  slug: 'field-slug',
  description: 'field-description',
  categoryId: 'field-category',
  status: 'field-status',
};

/**
 * Product creation workspace.
 * Backend reality: ProductImage rows require an existing productId, so the
 * flow is draft-first (obtain ID) → signed Cloudinary media → variants →
 * review/publish. No orphan temporaries, no second upload path. Publishing
 * is a status flip the UI gates on real readiness (variant + image); the
 * backend re-validates every write and audit-logs creation/updates.
 */
export default function NewAdminProductPage() {
  const router = useRouter();
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [phase, setPhase] = useState<Phase>('draft');
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [collections, setCollections] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [attributes, setAttributes] = useState<AdminAttribute[]>([]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<BasicSnapshot | null>(null);
  const [gallery, setGallery] = useState<AdminProductImage[]>([]);
  const [variantCount, setVariantCount] = useState(0);
  const [variantPrices, setVariantPrices] = useState<Array<number | null>>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [publishIssues, setPublishIssues] = useState<Array<{ field: string; code: string; message: string }>>([]);
  // Server-backed draft state (Objective C): canonical timestamp + save status.
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<{ status: 'idle' | 'saving' | 'saved' | 'error'; at: string | null; message: string | null }>({ status: 'idle', at: null, message: null });
  // Collection assignment (Objective B): local selection, explicit server save.
  const [assignedCollections, setAssignedCollections] = useState<string[]>([]);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [collectionsSaving, setCollectionsSaving] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);

  const [form, setForm] = useState({ name: '', slug: '', description: '', categoryId: '', status: 'DRAFT' });

  useEffect(() => {
    getAdminCategories().then(setCategories).catch(() => undefined);
    getAdminCollections().then(setCollections).catch(() => undefined);
    getAdminAttributes().then(setAttributes).catch(() => undefined);
  }, []);

  // Safe unsaved-changes warning for long editing sessions (browser-level;
  // in-app Cancel goes through the accessible confirm dialog instead).
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
  const imageCount = gallery.length;
  const checklist = publishChecklist({
    name: form.name,
    slug: effectiveSlug,
    categoryId: form.categoryId,
    description: form.description,
    variantCount,
    imageCount,
  });
  const progress = checklistProgress(checklist);
  const publishReady = canPublishNow(variantCount, imageCount);
  const postDraftDirty = basicFieldsDirty(snapshot, form);
  const prices = useMemo(() => priceRange(variantPrices), [variantPrices]);
  const primaryImage = useMemo(
    () => gallery.find((image) => image.isPrimary) ?? gallery[0] ?? null,
    [gallery],
  );
  const categoryName = categories.find((c) => c.id === form.categoryId)?.name ?? null;

  const basicValid = useMemo(
    () =>
      productDraftSchema.safeParse({
        ...form,
        slug: form.slug.trim() ? slugify(form.slug) : undefined,
      }).success,
    [form],
  );

  const sections = useMemo(
    () => [
      { id: 'ws-basic', label: 'Basic information', ok: basicValid },
      { id: 'ws-media', label: 'Product media', ok: imageCount > 0, detail: imageCount === 0 ? 'No images yet' : `${imageCount} image${imageCount === 1 ? '' : 's'}` },
      { id: 'ws-variant', label: 'Variants, SKUs & pricing', ok: variantCount > 0, detail: variantCount === 0 ? 'No variants yet' : `${variantCount} variant${variantCount === 1 ? '' : 's'}` },
      { id: 'ws-taxonomy', label: 'Categories & collections', ok: form.categoryId.length > 0 },
      { id: 'ws-review', label: 'Review & publish', ok: publishReady },
    ],
    [basicValid, imageCount, variantCount, form.categoryId, publishReady],
  );

  const set = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const focusField = (key: string) => {
    const id = FIELD_IDS[key];
    if (id) document.getElementById(id)?.focus({ preventScroll: false });
  };

  const createDraft = async (): Promise<string | null> => {
    setFormError(null);
    setPublishIssues([]);
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
        status: parsed.data.status,
      });
      const created = product as { id: string; slug: string; updatedAt: string };
      setCreatedId(created.id);
      setCreatedSlug(created.slug);
      setServerUpdatedAt(created.updatedAt);
      setSnapshot({
        name: parsed.data.name,
        slug: parsed.data.slug ?? '',
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        status: parsed.data.status,
      });
      setPhase('complete');
      setDirty(false);
      try {
        const assigned = await getProductCollections(created.id);
        setAssignedCollections(assigned.collections.map((c) => c.id));
        setSelectedCollections(assigned.collections.map((c) => c.id));
      } catch {
        // Collection panel shows its own error state; draft creation stands.
      }
      notify('success', 'Draft created. Add images and the first variant below.');
      return created.id;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not create product';
      setFormError(message);
      notify('error', message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveBasicChanges = async () => {
    if (!createdId) return;
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
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await updateAdminProduct(createdId, {
        name: parsed.data.name,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        status: parsed.data.status,
      });
      setSnapshot({
        name: parsed.data.name,
        slug: parsed.data.slug ?? '',
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        status: parsed.data.status,
      });
      setDirty(false);
      notify('success', 'Product information saved.');
    } catch (e) {
      const details = (e as Error & { details?: ApiErrorDetails })?.details;
      if (details?.issues?.length) {
        setPublishIssues(details.issues);
        setFormError('The server rejected this change. Review the issues below.');
        notify('error', 'The server rejected this change.');
      } else {
        const message = e instanceof Error ? e.message : 'Could not save changes';
        setFormError(message);
        notify('error', message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!dirty && !postDraftDirty) {
      router.push('/admin/products');
      return;
    }
    const confirmed = await confirm({
      title: 'Discard unsaved changes?',
      description: phase === 'complete'
        ? 'Your edits will be lost. The saved draft and its uploaded media stay intact.'
        : 'Your entered information will be lost. Nothing has been saved yet.',
      confirmLabel: 'Discard changes',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (confirmed) router.push('/admin/products');
  };

  const handleGalleryChanged = useCallback((images: AdminProductImage[]) => {
    // Gallery mutations auto-sync the checklist + preview (no manual refresh).
    setGallery(images);
  }, []);

  const refreshVariantState = async (productId: string) => {
    try {
      const detail = await getAdminProduct(productId);
      setVariantCount(detail.variants.length);
      const base = detail.basePrice === null || detail.basePrice === undefined ? null : Number(detail.basePrice);
      setVariantPrices(detail.variants.map((v) => (v.priceOverride === null || v.priceOverride === undefined ? base : Number(v.priceOverride))));
    } catch {
      // Checklist stays conservative; the matrix shows its own errors.
    }
  };

  const publishNow = async () => {
    if (!createdId) return;
    if (!publishReady) {
      notify('error', 'Add at least one variant and one image before publishing.');
      return;
    }
    setSaving(true);
    setPublishIssues([]);
    try {
      await updateAdminProduct(createdId, { status: 'ACTIVE' });
      notify('success', 'Product published.');
      router.push(`/admin/products/${createdId}`);
    } catch (e) {
      // Server-side readiness failures arrive structured (issues) — surfaced
      // inline so a UI bypass can never silently publish, nor fail silently.
      const details = (e as Error & { details?: ApiErrorDetails })?.details;
      if (details?.issues?.length) {
        setPublishIssues(details.issues);
        setFormError('Publishing was rejected by the server. Review the issues below.');
      } else {
        notify('error', e instanceof Error ? e.message : 'Publish failed');
      }
    } finally {
      setSaving(false);
    }
  };

  // Server-backed autosave (Objective C): debounced draft PATCH of basic
  // fields only — status can never change here, so autosave cannot publish.
  // Media/variants persist immediately through their own endpoints.
  const persistDraft = useCallback(async (announce: boolean) => {
    if (!createdId) return;
    const parsed = productDraftSchema.safeParse({
      name: formRef.current.name,
      description: formRef.current.description,
      categoryId: formRef.current.categoryId,
      status: formRef.current.status,
      slug: undefined,
    });
    if (!parsed.success) {
      if (announce) {
        const next: Record<string, string> = {};
        for (const issue of parsed.error.issues) next[String(issue.path[0] ?? 'form')] = issue.message;
        setErrors(next);
        setFormError('Fix the highlighted fields before saving.');
      }
      return;
    }
    setAutosaveState({ status: 'saving', at: null, message: null });
    try {
      const saved = await saveProductDraft(createdId, {
        name: parsed.data.name,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId || null,
        expectedUpdatedAt: serverUpdatedAtRef.current ?? undefined,
      });
      serverUpdatedAtRef.current = saved.updatedAt;
      setServerUpdatedAt(saved.updatedAt);
      setSnapshot({
        name: parsed.data.name,
        slug: snapshotRef.current?.slug ?? '',
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        status: snapshotRef.current?.status ?? 'DRAFT',
      });
      setDirty(false);
      setErrors({});
      setAutosaveState({ status: 'saved', at: new Date().toISOString(), message: null });
      if (announce) notify('success', 'Draft saved.');
    } catch (e) {
      const code = (e as Error & { code?: string })?.code;
      const details = (e as Error & { details?: ApiErrorDetails })?.details;
      if (code === 'DRAFT_CONFLICT' && details?.product) {
        // Stale write refused: adopt canonical server state instead of
        // overwriting newer data, and let staff re-apply their edit.
        const canonical = details.product as { name?: string; description?: string; categoryId?: string | null; updatedAt?: string };
        const nextForm = {
          name: typeof canonical.name === 'string' ? canonical.name : formRef.current.name,
          slug: formRef.current.slug,
          description: typeof canonical.description === 'string' ? canonical.description : formRef.current.description,
          categoryId: typeof canonical.categoryId === 'string' ? canonical.categoryId : formRef.current.categoryId,
          status: formRef.current.status,
        };
        setForm(nextForm);
        if (typeof canonical.updatedAt === 'string') {
          serverUpdatedAtRef.current = canonical.updatedAt;
          setServerUpdatedAt(canonical.updatedAt);
        }
        setSnapshot({ name: nextForm.name, slug: snapshotRef.current?.slug ?? '', description: nextForm.description, categoryId: nextForm.categoryId, status: nextForm.status });
        setAutosaveState({ status: 'error', at: null, message: 'Changed elsewhere — reloaded the latest version.' });
        notify('error', 'This draft changed elsewhere. Reloaded the latest version — please re-apply your edit.');
        return;
      }
      const message = e instanceof Error ? e.message : 'Draft save failed.';
      setAutosaveState({ status: 'error', at: null, message });
      if (announce) {
        setFormError(message);
        notify('error', message);
      }
    }
  }, [createdId, notify]);

  // Latest-state refs so the debounced saver never writes stale closures.
  const formRef = useRef(form);
  const serverUpdatedAtRef = useRef(serverUpdatedAt);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    formRef.current = form;
    serverUpdatedAtRef.current = serverUpdatedAt;
    snapshotRef.current = snapshot;
  });

  useEffect(() => {
    if (phase !== 'complete' || !createdId || saving) return;
    if (!basicFieldsDirty(snapshot, form)) return;
    const timer = setTimeout(() => {
      persistDraft(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [phase, createdId, saving, snapshot, form, persistDraft]);

  const toggleCollection = (collectionId: string) => {
    setSelectedCollections((prev) =>
      prev.includes(collectionId) ? prev.filter((id) => id !== collectionId) : [...prev, collectionId],
    );
  };

  const saveCollections = async () => {
    if (!createdId) return;
    setCollectionsError(null);
    setCollectionsSaving(true);
    try {
      const result = await setProductCollections(createdId, selectedCollections);
      const ids = result.collections.map((c) => c.id);
      setAssignedCollections(ids);
      setSelectedCollections(ids);
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

  return (
    <div className="account-page product-workspace">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <Link href="/admin/products" className="text-button">← Back to Products</Link>
          <h1 style={{ marginTop: '0.5rem' }}>Create Product</h1>
          <p className="muted-copy">
            Draft-first workspace: save a draft to unlock signed Cloudinary uploads and variants, then review and publish.
          </p>
        </div>
        <div className="account-page__actions">
          {phase === 'complete' && createdId ? (
            <>
              <AdminStatusBadge status={form.status} />
              <Link href={`/admin/products/${createdId}`} className="button button--secondary">Open product editor</Link>
              <button
                type="button"
                className="button"
                disabled={saving || !publishReady}
                onClick={publishNow}
                aria-busy={saving}
                title={!publishReady ? 'Add at least one variant and one image before publishing' : 'Publish product'}
              >
                {saving ? 'Publishing…' : 'Publish product'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button button--secondary" disabled={saving} onClick={handleCancel}>
                Cancel
              </button>
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={() => createDraft()}
                aria-busy={saving}
              >
                <JBIcon name="doc" size={16} /> {saving ? 'Saving…' : 'Save Draft'}
              </button>
            </>
          )}
        </div>
      </header>

      {formError && (
        <div className="error-message" role="alert">
          <strong>{formError}</strong>
          {Object.keys(errors).length > 0 && (
            <ul className="error-summary-list">
              {Object.entries(errors).map(([k, v]) => (
                <li key={k}>
                  {FIELD_IDS[k] ? (
                    <button type="button" className="text-button error-summary-link" onClick={() => focusField(k)}>
                      {v}
                    </button>
                  ) : (
                    v
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="product-workspace__layout">
        <div className="product-workspace__main">
          <section className="workspace-card" aria-labelledby="ws-basic" id="ws-basic">
            <h2 id="ws-basic-heading">1 · Basic information</h2>
            <div className="form-grid">
              <label htmlFor="field-name">
                <span>Product name *</span>
                <input
                  id="field-name"
                  type="text"
                  value={form.name}
                  maxLength={200}
                  autoComplete="off"
                  aria-invalid={Boolean(fieldError(errors, 'name'))}
                  aria-describedby={fieldError(errors, 'name') ? 'err-name' : undefined}
                  onChange={(e) => set('name', e.currentTarget.value)}
                />
                {fieldError(errors, 'name') && <span id="err-name" className="field-error" role="alert">{fieldError(errors, 'name')}</span>}
              </label>
              <label htmlFor="field-slug">
                <span>Slug {form.slug ? '' : `(auto: ${autoSlug || '—'})`}</span>
                <input id="field-slug" type="text" value={form.slug} maxLength={220} autoComplete="off" placeholder="auto-generated from name" onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('slug', e.currentTarget.value)} />
                {fieldError(errors, 'slug') && <span className="field-error" role="alert">{fieldError(errors, 'slug')}</span>}
              </label>
              <label htmlFor="field-description" className="form-field-full">
                <span>Description * (min 12 characters)</span>
                <textarea id="field-description" value={form.description} rows={4} maxLength={10000} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => set('description', e.currentTarget.value)} aria-invalid={Boolean(fieldError(errors, 'description'))} />
                {fieldError(errors, 'description') && <span className="field-error" role="alert">{fieldError(errors, 'description')}</span>}
              </label>
              <label htmlFor="field-category">
                <span>Category *</span>
                <select id="field-category" value={form.categoryId} onChange={(e) => set('categoryId', e.currentTarget.value)} aria-invalid={Boolean(fieldError(errors, 'categoryId'))}>
                  <option value="">Select a category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {fieldError(errors, 'categoryId') && <span className="field-error" role="alert">{fieldError(errors, 'categoryId')}</span>}
              </label>
              <label htmlFor="field-status">
                <span>Status</span>
                <select id="field-status" value={form.status} onChange={(e) => set('status', e.currentTarget.value)}>
                  <option value="DRAFT">Draft — not purchasable</option>
                  {/* ACTIVE is intentionally absent here: publishing is a gated
                      transition after variants + media exist (see Review). The
                      backend rejects direct-ACTIVE creation. */}
                  <option value="ARCHIVED">Archived — hidden from storefront</option>
                </select>
              </label>
            </div>
            {phase === 'complete' && createdId ? (
              <div className="form-actions">
                <button type="button" className="button button--secondary" disabled={saving || !postDraftDirty} onClick={saveBasicChanges} aria-busy={saving} title={!postDraftDirty ? 'No unsaved changes' : 'Save information changes'}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
                <span className="muted-copy" role="status" aria-live="polite">
                  {autosaveState.status === 'saving'
                    ? 'Autosaving draft…'
                    : autosaveState.status === 'error'
                      ? `Autosave failed: ${autosaveState.message ?? 'will retry on next edit'}`
                      : autosaveState.status === 'saved' && autosaveState.at
                        ? `Draft saved ${new Date(autosaveState.at).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
                        : postDraftDirty
                          ? 'Unsaved changes'
                          : 'All changes saved.'}
                </span>
                {autosaveState.status === 'error' ? (
                  <button type="button" className="text-button" onClick={() => persistDraft(true)}>
                    Retry now
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="workspace-card" aria-labelledby="ws-media-heading" id="ws-media">
            <h2 id="ws-media-heading">2 · Product media</h2>
            <p className="muted-copy workspace-card__hint">
              Signed direct-to-Cloudinary uploads — the same workflow as the product editor. Media needs a product record
              first, so this unlocks as soon as the draft is created.
            </p>
            {phase === 'complete' && createdId ? (
              <ProductMediaManager productId={createdId} editable onChanged={handleGalleryChanged} />
            ) : (
              <div className="media-dropzone" role="note" aria-label="Media unlocks after draft creation">
                <p><strong>Upload product images</strong></p>
                <p className="muted-copy">Save a draft first — then drag &amp; drop or browse JPG · PNG · WebP here.</p>
              </div>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="ws-variant-heading" id="ws-variant">
            <h2 id="ws-variant-heading">3 · Variants, SKUs &amp; pricing</h2>
            <p className="muted-copy workspace-card__hint">
              Select variant options (e.g. Color × Size) to preview server-generated SKUs, then set per-variant prices
              and stock. Existing combinations are never duplicated. Variant creation starts each variant at zero on hand;
              stock up from <Link href="/admin/inventory">Inventory</Link> afterwards.
            </p>
            {phase === 'complete' && createdId ? (
              <VariantManager
                productId={createdId}
                productName={form.name || 'New product'}
                categoryId={form.categoryId || null}
                basePrice={null}
                categories={categories}
                attributes={attributes}
                existingVariants={[]}
                onChanged={() => refreshVariantState(createdId)}
              />
            ) : (
              <p className="muted-copy" role="note">Create the draft above to configure variants with live SKU preview.</p>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="ws-taxonomy-heading" id="ws-taxonomy">
            <h2 id="ws-taxonomy-heading">4 · Categories &amp; collections</h2>
            <p className="muted-copy workspace-card__hint">
              Category is chosen in Basic information and required before publishing. Collections attach after the
              draft exists and persist through the assignment API.
            </p>
            {phase === 'complete' && createdId ? (
              <>
                {collections.length === 0 ? (
                  <p className="muted-copy" role="note">No collections available yet.</p>
                ) : (
                  <fieldset className="workspace-fieldset">
                    <legend>Collections</legend>
                    {collections.slice(0, 20).map((c) => (
                      <label key={c.id} className="facet-option" htmlFor={`collection-${c.id}`}>
                        <input
                          id={`collection-${c.id}`}
                          type="checkbox"
                          checked={selectedCollections.includes(c.id)}
                          onChange={() => toggleCollection(c.id)}
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
                  {!collectionsDirty ? <span className="muted-copy">Assignments saved.</span> : null}
                </div>
              </>
            ) : (
              <p className="muted-copy" role="note">Save a draft first — collection assignment unlocks with the product record.</p>
            )}
            <div className="form-actions">
              <Link href="/admin/collections" className="button button--secondary">Manage Collections</Link>
            </div>
          </section>

          <section className="workspace-card" aria-labelledby="ws-attrs-heading" id="ws-attrs">
            <h2 id="ws-attrs-heading">5 · Attributes</h2>
            <p className="muted-copy workspace-card__hint">
              Dynamic attribute system — variant values attach per variant (Fashion: Size/Color/Material · Footwear:
              Shoe Size/Color/Material · Kitchen: Capacity/Power/Material/Color). Nothing is hard-coded per category.
            </p>
            {attributes.length === 0 ? (
              <p className="muted-copy" role="note">No attributes configured yet.</p>
            ) : (
              <ul className="pill-nav" aria-label="Available attributes">
                {attributes.map((a) => (
                  <li key={a.id}><span>{a.name}</span></li>
                ))}
              </ul>
            )}
            <div className="form-actions">
              <Link href="/admin/attributes" className="button button--secondary">Manage Attributes</Link>
            </div>
          </section>
        </div>

        <div className="product-workspace__side">
          <section className="workspace-card" aria-labelledby="ws-progress-heading">
            <h2 id="ws-progress-heading">Setup progress</h2>
            <p className="muted-copy" role="status">{progress.done} of {progress.total} sections complete</p>
            <ul className="workspace-progress">
              {sections.map((section) => (
                <li key={section.id} className={section.ok ? 'is-ok' : 'is-missing'}>
                  <JBIcon name={section.ok ? 'check' : 'close'} size={14} />
                  <a href={`#${section.id}`}>{section.label}</a>
                  {section.detail ? <span className="muted-copy"> — {section.detail}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="workspace-card" aria-labelledby="ws-preview-heading">
            <h2 id="ws-preview-heading">Storefront preview</h2>
            {primaryImage || form.name ? (
              <div className="workspace-preview">
                {primaryImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cloudinaryDisplayUrl(primaryImage.secureUrl ?? primaryImage.url, 'thumbnail') ?? primaryImage.url}
                    alt=""
                    className="workspace-preview__image"
                  />
                ) : (
                  <div className="workspace-preview__placeholder" aria-hidden="true">No image yet</div>
                )}
                <p className="eyebrow">{categoryName ?? 'Uncategorized'}</p>
                <p className="workspace-preview__name">{form.name || 'Untitled product'}</p>
                <p className="workspace-preview__price">
                  {prices ? (prices.min === prices.max ? formatKES(prices.min) : `${formatKES(prices.min)} – ${formatKES(prices.max)}`) : 'Price set per variant'}
                </p>
                <p className="muted-copy">/products/{createdSlug ?? effectiveSlug ?? '…'}</p>
              </div>
            ) : (
              <p className="muted-copy">Add a name and images to see how this product will appear.</p>
            )}
          </section>

          <section className="workspace-card" aria-labelledby="ws-seo-heading">
            <h2 id="ws-seo-heading">6 · SEO</h2>
            <dl className="media-meta">
              <dt>Slug</dt>
              <dd>/products/{createdSlug ?? effectiveSlug ?? '…'}</dd>
              <dt>Title</dt>
              <dd>{form.name ? `${form.name} | JB Mercantile` : '—'}</dd>
              <dt>Description</dt>
              <dd>{form.description ? form.description.slice(0, 140) : '—'}</dd>
            </dl>
            <p className="muted-copy workspace-card__hint">SEO is derived from the product name and description — the catalogue model has no separate SEO fields.</p>
          </section>

          <section className="workspace-card" aria-labelledby="ws-review-heading" id="ws-review">
            <h2 id="ws-review-heading">7 · Review &amp; publish</h2>
            <ul className="validation-list">
              {checklist.map((c) => (
                <li key={c.key} className={c.ok ? 'is-ok' : 'is-missing'}>
                  <JBIcon name={c.ok ? 'check' : 'close'} size={14} />
                  <span>{c.label}{c.hint ? ` — ${c.hint}` : ''}</span>
                </li>
              ))}
            </ul>
            {publishIssues.length > 0 ? (
              <div className="error-message" role="alert">
                <strong>Server readiness issues</strong>
                <ul className="error-summary-list">
                  {publishIssues.map((issue) => (
                    <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {phase === 'complete' && createdId ? (
              <div className="form-actions">
                <button type="button" className="button" disabled={saving || !publishReady} onClick={publishNow} title={!publishReady ? 'Add at least one variant and one image before publishing' : 'Publish product'}>
                  Publish product
                </button>
                <Link href={`/admin/products/${createdId}`} className="button button--secondary">Open product editor</Link>
                {createdSlug ? <Link href={`/products/${createdSlug}`} className="button button--secondary">View storefront</Link> : null}
              </div>
            ) : (
              <p className="muted-copy">Save a draft to unlock media, variants, and publishing.</p>
            )}
          </section>
        </div>
      </div>

      <div className="sticky-actions">
        <div className="cta-row" style={{ marginTop: 0 }}>
          {phase === 'complete' && createdId ? (
            <>
              <Link href="/admin/products" className="button button--secondary">Back to Products</Link>
              <button type="button" className="button" disabled={saving || !publishReady} onClick={publishNow} title={!publishReady ? 'Add at least one variant and one image before publishing' : 'Publish product'}>
                {saving ? 'Publishing…' : 'Publish product'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button button--secondary" disabled={saving} onClick={handleCancel}>
                Cancel
              </button>
              <button type="button" className="button" disabled={saving} onClick={() => createDraft()} aria-busy={saving}>
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
