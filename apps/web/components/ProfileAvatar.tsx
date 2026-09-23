'use client';

import { useEffect, useRef, useState } from 'react';

import { removeProfileAvatar, setProfileAvatar, type AccountProfile } from '../lib/shopping-api';
import { uploadMedia } from '../lib/media-upload';
import { notifySessionUpdated } from '../lib/session';
import { JBIcon } from './JBIcons';
import { UserAvatar } from './UserAvatar';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

const ACCEPT = 'image/jpeg,image/png,image/webp';
// Mirrors the server profile policy (MEDIA_POLICY.profile.maxBytes = 5MB).
// Authoritative enforcement stays server-side (sign-upload pre-check +
// normalizeUploadResult at finalize); this is immediate UX feedback only.
const MAX_BYTES = 5_000_000;

type UploadState = { status: 'idle' | 'uploading'; progress: number; message: string | null };

/**
 * Profile avatar manager (Phase F): preview → authorize → direct upload →
 * finalize → navbar sync. Replace reuses the same flow; remove clears the
 * avatar server-side (provider asset cleaned when possible).
 */
export function ProfileAvatar({
  profile,
  onChanged,
}: {
  profile: AccountProfile;
  onChanged: (profile: AccountProfile) => void;
}) {
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [upload, setUpload] = useState<UploadState>({ status: 'idle', progress: 0, message: null });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFiles = async (files: FileList | File[] | null) => {
    const file = files ? Array.from(files)[0] : undefined;
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      notify('error', 'Only JPEG, PNG, or WebP images are allowed.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      notify('error', 'That image is too large. Please choose a photo up to 5MB.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUpload({ status: 'uploading', progress: 0, message: null });
    setBusy(true);
    try {
      // Fresh signature per attempt; the old avatar stays live until the
      // new one finalizes successfully.
      const uploaded = await uploadMedia('profile', file, {
        onProgress: (fraction) => setUpload({ status: 'uploading', progress: fraction, message: null }),
      });
      const updated = await setProfileAvatar({
        publicId: uploaded.publicId,
        secureUrl: uploaded.secureUrl,
        width: uploaded.width,
        height: uploaded.height,
        format: uploaded.format,
        bytes: uploaded.bytes,
      });
      if (updated.providerCleanup === 'failed') {
        notify('error', 'Avatar updated, but the previous image could not be removed from storage.');
      } else {
        notify('success', 'Profile photo updated.');
      }
      onChanged(updated);
      // Navbar avatar sync without a page refresh.
      notifySessionUpdated();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Photo upload failed. The previous photo is unchanged.');
    } finally {
      setBusy(false);
      setUpload({ status: 'idle', progress: 0, message: null });
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
    }
  };

  const handleRemove = async () => {
    if (!profile.avatarUrl) return;
    const confirmed = await confirm({
      title: 'Remove your profile photo?',
      description: 'Your photo will be removed and replaced with your initials.',
      confirmLabel: 'Remove photo',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      const updated = await removeProfileAvatar();
      if (updated.providerCleanup === 'failed') {
        notify('error', 'Photo removed, but the stored image could not be deleted. It may need manual removal.');
      } else {
        notify('success', 'Profile photo removed.');
      }
      onChanged(updated);
      notifySessionUpdated();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Could not remove photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-avatar">
      {confirmDialog}
      <div className="profile-avatar__current">
        {previewUrl ? (
          // Local blob preview: plain img is correct (next/image cannot load blob: URLs).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="New photo preview" className="profile-avatar__preview" />
        ) : (
          <UserAvatar user={profile} size="lg" />
        )}
        <div className="profile-avatar__meta">
          <strong>{profile.avatarUrl ? 'Your photo' : 'No photo yet'}</strong>
          <span className="muted-copy">
            {profile.avatarUrl ? 'Upload a new photo to replace it.' : 'Add a photo — otherwise your initials show.'}
          </span>
        </div>
      </div>

      {upload.status === 'uploading' ? (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(upload.progress * 100)}
          aria-label="Uploading profile photo"
          className="media-progress"
        >
          <span className="media-progress__bar" style={{ width: `${Math.round(upload.progress * 100)}%` }} />
        </div>
      ) : null}

      <div className="profile-avatar__actions">
        <button type="button" className="button button--secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
          <JBIcon name="user" size={16} /> {profile.avatarUrl ? 'Replace photo' : 'Upload photo'}
        </button>
        {profile.avatarUrl ? (
          <button type="button" className="text-button text-button--danger" disabled={busy} onClick={handleRemove}>
            <JBIcon name="trash" size={14} /> Remove
          </button>
        ) : null}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        aria-label="Choose a profile photo"
        disabled={busy}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
