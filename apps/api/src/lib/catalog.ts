export type CatalogProductVariantInput = {
  sku: string;
  price: number;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  attributeValues: Array<{ attributeId: string; value: string }>;
};

export type CatalogProductInput = {
  name: string;
  slug?: string;
  categoryId?: string;
  description?: string;
  variants: CatalogProductVariantInput[];
  images: Array<{ url: string; altText?: string }>;
};

export function generateSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

export function validateVariantCombination(
  attributeValues: Array<{ attributeId: string; value: string }>,
  productId?: string,
): { ok: true } | { ok: false; errors: string[] } {
  const seen = new Map<string, string>();
  const errors: string[] = [];

  for (const attributeValue of attributeValues) {
    const key = `${attributeValue.attributeId}:${attributeValue.value}`;
    if (seen.has(key)) {
      errors.push(`Duplicate attribute combination detected for ${attributeValue.attributeId}.`);
      continue;
    }
    seen.set(key, attributeValue.value);
  }

  if (attributeValues.length === 0) {
    errors.push('Variant must include at least one attribute value.');
  }

  if (productId && attributeValues.length === 0) {
    errors.push('Product requires at least one variant attribute.');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

export function validateCatalogProduct(product: CatalogProductInput): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (!product.name || product.name.trim().length < 2) {
    errors.push('Product name is required.');
  }

  if (!product.slug && !product.name) {
    errors.push('Product slug is required.');
  }

  if (!product.categoryId) {
    errors.push('Product category is required.');
  }

  if (!product.description || product.description.trim().length < 12) {
    errors.push('Product description is required.');
  }

  if (!product.variants.length) {
    errors.push('At least one active variant is required before publishing.');
  }

  const activeVariants = product.variants.filter((variant) => variant.status === 'ACTIVE');
  if (activeVariants.length === 0) {
    errors.push('At least one active variant is required before publishing.');
  }

  for (const variant of activeVariants) {
    if (!variant.sku || variant.sku.trim().length < 3) {
      errors.push('Each active variant must have a valid SKU.');
    }

    if (variant.price <= 0) {
      errors.push('Each active variant must have a valid price.');
    }

    const attrCheck = validateVariantCombination(variant.attributeValues, product.slug);
    if (!attrCheck.ok) {
      errors.push(...attrCheck.errors);
    }
  }

  if (product.images.length === 0) {
    errors.push('Product media is required before publishing.');
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export type PublishReadinessIssue = {
  field: string;
  code: string;
  message: string;
};

export type PublishReadinessInput = {
  name: string;
  slug?: string;
  categoryId?: string;
  description?: string;
  variants: CatalogProductVariantInput[];
  imageCount: number;
  hasPrimaryImage: boolean;
};

/**
 * Authoritative publish-readiness definition (Objective A).
 * The PATCH/POST product routes enforce this before any transition into
 * ACTIVE; the web `publishChecklist` is a UX mirror only. Variant-creation
 * gating keeps using `validateCatalogProduct` (single-variant pre-checks,
 * different purpose) — publish decisions always flow through here.
 */
export function checkPublishReadiness(input: PublishReadinessInput): PublishReadinessIssue[] {
  const issues: PublishReadinessIssue[] = [];

  if (!input.name || input.name.trim().length < 2) {
    issues.push({ field: 'name', code: 'NAME_REQUIRED', message: 'Product name is required.' });
  }
  if (!input.slug || input.slug.trim().length < 2) {
    issues.push({ field: 'slug', code: 'SLUG_REQUIRED', message: 'Product slug is required.' });
  }
  if (!input.categoryId) {
    issues.push({ field: 'categoryId', code: 'CATEGORY_REQUIRED', message: 'Product category is required.' });
  }
  if (!input.description || input.description.trim().length < 12) {
    issues.push({ field: 'description', code: 'DESCRIPTION_REQUIRED', message: 'Product description is required.' });
  }

  const activeVariants = input.variants.filter((variant) => variant.status === 'ACTIVE');
  if (activeVariants.length === 0) {
    issues.push({ field: 'variants', code: 'NO_ACTIVE_VARIANT', message: 'At least one active variant is required.' });
  }

  const seenCombinations = new Set<string>();
  activeVariants.forEach((variant, index) => {
    const field = `variants[${index}]`;
    if (!variant.sku || variant.sku.trim().length < 3) {
      issues.push({ field: `${field}.sku`, code: 'INVALID_SKU', message: 'Each active variant must have a valid SKU.' });
    }
    if (!(variant.price > 0)) {
      issues.push({ field: `${field}.price`, code: 'INVALID_PRICE', message: 'Each active variant must have a valid price.' });
    }
    const attrCheck = validateVariantCombination(variant.attributeValues);
    if (!attrCheck.ok) {
      issues.push({ field: `${field}.attributes`, code: 'MISSING_ATTRIBUTES', message: 'Each active variant must include at least one attribute value.' });
    } else {
      const comboKey = variant.attributeValues
        .map((entry) => `${entry.attributeId}:${entry.value}`)
        .sort()
        .join('|');
      if (seenCombinations.has(comboKey)) {
        issues.push({ field: `${field}.attributes`, code: 'DUPLICATE_VARIANT_COMBINATION', message: 'Duplicate variant attribute combination.' });
      } else {
        seenCombinations.add(comboKey);
      }
    }
  });

  if (input.imageCount === 0) {
    issues.push({ field: 'images', code: 'NO_IMAGES', message: 'Product media is required before publishing.' });
  } else if (!input.hasPrimaryImage) {
    issues.push({ field: 'images', code: 'NO_PRIMARY_IMAGE', message: 'A primary product image is required.' });
  }

  return issues;
}

export function calculateAvailableQuantity(quantityOnHand: number, quantityReserved: number): number {
  return Math.max(quantityOnHand - quantityReserved, 0);
}

export function isLowStock(quantityOnHand: number, lowStockThreshold: number): boolean {
  return quantityOnHand <= lowStockThreshold;
}

export function validateInventoryAdjustment(
  currentQuantity: number,
  delta: number,
): { ok: true; newQuantity: number } | { ok: false; errors: string[] } {
  if (delta === 0) {
    return { ok: false, errors: ['Inventory adjustment must change the stock quantity.'] };
  }

  const newQuantity = currentQuantity + delta;

  if (newQuantity < 0) {
    return { ok: false, errors: ['Inventory cannot be negative.'] };
  }

  return { ok: true, newQuantity };
}
