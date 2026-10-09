'use client';

/**
 * PricingStockSection — dedicated Pricing & Stock experience for product
 * creation and editing (JB Mercantile simplified product workflow).
 *
 * Authoritative model (no second source of truth):
 * - Selling price lives on ProductVariant.priceOverride (fallback
 *   Product.basePrice, never admin-editable — BD-004). Every save here
 *   writes priceOverride through the supported variant endpoints
 *   (generate / single PATCH / batch PATCH) and is audited PRICE_CHANGED.
 * - Previous (compare-at) price surfaces the existing backend
 *   ProductVariant.compareAtPrice column only (BD-005 pending owner
 *   sign-off): optional, never fabricated, shown crossed-out only when the
 *   backend returns compareAtPrice > price.
 * - Stock writes use audited inventory movements only (restock-batch for
 *   new variants, adjust for corrections). Available stock is always
 *   derived (onHand − reserved) and never directly editable.
 * - Currency is KES everywhere (Intl en-KE, backend Decimal(10,2)).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { useConfirm } from './ConfirmDialog';
import { JBIcon } from './JBIcons';
import { useToast } from './Toast';
import { VariantManager } from './VariantManager';
import {
  adjustVariant,
  batchUpdateVariants,
  generateProductVariants,
  getAdminProduct,
  restockVariantsBatch,
  type AdminAttribute,
  type AdminCategory,
  type AdminProductDetailVariant,
} from '../lib/admin-api';
import { formatKES, validatePriceInput, validateStockInput } from '../lib/variant-matrix';

export type PricingStockSectionProps = {
  productId: string;
  productName: string;
  categoryId: string | null;
  categories: AdminCategory[];
  attributes: AdminAttribute[];
  existingVariants: AdminProductDetailVariant[];
  /** True when the administrator declared options/variations. */
  hasOptions: boolean;
  onHasOptionsChange: (value: boolean) => void;
  /** Reload product detail after mutations (parent owns the data). */
  onChanged: () => Promise<void> | void;
  disabled?: boolean;
  /** Hide the built-in options toggle (the parent renders it in its own Options section). */
  hideToggle?: boolean;
  /**
   * Where the variant pricing table lives. `inline` (default) renders the
   * table inside this section; `external` renders a summary with an anchor
   * to the parent's Options & Variants section (which renders VariantManager).
   */
  variantTable?: 'inline' | 'external';
  /** Anchor id of the parent Options section (external mode only). */
  variantSectionId?: string;
};

function normalizeSlug(slug: string): string {
  return slug.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Plain-language availability from authoritative inventory numbers. */
export function availabilityLabel(onHand: number | null, reserved: number, threshold: number): string {  if (onHand === null) return 'Not stocked yet';
  const available = onHand - reserved;
  if (available <= 0) return 'Out of stock';
  if (available <= threshold) return 'Low stock';
  return 'In stock';
}

export function PricingStockSection({
  productId,
  productName,
  categoryId,
  categories,
  attributes,
  existingVariants,
  hasOptions,
  onHasOptionsChange,
  onChanged,
  disabled,
  hideToggle,
  variantTable = 'inline',
  variantSectionId = 'ws-variant',
}: PricingStockSectionProps) {
  const { notify } = useToast();
  const { confirm, dialog } = useConfirm();

  const category = categories.find((c) => c.id === categoryId) ?? null;
  const categoryCoded = !category || Boolean(category.code);
  const brandAttribute = useMemo(
    () => attributes.find((a) => normalizeSlug(a.slug) === 'BRAND') ?? null,
    [attributes],
  );

  // A simple product has zero or one persisted variant. Two or more means
  // options are in use regardless of the toggle (toggle locks on).
  const multiVariant = existingVariants.length > 1;
  const single = existingVariants[0] ?? null;
  const showSimple = !hasOptions && !multiVariant;

  const [price, setPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [stock, setStock] = useState('');
  const [brandValueId, setBrandValueId] = useState('');
  const [brandCode, setBrandCode] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill the simple form from the persisted single variant (edit mode and
  // post-save refreshes). Local edits are never clobbered mid-typing: only
  // refill when the underlying variant identity changes.
  const singleKey = single
    ? `${single.id}:${single.priceOverride ?? ''}:${single.compareAtPrice ?? ''}:${single.inventory?.quantityOnHand ?? ''}`
    : 'none';
  useEffect(() => {
    if (!single) return;
    setPrice(single.priceOverride === null || single.priceOverride === undefined ? '' : String(Number(single.priceOverride)));
    setCompareAt(
      single.compareAtPrice === null || single.compareAtPrice === undefined ? '' : String(Number(single.compareAtPrice)),
    );
    setStock(single.inventory ? String(single.inventory.quantityOnHand) : '');
    setErrors({});
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleKey]);

  const onHand = single?.inventory?.quantityOnHand ?? null;
  const reserved = single?.inventory?.quantityReserved ?? 0;
  const threshold = single?.inventory?.lowStockThreshold ?? 5;
  const available = onHand === null ? null : onHand - reserved;
  const status = availabilityLabel(onHand, reserved, threshold);

  const saveSimple = async () => {
    if (disabled || saving) return;
    setFormError(null);
    const next: Record<string, string> = {};

    const priceParsed = validatePriceInput(price);
    if (!priceParsed.ok) next.price = priceParsed.error;
    else if (priceParsed.value === null) next.price = 'Enter the selling price in KES, e.g. 2500.00.';
    else if (!(priceParsed.value > 0)) next.price = 'Enter a selling price above KES 0 — a product cannot be published without a price.';

    const compareParsed = validatePriceInput(compareAt);
    if (!compareParsed.ok) next.compareAt = compareParsed.error;

    const stockParsed = validateStockInput(stock);
    if (!stockParsed.ok) next.stock = stockParsed.error;
    else if (stockParsed.value === null) next.stock = 'Enter how many units you have in stock (0 if none yet).';

    const needsBrand = !single;
    const brandReady = Boolean(brandValueId) || brandCode.trim().length > 0;
    if (needsBrand && !brandReady) {
      next.brand = brandAttribute
        ? 'Choose the brand for this product — it becomes part of the automatic SKU.'
        : 'Enter a brand code (2–6 letters/digits, e.g. JB) — it becomes part of the automatic SKU.';
    }
    if (needsBrand && categoryId && !categoryCoded) {
      next.category =
        'This category has no dictionary code, so an SKU cannot be generated yet. Give the category a code under Catalogue → Categories → Edit (SKU code field), or move the product to a coded category.';
    }

    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFormError('Fix the highlighted fields before saving.');
      return;
    }

    const sellPrice = (priceParsed as { ok: true; value: number }).value as number;
    const prevPrice = (compareParsed as { ok: true; value: number | null }).value;
    const quantity = (stockParsed as { ok: true; value: number }).value as number;

    setSaving(true);
    try {
      if (!single) {
        // Default-variant path: empty attribute map produces the single
        // purchasable item through the existing supported workflow. No
        // product-level price column is written (BD-004).
        const payload: Parameters<typeof generateProductVariants>[1] = {
          attributes: {},
          price: sellPrice,
          dryRun: false,
        };
        if (prevPrice !== null) payload.compareAtPrice = prevPrice;
        if (brandAttribute && brandValueId) payload.brandValueId = brandValueId;
        else if (brandCode.trim()) payload.brandCode = brandCode.trim().toUpperCase();
        const result = await generateProductVariants(productId, payload);
        const createdId = result.created[0]?.id ?? null;
        if (quantity > 0) {
          // New variants start at zero on hand; initial stock is an audited
          // IN movement, never a silent overwrite.
          let targetId = createdId;
          if (!targetId) {
            const detail = await getAdminProduct(productId);
            targetId = detail.variants[0]?.id ?? null;
          }
          if (!targetId) {
            // Price saved; stock retry happens after reload from the edit page.
            setFormError('Price saved, but stock needs a retry — reload and set the stock again.');
            notify('error', 'Price saved, but stock needs a retry.');
            await onChanged();
            return;
          }
          await restockVariantsBatch({ reason: 'Initial product stock', items: [{ variantId: targetId, quantity }] });
        }
        notify('success', `Price ${formatKES(sellPrice)} saved for ${productName || 'this product'}.`);
      } else {
        const writes: Array<{ id: string; price?: number; compareAtPrice?: number | null }> = [];
        const priceChanged = sellPrice !== Number(single.priceOverride ?? NaN);
        const prevChanged =
          (prevPrice ?? null) !== (single.compareAtPrice === null ? null : Number(single.compareAtPrice));
        if (priceChanged || prevChanged) {
          writes.push({
            id: single.id,
            ...(priceChanged ? { price: sellPrice } : {}),
            ...(prevChanged ? { compareAtPrice: prevPrice } : {}),
          });
        }
        if (writes.length > 0) await batchUpdateVariants(productId, { variants: writes });
        const currentOnHand = single.inventory?.quantityOnHand ?? 0;
        if (quantity !== currentOnHand) {
          // Authorised correction path: single audited ADJUSTMENT movement.
          // Guards (no negative available) are enforced server-side.
          await adjustVariant(single.id, { delta: quantity - currentOnHand, reason: 'Product setup stock correction' });
        }
        notify('success', `Pricing & stock saved for ${productName || 'this product'}.`);
      }
      setErrors({});
      setFormError(null);
      await onChanged();
    } catch (e) {
      // Form values are preserved on failure; success is only announced
      // after the server confirms (no false success).
      const message = e instanceof Error ? e.message : 'Could not save pricing & stock.';
      setFormError(message);
      notify('error', message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (value: boolean) => {
    if (multiVariant && !value) {
      notify('info', 'This product already has multiple items — options stay on. Archive extra items to return to a single item.');
      return;
    }
    if (value === true && single && !hasOptions) {
      const proceed = await confirm({
        title: 'Add options or variations?',
        description:
          'Your current price and stock stay on the single item. You can then add options such as Size or Colour and set a price per item.',
        confirmLabel: 'Show options',
        onConfirm: () => undefined,
      });
      if (!proceed) return;
    }
    onHasOptionsChange(value);
  };

  return (
    <div className="pricing-stock">
      {dialog}
      {!hideToggle ? (
      <div className="pricing-stock__toggle" role="group" aria-label="Product options">
        <label className="facet-option" htmlFor="has-options-toggle">
          <input
            id="has-options-toggle"
            type="checkbox"
            checked={hasOptions || multiVariant}
            disabled={disabled || multiVariant || saving}
            onChange={(e) => void handleToggle(e.currentTarget.checked)}
          />
          <span>
            <strong>This product has options or variations</strong>
            <span className="muted-copy"> — e.g. Size, Colour, Shoe size, Capacity, Material. Leave off for a single item.</span>
          </span>
        </label>
        {multiVariant ? (
          <p className="muted-copy" role="note">Options are on because this product already has {existingVariants.length} items.</p>
        ) : null}
      </div>
      ) : multiVariant ? (
        <p className="muted-copy" role="note">Options are on because this product already has {existingVariants.length} items.</p>
      ) : null}

      {showSimple ? (
        <div className="pricing-stock__simple">
          <p className="muted-copy workspace-card__hint">
            Set the selling price and stock for the single purchasable item. Saving creates the item automatically —
            no variant table needed. Prices are in Kenya shillings (KES).
          </p>
          {formError ? (
            <div className="error-message" role="alert"><strong>{formError}</strong></div>
          ) : null}
          <div className="form-grid">
            <label htmlFor="pricing-price">
              <span>Selling price (KES) *</span>
              <input
                id="pricing-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 2500.00"
                value={price}
                disabled={disabled || saving}
                onChange={(e) => setPrice(e.currentTarget.value)}
                aria-invalid={Boolean(errors.price)}
                aria-describedby={errors.price ? 'pricing-price-error' : undefined}
              />
              {errors.price ? <span id="pricing-price-error" className="field-error" role="alert">{errors.price}</span> : null}
            </label>
            <label htmlFor="pricing-compare">
              <span>Previous price (KES) — optional</span>
              <input
                id="pricing-compare"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder="e.g. 3200.00 for a sale"
                value={compareAt}
                disabled={disabled || saving}
                onChange={(e) => setCompareAt(e.currentTarget.value)}
                aria-invalid={Boolean(errors.compareAt)}
                aria-describedby={errors.compareAt ? 'pricing-compare-error' : 'pricing-compare-hint'}
              />
              {errors.compareAt ? (
                <span id="pricing-compare-error" className="field-error" role="alert">{errors.compareAt}</span>
              ) : (
                <span id="pricing-compare-hint" className="muted-copy">
                  Only shown crossed-out when higher than the selling price. Leave empty when there is no sale.
                </span>
              )}
            </label>
            <label htmlFor="pricing-stock">
              <span>Quantity in stock *</span>
              <input
                id="pricing-stock"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="e.g. 20"
                value={stock}
                disabled={disabled || saving}
                onChange={(e) => setStock(e.currentTarget.value)}
                aria-invalid={Boolean(errors.stock)}
                aria-describedby={errors.stock ? 'pricing-stock-error' : undefined}
              />
              {errors.stock ? <span id="pricing-stock-error" className="field-error" role="alert">{errors.stock}</span> : null}
            </label>
            {!single ? (
              brandAttribute ? (
                <label htmlFor="pricing-brand">
                  <span>Brand *</span>
                  <select
                    id="pricing-brand"
                    value={brandValueId}
                    disabled={disabled || saving}
                    onChange={(e) => setBrandValueId(e.currentTarget.value)}
                    aria-invalid={Boolean(errors.brand)}
                  >
                    <option value="">Select brand</option>
                    {brandAttribute.values.map((v) => (
                      <option key={v.id} value={v.id}>{v.value}</option>
                    ))}
                  </select>
                  {errors.brand ? <span className="field-error" role="alert">{errors.brand}</span> : null}
                </label>
              ) : (
                <label htmlFor="pricing-brand-code">
                  <span>Brand code *</span>
                  <input
                    id="pricing-brand-code"
                    type="text"
                    maxLength={6}
                    placeholder="e.g. JB"
                    value={brandCode}
                    disabled={disabled || saving}
                    onChange={(e) => setBrandCode(e.currentTarget.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    aria-invalid={Boolean(errors.brand)}
                  />
                  {errors.brand ? <span className="field-error" role="alert">{errors.brand}</span> : null}
                </label>
              )
            ) : null}
          </div>
          {errors.category ? <p className="error-message" role="alert">{errors.category}</p> : null}

          <dl className="media-meta" aria-label="Item summary">
            <dt>SKU</dt>
            <dd>{single ? <code>{single.sku}</code> : 'Generated automatically when you save.'}</dd>
            <dt>Availability</dt>
            <dd>
              <strong>{status}</strong>
              {available !== null ? <span className="muted-copy"> — {available.toLocaleString('en-KE')} available</span> : null}
            </dd>
          </dl>
          <p className="muted-copy" role="note">
            Available stock = units on hand minus reservations for open orders. Reservations are handled automatically
            at checkout — stock here is never edited directly. {single ? 'SKU is server-generated and cannot be changed.' : null}
          </p>

          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={disabled || saving}
              onClick={() => void saveSimple()}
              aria-busy={saving}
            >
              <JBIcon name="check" size={16} /> {saving ? 'Saving…' : single ? 'Save price & stock' : 'Save price & create item'}
            </button>
            {single?.inventory ? (
              <Link href="/admin/inventory" className="button button--secondary">Open Inventory</Link>
            ) : null}
          </div>
        </div>
      ) : variantTable === 'external' ? (
        <div className="pricing-stock__matrix">
          <p className="muted-copy workspace-card__hint">
            This product has {existingVariants.length} items. Set each selling price (KES) and stock in{' '}
            <a href={`#${variantSectionId}`}>Options &amp; Variants below</a>.
          </p>
          <ul className="pill-nav" aria-label="Item price summary">
            {existingVariants.slice(0, 12).map((v) => (
              <li key={v.id}>
                <span>
                  {v.variantAttributeValues.map((m) => m.attributeValue.value).join(' / ') || v.name || v.sku}:{' '}
                  {v.priceOverride === null || v.priceOverride === undefined ? 'no price yet' : formatKES(Number(v.priceOverride))}
                </span>
              </li>
            ))}
          </ul>
          {existingVariants.length > 12 ? (
            <p className="muted-copy">Showing 12 of {existingVariants.length} items — the full table is below.</p>
          ) : null}
        </div>
      ) : (
        <div className="pricing-stock__matrix">
          <p className="muted-copy workspace-card__hint">
            Set a selling price (KES) for each item below. Stock uses audited inventory movements — the table edits
            price and stock per row and saves only after the server confirms.
          </p>
          <VariantManager
            productId={productId}
            productName={productName}
            categoryId={categoryId}
            basePrice={null}
            categories={categories}
            attributes={attributes}
            existingVariants={existingVariants}
            onChanged={onChanged}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Standalone options toggle for the parent Options & Variants section.
 * Shares the same plain-language contract as the in-section toggle; the
 * parent owns `hasOptions` state so Pricing & Stock and Options stay in sync.
 */
export function OptionsToggle({
  id,
  checked,
  disabled,
  locked,
  lockedCount,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  locked?: boolean;
  lockedCount?: number;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="pricing-stock__toggle">
      <label className="facet-option" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled || locked}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        <span>
          <strong>This product has options or variations</strong>
          <span className="muted-copy"> — e.g. Size, Colour, Shoe size, Capacity, Material. Leave off for a single item.</span>
        </span>
      </label>
      {locked ? (
        <p className="muted-copy" role="note">Options are on because this product already has {lockedCount ?? 0} items.</p>
      ) : null}
    </div>
  );
}
