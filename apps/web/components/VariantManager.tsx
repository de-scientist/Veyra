'use client';

/**
 * VariantManager — admin variant configuration, server-authoritative SKU
 * preview, variant matrix, and per-variant price/stock editing (Phase 3).
 *
 * No SKU logic lives here: every SKU is obtained from the Phase 2
 * `dryRun` preview endpoint (Phase 1 generator remains the single source
 * of truth). The backend is authoritative for validation, idempotency,
 * uniqueness and transactions; this component stages inputs, debounces
 * previews, and batches writes (generate → batch price PATCH → batch
 * restock) instead of issuing one request per variant.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  adjustVariant,
  batchUpdateVariants,
  generateMissingBarcodes,
  generateProductVariants,
  generateVariantBarcode,
  restockVariantsBatch,
  updateAdminVariant,
  type AdminAttribute,
  type AdminCategory,
  type AdminProductDetailVariant,
  type VariantGenerationResult,
} from '../lib/admin-api';
import {
  IDENTITY_TOKENS,
  buildAllowList,
  distributeUnallocatedStock,
  existingVariantRows,
  formatKES,
  formatStock,
  mergePreviewRows,
  requiredDimensionTokens,
  summarizeAllocation,
  summarizeSelection,
  validatePriceInput,
  validatePricePair,
  validateStockInput,
  type MatrixPair,
  type MatrixRow,
  type StockStrategy,
} from '../lib/variant-matrix';
import { AdminStatusBadge, ConfirmAction } from './admin';
import { useConfirm } from './ConfirmDialog';
import { JBIcon } from './JBIcons';
import { useToast } from './Toast';

const PREVIEW_DEBOUNCE_MS = 500;
const MAX_VARIANTS_PER_OPERATION = 300;

/**
 * Backend validation codes mapped to admin-actionable guidance. The backend
 * message is always preserved — the hint only adds the fix.
 */
function explainPreviewFailure(error: unknown): string {
  const message = error instanceof Error ? error.message : 'SKU preview failed.';
  const code = (error as Error & { code?: string })?.code;
  if (code === 'MISSING_CATEGORY_CODE') {
    return `${message} Fix: give the category a dictionary code (Catalogue → Categories → Edit, SKU code field), or move the product to a coded category.`;
  }
  if (code === 'MISSING_SKU_COMPONENT') {
    return `${message} Fix: enter a brand code above or select a brand.`;
  }
  if (code === 'MISSING_REQUIRED_DIMENSION' || code === 'ATTRIBUTE_VALUES_REQUIRED') {
    return `${message} Fix: select at least one value for each variant attribute.`;
  }
  return message;
}

export type VariantManagerProps = {
  productId: string;
  productName: string;
  categoryId: string | null;
  basePrice: number | null;
  categories: AdminCategory[];
  attributes: AdminAttribute[];
  existingVariants: AdminProductDetailVariant[];
  /** Reload product detail after mutations (parent owns the data). */
  onChanged: () => Promise<void> | void;
};

type RowEdit = { price: string; compareAt: string; stock: string; included: boolean };

function normalizeSlug(slug: string): string {
  return slug.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function pairsOf(variant: AdminProductDetailVariant): MatrixPair[] {
  return variant.variantAttributeValues.map((mapping) => ({
    attributeId: mapping.attributeId,
    attributeName: mapping.attribute.name,
    valueId: mapping.attributeValueId,
    value: mapping.attributeValue.value,
  }));
}

function brandOf(variants: AdminProductDetailVariant[]): { code: string | null; valueId: string | null } {
  const counts = new Map<string, { count: number; value: string }>();
  for (const variant of variants) {
    for (const mapping of variant.variantAttributeValues) {
      if (normalizeSlug(mapping.attribute.slug) !== 'BRAND') continue;
      const entry = counts.get(mapping.attributeValueId) ?? { count: 0, value: mapping.attributeValue.value };
      entry.count += 1;
      counts.set(mapping.attributeValueId, entry);
    }
  }
  const top = [...counts.entries()].sort((a, b) => b[1].count - a[1].count)[0];
  if (!top) return { code: null, valueId: null };
  return { code: top[1].value.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || null, valueId: top[0] };
}

/** Current persisted compare-at value for change detection (null-safe). */
function rowComparable(row: MatrixRow): number | null {
  return row.compareAtPrice ?? null;
}

export function VariantManager({
  productId,
  productName,
  categoryId,
  basePrice,
  categories,
  attributes,
  existingVariants,
  onChanged,
}: VariantManagerProps) {
  const { notify } = useToast();
  const { confirm, dialog } = useConfirm();
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const template = category?.skuTemplate?.trim() || '';
  const requiredTokens = template ? requiredDimensionTokens(template) : [];
  const brandAttribute = attributes.find((a) => normalizeSlug(a.slug) === 'BRAND') ?? null;

  const dimensionOptions = useMemo(
    () => attributes.filter((a) => !IDENTITY_TOKENS.has(normalizeSlug(a.slug))),
    [attributes],
  );
  const attributeById = useMemo(() => new Map(attributes.map((a) => [a.id, a])), [attributes]);
  const pairLookup = useMemo(() => {
    const map = new Map<string, { attributeId: string; valueId: string }>();
    for (const attribute of attributes) {
      for (const value of attribute.values) {
        map.set(`${attribute.name}::${value.value}`, { attributeId: attribute.id, valueId: value.id });
      }
    }
    return map;
  }, [attributes]);
  const resolvePair = useCallback(
    (attributeName: string, value: string) => pairLookup.get(`${attributeName}::${value}`) ?? null,
    [pairLookup],
  );

  const [dimensions, setDimensions] = useState<string[]>([]);
  const [selectedValues, setSelectedValues] = useState<Record<string, string[]>>({});
  const [dimensionPicker, setDimensionPicker] = useState('');
  const [brandCode, setBrandCode] = useState('');
  const [brandValueId, setBrandValueId] = useState('');
  const [rows, setRows] = useState<MatrixRow[]>(() =>
    existingVariantRows(
      existingVariants.map((v) => ({
        id: v.id,
        sku: v.sku,
        barcode: v.barcode ?? null,
        status: v.status,
        priceOverride: v.priceOverride === null ? null : Number(v.priceOverride),
        compareAtPrice: v.compareAtPrice === null || v.compareAtPrice === undefined ? null : Number(v.compareAtPrice),
        quantityOnHand: v.inventory ? v.inventory.quantityOnHand : null,
        quantityReserved: v.inventory ? v.inventory.quantityReserved : 0,
        pairs: pairsOf(v),
      })),
    ),
  );
  const [rowEdits, setRowEdits] = useState<Record<string, RowEdit>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBlockedHint, setPreviewBlockedHint] = useState<string | null>(null);
  const [hasPreview, setHasPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkPrice, setBulkPrice] = useState('');
  const [bulkCompareAt, setBulkCompareAt] = useState('');
  const [bulkStock, setBulkStock] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Product-level defaults for newly generated variants (form-level only —
  // the backend has no inherited/custom column). Empty per-row inputs mean
  // "inherited": changing a default updates inherited rows automatically
  // while rows with explicit edits keep their overrides.
  const [defaultPrice, setDefaultPrice] = useState('');
  const [defaultCompareAt, setDefaultCompareAt] = useState('');
  const [totalStock, setTotalStock] = useState('');
  const [stockStrategy, setStockStrategy] = useState<StockStrategy>('even');
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Monotonic preview sequence: a slower earlier response must never clobber
  // newer matrix state when selections change mid-flight.
  const previewSeq = useRef(0);

  // Reset configuration when the product category changes (dimensions are category-scoped).
  const categoryKey = categoryId ?? '';
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setDimensions([]);
    setSelectedValues({});
    setRows(
      existingVariantRows(
        existingVariants.map((v) => ({
          id: v.id,
          sku: v.sku,
          barcode: v.barcode ?? null,
          status: v.status,
          priceOverride: v.priceOverride === null ? null : Number(v.priceOverride),
        compareAtPrice: v.compareAtPrice === null || v.compareAtPrice === undefined ? null : Number(v.compareAtPrice),
          quantityOnHand: v.inventory ? v.inventory.quantityOnHand : null,
          quantityReserved: v.inventory ? v.inventory.quantityReserved : 0,
          pairs: pairsOf(v),
        })),
      ),
    );
    setRowEdits({});
    setHasPreview(false);
    setPreviewState('idle');
    setPreviewBlockedHint(null);
    notify('info', 'Category changed — variant dimensions were reset for the new category.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryKey]);

  // Prefill brand from the product's established variants (edit mode).
  useEffect(() => {
    const established = brandOf(existingVariants);
    if (established.valueId && brandAttribute?.values.some((v) => v.id === established.valueId)) {
      setBrandValueId(established.valueId);
    } else if (established.code) {
      setBrandCode((prev) => prev || established.code || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Keep the matrix in sync when the parent reloads persisted variants and
  // no preview is active (edits/prices applied elsewhere stay visible).
  useEffect(() => {
    if (hasPreview) return;
    setRows(
      existingVariantRows(
        existingVariants.map((v) => ({
          id: v.id,
          sku: v.sku,
          barcode: v.barcode ?? null,
          status: v.status,
          priceOverride: v.priceOverride === null ? null : Number(v.priceOverride),
        compareAtPrice: v.compareAtPrice === null || v.compareAtPrice === undefined ? null : Number(v.compareAtPrice),
          quantityOnHand: v.inventory ? v.inventory.quantityOnHand : null,
          quantityReserved: v.inventory ? v.inventory.quantityReserved : 0,
          pairs: pairsOf(v),
        })),
      ),
    );
  }, [existingVariants, hasPreview]);

  const selectionAxes = useMemo(
    () =>
      dimensions
        .map((attributeId) => attributeById.get(attributeId))
        .filter((a): a is AdminAttribute => Boolean(a))
        .map((attribute) => ({ name: `${attribute.name}s`, count: selectedValues[attribute.id]?.length ?? 0 })),
    [dimensions, attributeById, selectedValues],
  );
  const selectionSummary = useMemo(() => summarizeSelection(selectionAxes.filter((axis) => axis.count > 0)), [selectionAxes]);
  const overLimit = selectionSummary.total > MAX_VARIANTS_PER_OPERATION;

  const requestAttributes = useMemo(() => {
    const entries: Record<string, string[]> = {};
    for (const attributeId of dimensions) {
      const ids = selectedValues[attributeId] ?? [];
      if (ids.length > 0) entries[attributeId] = ids;
    }
    return entries;
  }, [dimensions, selectedValues]);

  // Prerequisite gates for the server preview. Firing the endpoint without
  // these would only produce structured 400s (MISSING_CATEGORY_CODE,
  // MISSING_SKU_COMPONENT, ATTRIBUTE_VALUES_REQUIRED) — the backend stays
  // authoritative, the UI simply does not send doomed requests.
  const brandReady = Boolean(brandValueId) || brandCode.trim().length > 0;
  const categoryCoded = !category || Boolean(category.code);
  const dimensionMissingValues = dimensions.some((attributeId) => (selectedValues[attributeId] ?? []).length === 0);
  const previewBlockedReason = !categoryId
    ? null
    : !categoryCoded
      ? 'This category has no dictionary code, so SKUs cannot be generated yet. Give the category a code under Catalogue → Categories → Edit (SKU code field), or move the product to a coded category.'
      : !brandReady
        ? 'Enter a brand code (or select a brand) above to preview server-generated SKUs.'
        : dimensionMissingValues
          ? 'Select at least one value for each variant attribute before generating variants.'
          : null;

  const runPreview = useCallback(async () => {
    const seq = previewSeq.current + 1;
    previewSeq.current = seq;
    if (!categoryId) {
      setPreviewState('idle');
      setPreviewError(null);
      setPreviewBlockedHint(null);
      return;
    }
    if (previewBlockedReason) {
      setPreviewState('idle');
      setPreviewError(null);
      setPreviewBlockedHint(previewBlockedReason);
      return;
    }
    setPreviewBlockedHint(null);
    if (overLimit) {
      setPreviewState('error');
      setPreviewError(`This selection would create ${selectionSummary.total.toLocaleString('en-KE')} variants — above the limit of ${MAX_VARIANTS_PER_OPERATION} per operation. Narrow the selection.`);
      return;
    }
    setPreviewState('loading');
    setPreviewError(null);
    try {
      const payload: Parameters<typeof generateProductVariants>[1] = {
        attributes: requestAttributes,
        dryRun: true,
      };
      if (brandAttribute && brandValueId) payload.brandValueId = brandValueId;
      else if (brandCode.trim()) payload.brandCode = brandCode.trim().toUpperCase();
      const result: VariantGenerationResult = await generateProductVariants(productId, payload);
      // A newer preview started while this one was in flight — drop the stale response.
      if (previewSeq.current !== seq) return;
      const merged = mergePreviewRows({
        created: result.created,
        existing: result.existing,
        skipped: result.skipped,
        existingDetails: existingVariants.map((v) => ({
          id: v.id,
          status: v.status,
          barcode: v.barcode ?? null,
          priceOverride: v.priceOverride === null ? null : Number(v.priceOverride),
        compareAtPrice: v.compareAtPrice === null || v.compareAtPrice === undefined ? null : Number(v.compareAtPrice),
          quantityOnHand: v.inventory ? v.inventory.quantityOnHand : null,
          quantityReserved: v.inventory ? v.inventory.quantityReserved : 0,
          pairs: pairsOf(v),
        })),
        resolvePair,
      });
      setRows(merged);
      setChecked(new Set(merged.filter((row) => row.status === 'new').map((row) => row.key)));
      setHasPreview(true);
      setPreviewState('ready');
      if (result.errors.length > 0) {
        setPreviewError(result.errors.map((e) => e.message).join(' '));
      }
    } catch (e) {
      if (previewSeq.current !== seq) return;
      setPreviewState('error');
      setPreviewError(explainPreviewFailure(e));
    }
  }, [categoryId, previewBlockedReason, overLimit, selectionSummary.total, requestAttributes, brandAttribute, brandValueId, brandCode, productId, existingVariants, resolvePair]);

  // Debounced server-authoritative preview — never per keystroke.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      void runPreview();
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [runPreview]);

  const editOf = (key: string): RowEdit => rowEdits[key] ?? { price: '', compareAt: '', stock: '', included: true };
  const setEdit = (key: string, patch: Partial<RowEdit>) => {
    setRowEdits((prev) => ({ ...prev, [key]: { ...editOf(key), ...patch } }));
    // Clearing a field clears its row error; re-validation happens on save.
    setRowErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const toggleValue = (attributeId: string, valueId: string) => {
    setSelectedValues((prev) => {
      const current = prev[attributeId] ?? [];
      const next = current.includes(valueId) ? current.filter((id) => id !== valueId) : [...current, valueId];
      return { ...prev, [attributeId]: next };
    });
  };

  const addDimension = () => {
    if (!dimensionPicker || dimensions.includes(dimensionPicker)) return;
    setDimensions((prev) => [...prev, dimensionPicker]);
    setDimensionPicker('');
  };

  const removeDimension = (attributeId: string) => {
    setDimensions((prev) => prev.filter((id) => id !== attributeId));
    setSelectedValues((prev) => {
      const next = { ...prev };
      delete next[attributeId];
      return next;
    });
  };

  // ---- Product-level defaults → inheritance (new rows only) ----
  const defaultPriceParsed = useMemo(() => {
    if (!defaultPrice.trim()) return { ok: true as const, value: null as number | null, error: null as string | null };
    const parsed = validatePriceInput(defaultPrice);
    return parsed.ok ? { ok: true as const, value: parsed.value, error: null as string | null } : { ok: false as const, value: null as number | null, error: parsed.error };
  }, [defaultPrice]);
  const defaultCompareParsed = useMemo(() => {
    if (!defaultCompareAt.trim()) return { ok: true as const, value: null as number | null, error: null as string | null };
    const parsed = validatePriceInput(defaultCompareAt);
    return parsed.ok ? { ok: true as const, value: parsed.value, error: null as string | null } : { ok: false as const, value: null as number | null, error: parsed.error };
  }, [defaultCompareAt]);
  const totalStockParsed = useMemo(() => {
    if (!totalStock.trim()) return { ok: true as const, value: null as number | null, error: null as string | null };
    const parsed = validateStockInput(totalStock);
    return parsed.ok ? { ok: true as const, value: parsed.value, error: null as string | null } : { ok: false as const, value: null as number | null, error: parsed.error };
  }, [totalStock]);
  const defaultsPairError = useMemo(() => {
    if (!defaultPriceParsed.ok || !defaultCompareParsed.ok) return null;
    return validatePricePair(defaultPriceParsed.value, defaultCompareParsed.value);
  }, [defaultPriceParsed, defaultCompareParsed]);

  const newIncludedRows = useMemo(
    () => rows.filter((row) => row.status === 'new' && (rowEdits[row.key]?.included ?? true)),
    [rows, rowEdits],
  );

  /** Explicit per-row stock overrides for new rows (valid whole units only). */
  const overriddenStock = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of newIncludedRows) {
      const raw = rowEdits[row.key]?.stock ?? '';
      if (!raw.trim()) continue;
      const parsed = validateStockInput(raw);
      if (parsed.ok && parsed.value !== null) map.set(row.key, parsed.value);
    }
    return map;
  }, [newIncludedRows, rowEdits]);

  /** Effective stock per new row: overrides kept, remainder shared evenly in stable order. */
  const effectiveStock = useMemo(() => {
    if (stockStrategy === 'manual' || !totalStockParsed.ok || totalStockParsed.value === null) {
      const map = new Map<string, number>();
      for (const row of newIncludedRows) map.set(row.key, overriddenStock.get(row.key) ?? 0);
      return map;
    }
    return distributeUnallocatedStock({
      total: totalStockParsed.value,
      keysInOrder: newIncludedRows.map((row) => row.key),
      overridden: overriddenStock,
    }).effective;
  }, [stockStrategy, totalStockParsed, newIncludedRows, overriddenStock]);

  const allocation = useMemo(() => {
    const quantities = newIncludedRows.map((row) => effectiveStock.get(row.key) ?? 0);
    if (!totalStockParsed.ok) return summarizeAllocation(null, quantities, newIncludedRows.length);
    return summarizeAllocation(totalStockParsed.value, quantities, newIncludedRows.length);
  }, [effectiveStock, newIncludedRows, totalStockParsed]);

  const effectivePriceOf = useCallback(
    (row: MatrixRow): number | null => {
      const raw = rowEdits[row.key]?.price ?? '';
      if (raw.trim()) {
        const parsed = validatePriceInput(raw);
        return parsed.ok ? parsed.value : null;
      }
      if (row.status !== 'new') return row.priceOverride;
      return defaultPriceParsed.ok ? defaultPriceParsed.value : null;
    },
    [rowEdits, defaultPriceParsed],
  );

  const effectiveCompareOf = useCallback(
    (row: MatrixRow): number | null => {
      const raw = rowEdits[row.key]?.compareAt ?? '';
      if (raw.trim()) {
        const parsed = validatePriceInput(raw);
        return parsed.ok ? parsed.value : null;
      }
      if (row.status !== 'new') return rowComparable(row);
      return defaultCompareParsed.ok ? defaultCompareParsed.value : null;
    },
    [rowEdits, defaultCompareParsed],
  );

  const resetRowPrices = (key: string) => {
    setEdit(key, { price: '', compareAt: '' });
    notify('info', 'Row reset to product defaults — inherited until you type a custom price.');
  };

  const distributeEvenly = () => {
    // Explicit redistribution: clear stock overrides on new rows so every
    // row re-inherits its even share. Established (existing) inventory is
    // never touched.
    setRowEdits((prev) => {
      const next = { ...prev };
      for (const row of newIncludedRows) {
        const current = next[row.key] ?? { price: '', compareAt: '', stock: '', included: true };
        next[row.key] = { ...current, stock: '' };
      }
      return next;
    });
    setStockStrategy('even');
    notify('success', 'Stock overrides cleared — new items share the total evenly.');
  };

  const toggleCheck = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const applyBulk = async () => {
    if (checked.size === 0) {
      notify('info', 'Select at least one matrix row to apply bulk values.');
      return;
    }
    if (!bulkPrice.trim() && !bulkCompareAt.trim() && !bulkStock.trim()) {
      notify('info', 'Enter a bulk price, previous price, or stock quantity first.');
      return;
    }
    if (bulkPrice.trim()) {
      const parsed = validatePriceInput(bulkPrice);
      if (!parsed.ok) {
        notify('error', parsed.error);
        return;
      }
      if (parsed.value !== null && !(parsed.value > 0)) {
        notify('error', 'Bulk selling price must be above KES 0.');
        return;
      }
    }
    if (bulkCompareAt.trim()) {
      const parsed = validatePriceInput(bulkCompareAt);
      if (!parsed.ok) {
        notify('error', `Bulk previous price: ${parsed.error}`);
        return;
      }
    }
    if (bulkStock.trim()) {
      const parsed = validateStockInput(bulkStock);
      if (!parsed.ok) {
        notify('error', parsed.error);
        return;
      }
    }
    // Bulk staging changes local inputs only; the server write happens on
    // Save with its own confirmation, so nothing persists silently here.
    const proceed = await confirm({
      title: 'Apply bulk values?',
      description: `Stage bulk values for ${checked.size} selected item(s). Review each row, then choose Save to persist.`,
      confirmLabel: 'Stage values',
      onConfirm: () => undefined,
    });
    if (!proceed) return;
    if (bulkPrice.trim()) {
      for (const key of checked) setEdit(key, { price: bulkPrice.trim() });
    }
    if (bulkCompareAt.trim()) {
      for (const key of checked) setEdit(key, { compareAt: bulkCompareAt.trim() });
    }
    if (bulkStock.trim()) {
      for (const key of checked) setEdit(key, { stock: bulkStock.trim() });
    }
    notify('success', `Bulk values staged for ${checked.size} variant(s). Save to persist.`);
  };

  const handleGenerate = async () => {
    // No valid combinations staged — never call the API (§12). An empty
    // dimension list is legitimate (single default variant) and proceeds.
    if (dimensionMissingValues) {
      notify('info', 'Select at least one value for each variant attribute before generating variants.');
      return;
    }
    const newRows = rows.filter((row) => row.status === 'new');
    if (newRows.length === 0) {
      notify('info', 'Nothing new to create — every previewed combination already exists.');
      return;
    }
    const proceed = await confirm({
      title: 'Create variants',
      description: `${newRows.filter((r) => editOf(r.key).included).length} new variant(s) will be created for ${productName}. Existing variants are preserved.`,
      confirmLabel: 'Create variants',
      onConfirm: () => undefined,
    });
    if (!proceed) return;
    setSaving(true);
    try {
      const withEdits = rows.map((row) => (row.status === 'new' ? { ...row, included: editOf(row.key).included } : row));
      const allowList = buildAllowList(withEdits);
      const payload: Parameters<typeof generateProductVariants>[1] = { attributes: requestAttributes, dryRun: false };
      if (allowList !== undefined) payload.allowList = allowList;
      if (brandAttribute && brandValueId) payload.brandValueId = brandValueId;
      else if (brandCode.trim()) payload.brandCode = brandCode.trim().toUpperCase();
      const result = await generateProductVariants(productId, payload);
      const createdBySku = new Map(result.created.map((item) => [item.sku, item.id]));
      // Per-row prices → one batch PATCH (never one request per variant).
      // Previous (compare-at) prices ride the same batch write; both fields
      // map to the existing authoritative columns (no new model).
      // Validate product defaults first: malformed defaults or a
      // previous price at/below the selling price blocks creation.
      if (!defaultPriceParsed.ok) throw new Error(`Default selling price: ${defaultPriceParsed.error}`);
      if (!defaultCompareParsed.ok) throw new Error(`Default previous price: ${defaultCompareParsed.error}`);
      if (!totalStockParsed.ok) throw new Error(`Total stock: ${totalStockParsed.error}`);
      if (defaultsPairError) throw new Error(defaultsPairError);
      const priceWrites: Array<{ id: string; price?: number; compareAtPrice?: number | null }> = [];
      for (const row of withEdits) {
        if (row.status !== 'new' || !row.included) continue;
        // Raw inputs must still be well-formed when present; empty means
        // "inherit the product default" (never silently fabricated).
        const rawParsed = validatePriceInput(editOf(row.key).price);
        if (!rawParsed.ok) {
          setRowErrors((prev) => ({ ...prev, [row.key]: rawParsed.error }));
          throw new Error(`Row ${row.sku}: ${rawParsed.error}`);
        }
        const rawCompareParsed = validatePriceInput(editOf(row.key).compareAt);
        if (!rawCompareParsed.ok) {
          setRowErrors((prev) => ({ ...prev, [row.key]: rawCompareParsed.error }));
          throw new Error(`Row ${row.sku}: ${rawCompareParsed.error}`);
        }
        const effectivePrice = effectivePriceOf(row);
        const effectiveCompare = effectiveCompareOf(row);
        if (effectivePrice === null || !(effectivePrice > 0)) {
          const message = 'Enter a selling price above KES 0 for each new item (or set a product default above).';
          setRowErrors((prev) => ({ ...prev, [row.key]: message }));
          throw new Error(`Row ${row.sku}: ${message}`);
        }
        const pairError = validatePricePair(effectivePrice, effectiveCompare);
        if (pairError) {
          setRowErrors((prev) => ({ ...prev, [row.key]: pairError }));
          throw new Error(`Row ${row.sku}: ${pairError}`);
        }
        const createdId = createdBySku.get(row.sku);
        if (createdId) {
          priceWrites.push({
            id: createdId,
            price: effectivePrice,
            ...(effectiveCompare !== null ? { compareAtPrice: effectiveCompare } : {}),
          });
        }
      }
      if (priceWrites.length > 0) await batchUpdateVariants(productId, { variants: priceWrites });
      // Per-row stock → one batch restock (new variants start at zero).
      // Effective quantities conserve the entered total: overrides are kept,
      // inherited rows share the remainder evenly in stable order.
      const stockWrites: Array<{ variantId: string; quantity: number }> = [];
      for (const row of withEdits) {
        if (row.status !== 'new' || !row.included) continue;
        const rawParsed = validateStockInput(editOf(row.key).stock);
        if (!rawParsed.ok) throw new Error(`Row ${row.sku}: ${rawParsed.error}`);
        const quantity = effectiveStock.get(row.key) ?? 0;
        const createdId = createdBySku.get(row.sku);
        if (quantity > 0 && createdId) stockWrites.push({ variantId: createdId, quantity });
      }
      if (stockWrites.length > 0) await restockVariantsBatch({ reason: 'Initial matrix stock', items: stockWrites });
      notify('success', `Created ${result.summary.created} variant(s)${result.summary.existing > 0 ? `, ${result.summary.existing} already existed` : ''}.`);
      setRowEdits({});
      setChecked(new Set());
      setHasPreview(false);
      // The refreshed `existingVariants` prop changes `runPreview` identity,
      // so the debounced effect above re-runs the preview exactly once — no
      // explicit call here (it would double the request).
      await onChanged();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Variant creation failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrices = async () => {
    const writes: Array<{ id: string; price?: number; compareAtPrice?: number | null }> = [];
    const nextErrors: Record<string, string> = {};
    for (const row of rows) {
      if (!row.variantId) continue;
      const raw = editOf(row.key).price;
      const rawCompare = editOf(row.key).compareAt;
      if (!raw.trim() && !rawCompare.trim()) continue;
      if (raw.trim()) {
        const parsed = validatePriceInput(raw);
        if (!parsed.ok) {
          nextErrors[row.key] = parsed.error;
          continue;
        }
        if (parsed.value !== null && !(parsed.value > 0)) {
          nextErrors[row.key] = 'Enter a selling price above KES 0.';
          continue;
        }
        if (parsed.value !== null && parsed.value !== row.priceOverride) {
          const entry = writes.find((w) => w.id === row.variantId);
          if (entry) entry.price = parsed.value;
          else writes.push({ id: row.variantId as string, price: parsed.value });
        }
      }
      if (rawCompare.trim()) {
        const parsed = validatePriceInput(rawCompare);
        if (!parsed.ok) {
          nextErrors[row.key] = parsed.error;
          continue;
        }
        const currentCompare = rowComparable(row);
        if (parsed.value !== currentCompare) {
          const entry = writes.find((w) => w.id === row.variantId);
          if (entry) entry.compareAtPrice = parsed.value;
          else writes.push({ id: row.variantId as string, compareAtPrice: parsed.value });
        }
      }
      // Resulting pair must satisfy the previous-price rule (compare-at >
      // selling price when both are present). Established values are never
      // rewritten — only staged edits are validated here.
      const entry = writes.find((w) => w.id === row.variantId);
      if (entry) {
        const resultingPrice = entry.price ?? row.priceOverride;
        const resultingCompare = entry.compareAtPrice !== undefined ? entry.compareAtPrice : rowComparable(row);
        const pairError = validatePricePair(resultingPrice, resultingCompare);
        if (pairError) {
          nextErrors[row.key] = pairError;
        }
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setRowErrors(nextErrors);
      const first = rows.find((r) => nextErrors[r.key]);
      notify('error', first ? `Row ${first.sku}: ${nextErrors[first.key]}` : 'Fix the highlighted rows before saving.');
      return;
    }
    if (writes.length === 0) {
      notify('info', 'No price changes to save.');
      return;
    }
    // Confirmation step: bulk/server price writes never persist silently.
    const proceed = await confirm({
      title: `Save prices for ${writes.length} item(s)?`,
      description: 'Selling prices update through the authorised pricing workflow and are audited. Stock is unchanged by this action.',
      confirmLabel: 'Save prices',
      onConfirm: () => undefined,
    });
    if (!proceed) return;
    setSaving(true);
    try {
      await batchUpdateVariants(productId, { variants: writes });
      notify('success', `Price updated for ${writes.length} variant(s).`);
      setRowEdits({});
      setRowErrors({});
      await onChanged();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Price update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyStock = async (row: MatrixRow) => {
    if (!row.variantId || row.quantityOnHand === null) return;
    const parsed = validateStockInput(editOf(row.key).stock);
    if (!parsed.ok) {
      setRowErrors((prev) => ({ ...prev, [row.key]: parsed.error }));
      notify('error', `Row ${row.sku}: ${parsed.error}`);
      return;
    }
    if (parsed.value === null || parsed.value === row.quantityOnHand) {
      notify('info', 'No stock change to apply.');
      return;
    }
    const delta = parsed.value - row.quantityOnHand;
    setSaving(true);
    try {
      await adjustVariant(row.variantId, { delta, reason: 'Matrix stock correction' });
      notify('success', `Stock for ${row.sku} set to ${parsed.value}.`);
      setEdit(row.key, { stock: '' });
      await onChanged();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Stock update failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (row: MatrixRow, status: 'ARCHIVED' | 'ACTIVE') => {
    if (!row.variantId) return;
    try {
      await updateAdminVariant(productId, row.variantId, { status });
      notify('success', status === 'ARCHIVED' ? `Variant ${row.sku} archived — order history preserved.` : `Variant ${row.sku} restored.`);
      await onChanged();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Variant status update failed.');
    }
  };

  const handleGenerateBarcode = async (row: MatrixRow) => {
    if (!row.variantId || row.barcode) return;
    setSaving(true);
    try {
      const result = await generateVariantBarcode(productId, row.variantId);
      notify('success', `Barcode ${result.barcode} assigned to ${row.sku}.`);
      await onChanged();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Barcode generation failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateMissing = async () => {
    const proceed = await confirm({
      title: 'Generate missing barcodes',
      description: 'Internal barcodes will be generated for variants that have none. Existing barcodes are never changed.',
      confirmLabel: 'Generate missing',
      onConfirm: () => undefined,
    });
    if (!proceed) return;
    setSaving(true);
    try {
      const result = await generateMissingBarcodes(productId);
      notify(
        'success',
        result.generated.length > 0
          ? `Generated ${result.generated.length} barcode(s)${result.errors.length > 0 ? `, ${result.errors.length} failed` : ''}.`
          : 'Every variant already has a barcode.',
      );
      await onChanged();
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Bulk barcode generation failed.');
    } finally {
      setSaving(false);
    }
  };

  const newCount = rows.filter((r) => r.status === 'new' && editOf(r.key).included).length;
  const existingCount = rows.filter((r) => r.status === 'existing').length;
  const skippedCount = rows.filter((r) => !editOf(r.key).included || r.status === 'skipped').length;

  return (
    <div className="variant-manager">
      {dialog}
      <p className="muted-copy workspace-card__hint">
        Variant-defining attributes come from the category SKU template{template ? ` (${template})` : ''} — descriptive
        attributes never create variants. SKUs are generated by the server; the preview below is authoritative.
      </p>

      {!categoryId && (
        <div className="error-message" role="alert">
          Assign a category to the product first — variant dimensions are category-scoped.
        </div>
      )}

      <fieldset className="variant-manager__dimensions" disabled={!categoryId || saving}>
        <legend>Variant options <span className="muted-copy">— what changes between variants?</span></legend>
        {requiredTokens.length > 0 && (
          <p className="muted-copy">
            Required for this category: {requiredTokens.map((t) => t.charAt(0) + t.slice(1).toLowerCase()).join(', ')}
          </p>
        )}
        <div className="variant-manager__add-row">
          <label>
            <span className="visually-hidden">Add variant option</span>
            <select value={dimensionPicker} onChange={(e) => setDimensionPicker(e.currentTarget.value)} aria-label="Add variant option">
              <option value="">+ Add variant option</option>
              {dimensionOptions
                .filter((a) => !dimensions.includes(a.id))
                .map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
            </select>
          </label>
          <button type="button" className="button button--secondary button--small" onClick={addDimension} disabled={!dimensionPicker}>
            <JBIcon name="plus" size={14} /> Add
          </button>
        </div>

        {dimensions.length === 0 && (
          <p className="muted-copy" role="note">
            No variant options selected — the product will have a single default variant ({productName}).
          </p>
        )}

        {dimensions.map((attributeId) => {
          const attribute = attributeById.get(attributeId);
          if (!attribute) return null;
          const selected = selectedValues[attributeId] ?? [];
          return (
            <div key={attributeId} className="variant-manager__dimension">
              <div className="variant-manager__dimension-head">
                <strong>{attribute.name}</strong>
                <span className="muted-copy">{selected.length} selected</span>
                <button type="button" className="text-button" onClick={() => removeDimension(attributeId)} aria-label={`Remove ${attribute.name} dimension`}>
                  Remove
                </button>
              </div>
              <div className="variant-manager__values" role="group" aria-label={`${attribute.name} values`}>
                {attribute.values.map((value) => {
                  const checkedValue = selected.includes(value.id);
                  return (
                    <label key={value.id} className={`variant-manager__value${checkedValue ? ' is-checked' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checkedValue}
                        onChange={() => toggleValue(attributeId, value.id)}
                      />
                      <span>{value.value}</span>
                    </label>
                  );
                })}
              </div>
              {selected.length > 0 && (
                <ul className="chip-list" aria-label={`Selected ${attribute.name} values`}>
                  {selected.map((valueId) => {
                    const value = attribute.values.find((v) => v.id === valueId);
                    return (
                      <li key={valueId} className="chip">
                        <span>{value?.value ?? valueId}</span>
                        <button type="button" className="chip__remove" onClick={() => toggleValue(attributeId, valueId)} aria-label={`Remove ${value?.value ?? valueId}`}>
                          <JBIcon name="close" size={12} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}

        <div className="form-grid">
          {brandAttribute ? (
            <label>
              <span>Brand</span>
              <select value={brandValueId} onChange={(e) => setBrandValueId(e.currentTarget.value)}>
                <option value="">Select brand</option>
                {brandAttribute.values.map((v) => (
                  <option key={v.id} value={v.id}>{v.value}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>Brand code (2–6 letters/digits, e.g. NKE)</span>
              <input
                type="text"
                value={brandCode}
                maxLength={6}
                placeholder="NKE"
                onChange={(e) => setBrandCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
            </label>
          )}
        </div>
      </fieldset>

      <fieldset className="variant-manager__defaults" disabled={!categoryId || saving}>
        <legend>Product defaults <span className="muted-copy">— starting prices &amp; stock for new items</span></legend>
        <p className="muted-copy workspace-card__hint">
          Defaults populate new items only. Leave a row empty to inherit; type a value to customize that row.
          Changing a default updates inherited rows without touching customized ones. Established items keep their
          saved prices and stock — they are never redistributed automatically.
        </p>
        <div className="form-grid">
          <label htmlFor="variant-default-price">
            <span>Default selling price (KES)</span>
            <input
              id="variant-default-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 2500.00"
              value={defaultPrice}
              onChange={(e) => {
                setDefaultPrice(e.currentTarget.value);
                setDefaultsError(null);
              }}
              aria-invalid={Boolean((!defaultPriceParsed.ok && defaultPrice.trim()) || defaultsPairError)}
            />
            {!defaultPriceParsed.ok && defaultPrice.trim() ? (
              <span className="field-error" role="alert">{defaultPriceParsed.error}</span>
            ) : null}
          </label>
          <label htmlFor="variant-default-compare">
            <span>Default previous price (KES) — optional</span>
            <input
              id="variant-default-compare"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 3000.00 for a sale"
              value={defaultCompareAt}
              onChange={(e) => {
                setDefaultCompareAt(e.currentTarget.value);
                setDefaultsError(null);
              }}
              aria-invalid={Boolean((!defaultCompareParsed.ok && defaultCompareAt.trim()) || defaultsPairError)}
              aria-describedby="variant-default-compare-hint"
            />
            {!defaultCompareParsed.ok && defaultCompareAt.trim() ? (
              <span className="field-error" role="alert">{defaultCompareParsed.error}</span>
            ) : (
              <span id="variant-default-compare-hint" className="muted-copy">
                Shown crossed-out only when higher than the selling price.
              </span>
            )}
          </label>
          <label htmlFor="variant-total-stock">
            <span>Total stock to distribute</span>
            <input
              id="variant-total-stock"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              placeholder="e.g. 24"
              value={totalStock}
              onChange={(e) => {
                setTotalStock(e.currentTarget.value);
                setDefaultsError(null);
              }}
              aria-invalid={Boolean(!totalStockParsed.ok && totalStock.trim())}
            />
            {!totalStockParsed.ok && totalStock.trim() ? (
              <span className="field-error" role="alert">{totalStockParsed.error}</span>
            ) : null}
          </label>
        </div>
        {defaultsPairError ? (
          <div className="error-message" role="alert">{defaultsPairError}</div>
        ) : null}
        {defaultsError ? (
          <div className="error-message" role="alert">{defaultsError}</div>
        ) : null}
        <div className="variant-manager__strategy" role="group" aria-label="Stock allocation strategy">
          <label className="facet-option" htmlFor="stock-strategy-even">
            <input
              id="stock-strategy-even"
              type="radio"
              name="stock-strategy"
              checked={stockStrategy === 'even'}
              onChange={() => setStockStrategy('even')}
            />
            <span><strong>Distribute evenly</strong><span className="muted-copy"> — split the total across new items; remainder goes to the first items in order. Custom rows keep their quantities and only the rest is shared.</span></span>
          </label>
          <label className="facet-option" htmlFor="stock-strategy-manual">
            <input
              id="stock-strategy-manual"
              type="radio"
              name="stock-strategy"
              checked={stockStrategy === 'manual'}
              onChange={() => setStockStrategy('manual')}
            />
            <span><strong>Enter stock manually</strong><span className="muted-copy"> — new rows start at 0 unless you type a quantity. You may leave some at zero.</span></span>
          </label>
        </div>
        <dl className="media-meta" aria-label="Stock allocation summary" aria-live="polite">
          <dt>Total entered</dt>
          <dd>{totalStockParsed.ok && totalStockParsed.value !== null ? totalStockParsed.value.toLocaleString('en-KE') : '—'}</dd>
          <dt>Allocated</dt>
          <dd>{allocation.allocated.toLocaleString('en-KE')}</dd>
          <dt>Unallocated</dt>
          <dd>{allocation.unallocated === null ? '—' : allocation.unallocated.toLocaleString('en-KE')}</dd>
          <dt>New items</dt>
          <dd>{allocation.variantCount}</dd>
        </dl>
        {allocation.unallocated !== null && allocation.unallocated < 0 ? (
          <div className="error-message" role="alert">
            Custom rows exceed the total by {Math.abs(allocation.unallocated).toLocaleString('en-KE')} unit(s) — raise the total or lower a custom quantity. Nothing is discarded.
          </div>
        ) : null}
        <div className="form-actions">
          <button type="button" className="button button--secondary button--small" onClick={distributeEvenly} disabled={saving || newIncludedRows.length === 0}>
            Distribute evenly
          </button>
          <span className="muted-copy">Clears custom stock on new rows so every row re-inherits its even share. Existing items are untouched.</span>
        </div>
      </fieldset>

      <div className="variant-manager__summary" role="status" aria-live="polite">
        <strong>{selectionSummary.label}</strong>
        <span className="muted-copy">
          {previewState === 'loading' ? 'Generating SKUs…' : `${newCount} new · ${existingCount} existing · ${skippedCount} skipped`}
          {basePrice !== null && basePrice !== undefined ? ` · Catalogue fallback ${formatKES(basePrice)} (used only when an item has no price)` : ''}
        </span>
        <button type="button" className="button button--secondary button--small" onClick={() => void runPreview()} disabled={saving || previewState === 'loading' || !categoryId}>
          Refresh preview
        </button>
      </div>

      {previewState === 'loading' && (
        <p className="muted-copy" role="status" aria-busy="true">Generating SKUs…</p>
      )}
      {previewBlockedHint && previewState === 'idle' && (
        <p className="muted-copy" role="note">{previewBlockedHint}</p>
      )}
      {previewState === 'error' && previewError && (
        <div className="error-message" role="alert">{previewError} <button type="button" className="text-button" onClick={() => void runPreview()}>Try again</button></div>
      )}
      {previewState === 'ready' && previewError && (
        <div className="inline-message" role="alert">{previewError}</div>
      )}

      {rows.length > 0 && (
        <>
          <div className="variant-manager__bulk">
            <label>
              <span className="visually-hidden">Bulk selling price (KES)</span>
              <input type="number" min="0" step="0.01" placeholder="Bulk price (KES)" value={bulkPrice} onChange={(e) => setBulkPrice(e.currentTarget.value)} aria-label="Bulk selling price in KES" />
            </label>
            <label>
              <span className="visually-hidden">Bulk previous price (KES)</span>
              <input type="number" min="0" step="0.01" placeholder="Bulk previous (KES)" value={bulkCompareAt} onChange={(e) => setBulkCompareAt(e.currentTarget.value)} aria-label="Bulk previous price in KES" />
            </label>
            <label>
              <span className="visually-hidden">Bulk stock</span>
              <input type="number" min="0" step="1" placeholder="Bulk stock" value={bulkStock} onChange={(e) => setBulkStock(e.currentTarget.value)} aria-label="Bulk stock quantity" />
            </label>
            <button type="button" className="button button--secondary button--small" onClick={() => void applyBulk()} disabled={saving || checked.size === 0}>
              Apply to {checked.size} selected
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => void handleSavePrices()} disabled={saving}>
              Save price changes
            </button>
            <button type="button" className="button button--secondary button--small" onClick={() => void handleGenerateMissing()} disabled={saving}>
              Generate missing barcodes
            </button>
          </div>

          <div className="admin-table-wrapper variant-matrix-wrapper">
            <table className="admin-table variant-matrix">
              <caption className="visually-hidden">Product items with SKU, selling price, previous price and stock</caption>
              <thead>
                <tr>
                  <th scope="col"><span className="visually-hidden">Select</span></th>
                  <th scope="col">Item</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Barcode</th>
                  <th scope="col">Selling price (KES)</th>
                  <th scope="col">Previous price (KES)</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const edit = editOf(row.key);
                  const isChecked = checked.has(row.key);
                  const outOfStock = row.status === 'existing' && (row.quantityOnHand ?? 0) - row.quantityReserved <= 0;
                  return (
                    <tr key={row.key} className={row.status === 'skipped' || !edit.included ? 'is-excluded' : undefined}>
                      <td data-label="Select">
                        <input
                          type="checkbox"
                          checked={row.status === 'new' ? edit.included : isChecked}
                          onChange={() => {
                            if (row.status === 'new') {
                              const next = !edit.included;
                              setEdit(row.key, { included: next });
                              setChecked((prev) => {
                                const updated = new Set(prev);
                                if (next) updated.add(row.key);
                                else updated.delete(row.key);
                                return updated;
                              });
                            } else if (row.status === 'existing') {
                              toggleCheck(row.key);
                            }
                          }}
                          disabled={row.status === 'skipped'}
                          aria-label={row.status === 'new' ? `Include ${row.sku} in generation` : `Select ${row.sku} for bulk actions`}
                        />
                      </td>
                      <td data-label="Variant">
                        <strong>{row.label || productName}</strong>
                        {row.status === 'new' && <span className="status-badge status-badge--new">New</span>}
                        {row.status === 'skipped' && <span className="status-badge">Skipped</span>}
                        {rowErrors[row.key] ? <span className="field-error" role="alert">{rowErrors[row.key]}</span> : null}
                      </td>
                      <td data-label="SKU"><code>{row.sku}</code></td>
                      <td data-label="Barcode">
                        {row.barcode ? (
                          <code>{row.barcode}</code>
                        ) : row.status === 'existing' && row.variantId ? (
                          <button type="button" className="text-button" onClick={() => void handleGenerateBarcode(row)} disabled={saving}>
                            Generate
                          </button>
                        ) : (
                          <span className="muted-copy">—</span>
                        )}
                      </td>
                      <td data-label="Selling price (KES)">
                        {row.status === 'existing' ? (
                          <span>{formatKES(row.priceOverride)} <span className="status-badge">Established</span></span>
                        ) : (
                          <>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={edit.price}
                              placeholder={defaultPriceParsed.ok && defaultPriceParsed.value !== null ? `Inherits ${formatKES(defaultPriceParsed.value)}` : 'Required, e.g. 2500'}
                              onChange={(e) => setEdit(row.key, { price: e.currentTarget.value })}
                              aria-label={`Selling price for ${row.sku}`}
                              aria-invalid={Boolean(rowErrors[row.key])}
                              disabled={!edit.included}
                              required
                            />
                            {edit.price.trim() ? (
                              <span className="variant-matrix__row-actions">
                                <span className="status-badge status-badge--new">Custom</span>
                                <button type="button" className="text-button" onClick={() => resetRowPrices(row.key)} disabled={!edit.included} aria-label={`Reset prices for ${row.sku} to defaults`}>
                                  Reset
                                </button>
                              </span>
                            ) : defaultPriceParsed.ok && defaultPriceParsed.value !== null ? (
                              <span className="muted-copy">Inherits {formatKES(defaultPriceParsed.value)}</span>
                            ) : null}
                          </>
                        )}
                        {row.status === 'existing' && (
                          <>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={edit.price}
                              placeholder="New price"
                              onChange={(e) => setEdit(row.key, { price: e.currentTarget.value })}
                              aria-label={`New selling price for ${row.sku}`}
                            />
                            {!edit.price.trim() && defaultPriceParsed.ok && defaultPriceParsed.value !== null && defaultPriceParsed.value !== row.priceOverride ? (
                              <button type="button" className="text-button" onClick={() => setEdit(row.key, { price: String(defaultPriceParsed.value) })} aria-label={`Stage default price for ${row.sku}`}>
                                Use default ({formatKES(defaultPriceParsed.value)})
                              </button>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td data-label="Previous price (KES)">
                        {row.status === 'existing' ? (
                          <span className="muted-copy">{row.compareAtPrice === null ? '—' : formatKES(row.compareAtPrice)}</span>
                        ) : (
                          <>
                            {edit.compareAt.trim() ? (
                              <span className="status-badge status-badge--new">Custom</span>
                            ) : defaultCompareParsed.ok && defaultCompareParsed.value !== null ? (
                              <span className="muted-copy">Inherits {formatKES(defaultCompareParsed.value)}</span>
                            ) : null}
                          </>
                        )}
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={edit.compareAt}
                          placeholder={row.status === 'existing' ? 'New previous' : defaultCompareParsed.ok && defaultCompareParsed.value !== null ? `Inherits ${formatKES(defaultCompareParsed.value)}` : 'Optional'}
                          onChange={(e) => setEdit(row.key, { compareAt: e.currentTarget.value })}
                          aria-label={`Previous price for ${row.sku}`}
                          disabled={row.status === 'new' && !edit.included}
                        />
                        {row.status === 'new' && (edit.price.trim() || edit.compareAt.trim()) ? (
                          <button type="button" className="text-button" onClick={() => resetRowPrices(row.key)} disabled={!edit.included} aria-label={`Reset prices for ${row.sku} to defaults`}>
                            Reset
                          </button>
                        ) : null}
                      </td>
                      <td data-label="Stock">
                        {row.status === 'existing' ? (
                          <span>
                            {row.quantityOnHand === null ? '—' : formatStock(row.quantityOnHand, row.quantityReserved)}
                            {outOfStock && <span className="muted-copy"> · Out of stock</span>}
                          </span>
                        ) : (
                          <>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={edit.stock}
                              placeholder={stockStrategy === 'even' && totalStockParsed.ok && totalStockParsed.value !== null ? `Inherits ${effectiveStock.get(row.key) ?? 0}` : '0'}
                              onChange={(e) => setEdit(row.key, { stock: e.currentTarget.value })}
                              aria-label={`Stock for ${row.sku}`}
                              disabled={!edit.included}
                            />
                            {edit.stock.trim() ? (
                              <span className="muted-copy">Custom</span>
                            ) : stockStrategy === 'even' && totalStockParsed.ok && totalStockParsed.value !== null ? (
                              <span className="muted-copy">Inherits {effectiveStock.get(row.key) ?? 0}</span>
                            ) : null}
                          </>
                        )}
                        {row.status === 'existing' && (
                          <span className="variant-matrix__row-actions">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={edit.stock}
                              placeholder="Set stock"
                              onChange={(e) => setEdit(row.key, { stock: e.currentTarget.value })}
                              aria-label={`Set stock for ${row.sku}`}
                            />
                            <button type="button" className="button button--secondary button--small" onClick={() => void handleApplyStock(row)} disabled={saving}>
                              Apply
                            </button>
                          </span>
                        )}
                      </td>
                      <td data-label="Status">
                        {row.status === 'existing' && row.variantStatus ? (
                          <AdminStatusBadge status={row.variantStatus} />
                        ) : row.status === 'new' ? (
                          <span className="muted-copy">Will be Active</span>
                        ) : (
                          <span className="muted-copy">Excluded</span>
                        )}
                      </td>
                      <td data-label="Actions">
                        {row.status === 'existing' && row.variantId && row.variantStatus !== 'ARCHIVED' ? (
                          <ConfirmAction
                            label="Archive"
                            confirmMessage={`Archive variant ${row.sku}? It stops being purchasable; orders and stock history are preserved — it is never hard-deleted.`}
                            onConfirm={() => void handleArchive(row, 'ARCHIVED')}
                            danger
                          />
                        ) : null}
                        {row.status === 'existing' && row.variantId && row.variantStatus === 'ARCHIVED' ? (
                          <ConfirmAction
                            label="Restore"
                            confirmMessage={`Restore variant ${row.sku} to ACTIVE?`}
                            onConfirm={() => void handleArchive(row, 'ACTIVE')}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button type="button" className="button" onClick={() => void handleGenerate()} disabled={saving || previewState === 'loading' || newCount === 0} aria-busy={saving}>
              <JBIcon name="check" size={16} /> {saving ? 'Saving…' : `Create ${newCount} variant(s)`}
            </button>
            <span className="muted-copy">Idempotent — existing combinations are preserved, never duplicated.</span>
          </div>
        </>
      )}
    </div>
  );
}
