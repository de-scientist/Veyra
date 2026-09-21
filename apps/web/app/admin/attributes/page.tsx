'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  createAdminAttribute,
  createAdminAttributeValue,
  deleteAdminAttribute,
  deleteAdminAttributeValue,
  getAdminAttributes,
  updateAdminAttribute,
  type AdminAttribute,
} from '../../../lib/admin-api';
import { AdminEmptyState } from '../../../components/admin';
import { useConfirm } from '../../../components/ConfirmDialog';
import { useToast } from '../../../components/Toast';

export default function AdminAttributesPage() {
  const { notify } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [attributes, setAttributes] = useState<AdminAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAttributes(await getAdminAttributes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attributes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Attribute name must be at least 2 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (editingId) {
        await updateAdminAttribute(editingId, { name: name.trim() });
        notify('success', 'Attribute renamed. Its slug is unchanged.');
      } else {
        await createAdminAttribute({ name: name.trim() });
        notify('success', 'Attribute created.');
      }
      setName('');
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const handleAddValue = async (attributeId: string) => {
    const value = (valueDrafts[attributeId] ?? '').trim();
    if (!value) return;
    try {
      await createAdminAttributeValue(attributeId, value);
      setValueDrafts((prev) => ({ ...prev, [attributeId]: '' }));
      notify('success', 'Value added.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add value');
    }
  };

  const handleDeleteValue = async (attributeName: string, valueId: string, value: string) => {
    const confirmed = await confirm({
      title: `Remove “${value}” from ${attributeName}?`,
      description: 'Values used by product variants cannot be removed.',
      confirmLabel: 'Remove value',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    try {
      await deleteAdminAttributeValue(valueId);
      notify('success', 'Value removed.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const handleDeleteAttribute = async (attribute: AdminAttribute) => {
    const confirmed = await confirm({
      title: `Delete “${attribute.name}”?`,
      description: 'Attributes used by product variants cannot be deleted. Unused values are removed with it.',
      confirmLabel: 'Delete attribute',
      variant: 'destructive',
      onConfirm: () => undefined,
    });
    if (!confirmed) return;
    try {
      await deleteAdminAttribute(attribute.id);
      notify('success', 'Attribute deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  if (loading) return <div className="empty-state"><p>Loading attributes…</p></div>;

  return (
    <div className="account-page">
      {confirmDialog}
      <header className="account-page__header">
        <div>
          <h1>Attributes</h1>
          <p className="muted-copy">Variant facets for filters and specifications (Color, Size, Capacity…)</p>
        </div>
      </header>

      {error && <div className="inline-message" role="alert">{error}</div>}

      <section className="account-section">
        <h2>{editingId ? 'Rename attribute' : 'New attribute'}</h2>
        <form onSubmit={handleSubmit} className="account-form">
          <div className="form-grid">
            <label>
              <span>Name *</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Color" />
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Rename' : 'Create attribute'}</button>
            {editingId ? (
              <button type="button" className="text-button" onClick={() => { setEditingId(null); setName(''); }}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="account-section">
        <h2>All attributes ({attributes.length})</h2>
        {attributes.length === 0 ? (
          <AdminEmptyState title="No attributes" message="Attributes power variant selection, filters, and specifications." />
        ) : (
          <ul className="admin-card-list">
            {attributes.map((attribute) => (
              <li key={attribute.id} className="account-summary-card">
                <p>
                  <strong>{attribute.name}</strong> <span className="muted-copy">{attribute.slug} · {attribute.type}</span>
                </p>
                {attribute.values.length > 0 ? (
                  <ul className="chip-list" aria-label={`${attribute.name} values`}>
                    {attribute.values.map((value) => (
                      <li key={value.id} className="chip">
                        {value.value}
                        <button
                          type="button"
                          className="chip__remove"
                          aria-label={`Remove ${value.value} from ${attribute.name}`}
                          onClick={() => handleDeleteValue(attribute.name, value.id, value.value)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-copy">No values yet.</p>
                )}
                <div className="account-actions">
                  <form
                    onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
                      e.preventDefault();
                      handleAddValue(attribute.id);
                    }}
                    className="inline-form"
                  >
                    <input
                      type="text"
                      value={valueDrafts[attribute.id] ?? ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setValueDrafts((prev) => ({ ...prev, [attribute.id]: e.target.value }))
                      }
                      placeholder="New value…"
                      maxLength={120}
                      aria-label={`New value for ${attribute.name}`}
                    />
                    <button type="submit" className="button button--secondary button--small">Add value</button>
                  </form>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setEditingId(attribute.id);
                      setName(attribute.name);
                    }}
                  >
                    Rename
                  </button>
                  <button type="button" className="text-button text-button--danger" onClick={() => handleDeleteAttribute(attribute)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
