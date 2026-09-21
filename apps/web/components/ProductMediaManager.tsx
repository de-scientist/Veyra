'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createAdminProductImage,
  deleteAdminProductImage,
  getAdminProductImages,
  reorderAdminProductImages,
  replaceAdminProductImage,
  setPrimaryAdminProductImage,
  updateAdminProductImage,
  type AdminProductImage,
} from '../lib/admin-api';
import { cloudinaryDisplayUrl } from '../lib/cloudinary-display';
import { uploadMedia, type UploadedMedia } from '../lib/media-upload';
import { JBIcon } from './JBIcons';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

type QueueStatus = 'queued' | 'uploading' | 'saving' | 'success' | 'error';

type QueueItem = {
  key: string;
  file: File;
  previewUrl: string;
  progress: number;
  status: QueueStatus;
  message: string | null;
};

const ACCEPT = 'image/jpeg,image/png,image/webp';
const UPLOAD_CONCURRENCY = 3;

function describeDimensions(image: AdminProductImage): string {
  if (image.width && image.height) return `${image.width}×${image.height}`;
  return 'dimensions unavailable';
}

/**
 * Product media manager for the admin product editor (Phase D).
 * Immediate persistence: each successful Cloudinary upload is saved as a
 * ProductImage right away; failures never masquerade as saved images.
 * Reordering uses explicit buttons (keyboard/touch friendly) — no
 * drag-and-drop-only interactions.
 */
export function ProductMediaManager({ productId, editable }: { productId: string; editable: boolean }) {
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [images, setImages] = useState<AdminProductImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [altEditingId, setAltEditingId] = useState<string | null>(null);
  const [altDraft, setAltDraft] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const activeUploads = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setImages(await getAdminProductImages(productId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load product images.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Revoke blob previews on unmount / removal to avoid memory leaks.
  useEffect(() => {
    const previews = queue.map((item) => item.previewUrl);
    return () => {
      for (const url of previews) URL.revokeObjectURL(url);
    };
  }, [queue]);

  const mutate = useCallback(
    async (label: string, work: () => Promise<AdminProductImage[]>) => {
      setBusy(true);
      try {
        setImages(await work());
        notify('success', label);
        await refresh();
      } catch (error) {
        notify('error', error instanceof Error ? error.message : `${label} failed.`);
      } finally {
        setBusy(false);
      }
    },
    [notify, refresh],
  );

  const persistUploaded = useCallback(
    async (uploaded: UploadedMedia): Promise<void> => {
      await createAdminProductImage(productId, {
        publicId: uploaded.publicId,
        secureUrl: uploaded.secureUrl,
        width: uploaded.width,
        height: uploaded.height,
        format: uploaded.format,
        bytes: uploaded.bytes,
        altText: undefined,
      });
    },
    [productId],
  );

  const queueRef = useRef<QueueItem[]>([]);
  queueRef.current = queue;
  const cycleRunning = useRef(false);

  const processQueue = useCallback(async () => {
    // Controlled concurrency: at most UPLOAD_CONCURRENCY parallel uploads.
    // A single pump cycle drains the queue; re-entrant calls are skipped
    // because the running cycle picks up newly queued items in `finally`.
    if (cycleRunning.current) return;
    cycleRunning.current = true;
    try {
      const pump = async (): Promise<void> => {
        if (activeUploads.current >= UPLOAD_CONCURRENCY) return;
        const next = queueRef.current.find((item) => item.status === 'queued');
        if (!next) return;
        activeUploads.current += 1;
        setQueue((current) => current.map((item) => (item.key === next.key ? { ...item, status: 'uploading' as QueueStatus } : item)));
        try {
          const uploaded = await uploadMedia('product', next.file, {
            onProgress: (fraction) => {
              setQueue((current) => current.map((item) => (item.key === next.key ? { ...item, progress: fraction } : item)));
            },
          });
          setQueue((current) => current.map((item) => (item.key === next.key ? { ...item, status: 'saving' as QueueStatus, progress: 1 } : item)));
          await persistUploaded(uploaded);
          setQueue((current) => current.map((item) => (item.key === next.key ? { ...item, status: 'success' as QueueStatus } : item)));
          await refresh();
        } catch (error) {
          // Successes already persisted stay saved; only this item is marked.
          setQueue((current) =>
            current.map((item) =>
              item.key === next.key
                ? { ...item, status: 'error' as QueueStatus, message: error instanceof Error ? error.message : 'Upload failed.' }
                : item,
            ),
          );
        } finally {
          activeUploads.current -= 1;
          await pump();
        }
      };
      await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, () => pump()));
    } finally {
      cycleRunning.current = false;
    }
  }, [persistUploaded, refresh]);

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const accepted = Array.from(files).filter((file) => ACCEPT.split(',').includes(file.type));
      const rejected = Array.from(files).length - accepted.length;
      if (rejected > 0) {
        notify('error', `${rejected} file(s) rejected: only JPEG, PNG, or WebP images are allowed.`);
      }
      if (accepted.length === 0) return;
      setQueue((current) => [
        ...current,
        ...accepted.map((file, index) => ({
          key: `${Date.now()}-${index}-${file.name}`,
          file,
          previewUrl: URL.createObjectURL(file),
          progress: 0,
          status: 'queued' as QueueStatus,
          message: null as string | null,
        })),
      ]);
    },
    [notify],
  );

  useEffect(() => {
    if (queue.some((item) => item.status === 'queued') && activeUploads.current < UPLOAD_CONCURRENCY) {
      processQueue();
    }
  }, [queue, processQueue]);

  const retryItem = useCallback((key: string) => {
    // Fresh signature per retry: uploadMedia re-authorizes every attempt.
    setQueue((current) => current.map((item) => (item.key === key ? { ...item, status: 'queued' as QueueStatus, progress: 0, message: null } : item)));
  }, []);

  const dismissItem = useCallback((key: string) => {
    setQueue((current) => {
      const target = current.find((item) => item.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.key !== key);
    });
  }, []);

  const handleMove = useCallback(
    (imageId: string, direction: -1 | 1 | 'first' | 'last') => {
      const ordered = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
      const index = ordered.findIndex((image) => image.id === imageId);
      if (index < 0) return;
      const next = [...ordered];
      if (direction === 'first') {
        const [item] = next.splice(index, 1);
        if (item) next.unshift(item);
      } else if (direction === 'last') {
        const [item] = next.splice(index, 1);
        if (item) next.push(item);
      } else {
        const swapWith = index + direction;
        if (swapWith < 0 || swapWith >= next.length) return;
        const current = next[index];
        const other = next[swapWith];
        if (!current || !other) return;
        next[index] = other;
        next[swapWith] = current;
      }
      mutate('Image order saved.', () => reorderAdminProductImages(productId, next.map((image) => image.id)));
    },
    [images, mutate, productId],
  );

  const handleDelete = useCallback(
    async (image: AdminProductImage) => {
      const confirmed = await confirm({
        title: 'Delete this product image?',
        description: image.isPrimary
          ? 'This is the primary image. It will be removed from Cloudinary and the next image will become primary.'
          : 'This image will be removed from the product and deleted from Cloudinary.',
        confirmLabel: 'Delete image',
        variant: 'destructive',
        onConfirm: () => undefined,
      });
      if (!confirmed) return;
      setBusy(true);
      try {
        const { images: remaining, providerCleanup } = await deleteAdminProductImage(productId, image.id);
        setImages(remaining);
        if (providerCleanup === 'failed') {
          notify('error', 'Image removed from the product, but Cloudinary cleanup failed. The asset may need manual removal.');
        } else {
          notify('success', 'Product image deleted.');
        }
        await refresh();
      } catch (error) {
        notify('error', error instanceof Error ? error.message : 'Delete failed.');
      } finally {
        setBusy(false);
      }
    },
    [confirm, notify, productId, refresh],
  );

  const handleReplaceFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file || !replaceTargetId) return;
      if (!ACCEPT.split(',').includes(file.type)) {
        notify('error', 'Only JPEG, PNG, or WebP images are allowed.');
        return;
      }
      setBusy(true);
      try {
        const uploaded = await uploadMedia('product', file);
        const image = await replaceAdminProductImage(productId, replaceTargetId, {
          publicId: uploaded.publicId,
          secureUrl: uploaded.secureUrl,
          width: uploaded.width,
          height: uploaded.height,
          format: uploaded.format,
          bytes: uploaded.bytes,
        });
        if (image.providerCleanup === 'failed') {
          notify('error', 'Image replaced, but the old Cloudinary asset could not be removed.');
        } else {
          notify('success', 'Product image replaced.');
        }
        await refresh();
      } catch (error) {
        // Old image untouched: replacement only commits after a good upload.
        notify('error', error instanceof Error ? error.message : 'Replacement failed. The existing image is unchanged.');
      } finally {
        setBusy(false);
        setReplaceTargetId(null);
      }
    },
    [notify, productId, refresh, replaceTargetId],
  );

  const handleSaveAlt = useCallback(
    async (imageId: string) => {
      const value = altDraft.trim();
      if (value.length > 200) {
        notify('error', 'Alt text must be 200 characters or fewer.');
        return;
      }
      setBusy(true);
      try {
        const updated = await updateAdminProductImage(productId, imageId, { altText: value || null });
        setImages((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        notify('success', 'Alt text updated.');
      } catch (error) {
        notify('error', error instanceof Error ? error.message : 'Alt text update failed.');
      } finally {
        setBusy(false);
        setAltEditingId(null);
      }
    },
    [altDraft, notify, productId],
  );

  if (loading) {
    return (
      <div className="media-manager" role="status" aria-label="Loading product images">
        <div className="loading-skeleton" aria-hidden="true" />
        <p className="muted-copy">Loading product images…</p>
      </div>
    );
  }

  return (
    <div className="media-manager">
      {confirmDialog}
      {loadError ? (
        <div className="inline-message" role="alert">
          {loadError}{' '}
          <button type="button" className="text-button" onClick={() => { setLoading(true); setLoadError(null); refresh(); }}>
            Retry
          </button>
        </div>
      ) : null}

      {!editable ? (
        <p className="muted-copy" role="note">
          This product is archived — its images are read-only.
        </p>
      ) : (
        <div
          className={`media-dropzone${dragOver ? ' media-dropzone--active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            addFiles(event.dataTransfer.files);
          }}
        >
          <p>
            <strong>Drag images here</strong> or{' '}
            <button type="button" className="text-button" onClick={() => fileInputRef.current?.click()}>
              choose files
            </button>
          </p>
          <p className="muted-copy">JPEG, PNG, or WebP. Use clear, well-lit product photos.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="visually-hidden"
            aria-label="Choose product images to upload"
            onChange={(event) => {
              if (event.target.files) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      )}

      {queue.length > 0 ? (
        <ul className="media-queue" aria-label="Upload progress" aria-live="polite">
          {queue.map((item) => (
            <li key={item.key} className="media-queue__item">
              {/* next/image cannot handle local blob: preview URLs; plain img is correct here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.previewUrl} alt="" className="media-queue__thumb" />
              <div className="media-queue__body">
                <span className="media-queue__name">{item.file.name}</span>
                {item.status === 'uploading' || item.status === 'saving' ? (
                  <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)} aria-label={`Uploading ${item.file.name}`} className="media-progress">
                    <span className="media-progress__bar" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                ) : null}
                {item.status === 'success' ? <span className="media-status media-status--success">Saved</span> : null}
                {item.status === 'error' ? (
                  <span className="media-status media-status--error" role="alert">
                    {item.message ?? 'Upload failed.'}{' '}
                    <button type="button" className="text-button" onClick={() => retryItem(item.key)}>
                      Retry
                    </button>
                  </span>
                ) : null}
              </div>
              {(item.status === 'success' || item.status === 'error') && (
                <button type="button" className="text-button" onClick={() => dismissItem(item.key)} aria-label={`Dismiss ${item.file.name}`}>
                  <JBIcon name="close" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {images.length === 0 ? (
        <div className="empty-state">
          <h3>No product images yet.</h3>
          <p className="muted-copy">Add high-quality product photos to improve the catalogue experience.</p>
        </div>
      ) : (
        <ul className="media-grid" aria-label="Product images">
          {[...images]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image, position) => {
              const displayUrl = cloudinaryDisplayUrl(image.secureUrl ?? image.url, 'thumbnail') ?? image.url;
              const detailUrl = cloudinaryDisplayUrl(image.secureUrl ?? image.url, 'detail') ?? image.url;
              return (
                <li key={image.id} className={`media-card${image.isPrimary ? ' media-card--primary' : ''}`}>
                  <div className="media-card__visual">
                    <button
                      type="button"
                      className="media-card__preview-toggle"
                      aria-expanded={expandedId === image.id}
                      aria-label={`${expandedId === image.id ? 'Collapse' : 'Expand'} preview for image ${position + 1}`}
                      onClick={() => setExpandedId((current) => (current === image.id ? null : image.id))}
                    >
                      <Image
                        src={displayUrl}
                        alt={image.altText || `Product image ${position + 1}`}
                        width={400}
                        height={300}
                        className="media-card__image"
                        unoptimized
                        onError={(event) => {
                          (event.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </button>
                    {image.isPrimary ? (
                      <span className="media-badge">
                        <JBIcon name="check" size={14} /> PRIMARY
                      </span>
                    ) : null}
                    <span className="media-position" aria-label={`Position ${position + 1}`}>
                      {position + 1}
                    </span>
                  </div>
                  {expandedId === image.id ? (
                    <div className="media-card__detail">
                      <Image src={detailUrl} alt={image.altText || `Product image ${position + 1} enlarged`} width={800} height={600} className="media-card__large" unoptimized />
                      <dl className="media-meta">
                        <dt>Dimensions</dt>
                        <dd>{describeDimensions(image)}</dd>
                        <dt>Format</dt>
                        <dd>{image.format ?? 'unknown'}</dd>
                        <dt>Alt text</dt>
                        <dd>{image.altText || '—'}</dd>
                      </dl>
                    </div>
                  ) : null}
                  <p className="media-card__alt">{image.altText || <span className="muted-copy">No alt text</span>}</p>
                  {editable ? (
                    <div className="media-card__actions">
                      {!image.isPrimary ? (
                        <button
                          type="button"
                          className="button button--secondary button--small"
                          disabled={busy}
                          onClick={() => mutate('Primary image changed.', () => setPrimaryAdminProductImage(productId, image.id))}
                        >
                          <JBIcon name="check" size={14} /> Set primary
                        </button>
                      ) : null}
                      <div className="media-card__reorder" role="group" aria-label={`Reorder image ${position + 1}`}>
                        <button type="button" className="text-button" disabled={busy || position === 0} onClick={() => handleMove(image.id, -1)} aria-label={`Move image ${position + 1} earlier`}>
                          ← Prev
                        </button>
                        <button type="button" className="text-button" disabled={busy || position === images.length - 1} onClick={() => handleMove(image.id, 1)} aria-label={`Move image ${position + 1} later`}>
                          Next →
                        </button>
                      </div>
                      {altEditingId === image.id ? (
                        <form
                          className="media-alt-form"
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleSaveAlt(image.id);
                          }}
                        >
                          <label>
                            <span className="visually-hidden">Alt text for image {position + 1}</span>
                            <input
                              type="text"
                              value={altDraft}
                              maxLength={200}
                              onChange={(event) => setAltDraft(event.target.value)}
                              placeholder="Blue 1.5L countertop blender"
                            />
                          </label>
                          <button type="submit" className="button button--secondary button--small" disabled={busy}>
                            Save
                          </button>
                          <button type="button" className="text-button" onClick={() => setAltEditingId(null)}>
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => {
                            setAltDraft(image.altText ?? '');
                            setAltEditingId(image.id);
                          }}
                        >
                          Edit alt text
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => {
                          setReplaceTargetId(image.id);
                          replaceInputRef.current?.click();
                        }}
                      >
                        <JBIcon name="refresh" size={14} /> Replace
                      </button>
                      <button type="button" className="text-button text-button--danger" disabled={busy} onClick={() => handleDelete(image)}>
                        <JBIcon name="trash" size={14} /> Delete
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
        </ul>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        aria-label="Choose a replacement image"
        onChange={(event) => {
          if (event.target.files) handleReplaceFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
