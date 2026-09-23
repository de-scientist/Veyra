import { z } from 'zod';

/**
 * Frontend mirror of the backend publish-readiness rules
 * (`apps/api/src/lib/catalog.ts` validateCatalogProduct + productSchema).
 * The backend remains authoritative; this helper only drives the
 * Review & Publish checklist UX.
 */

export const productDraftSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(200),
  slug: z.string().trim().min(2, 'Slug must be at least 2 characters.').max(220).optional().or(z.literal('')),
  description: z.string().trim().min(12, 'Description must be at least 12 characters.').max(10000),
  categoryId: z.string().min(1, 'Choose a category.'),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
});

export type ProductDraftInput = z.infer<typeof productDraftSchema>;

export const firstVariantSchema = z.object({
  sku: z.string().trim().min(3, 'SKU must be at least 3 characters.').max(64),
  name: z.string().trim().max(200).optional().or(z.literal('')),
  price: z.coerce.number().min(0, 'Enter a valid non-negative price.'),
  compareAtPrice: z.coerce.number().min(0).optional(),
  attributeId: z.string().min(1, 'Choose an attribute — the backend requires at least one per variant.'),
  attributeValue: z.string().trim().min(1, 'Enter the attribute value (e.g. Large).').max(120),
});

export type FirstVariantInput = z.infer<typeof firstVariantSchema>;

/** Matches backend generateSlug (apps/api/src/lib/catalog.ts). */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/--+/g, '-');
}

export type PublishChecklistItem = { key: string; label: string; ok: boolean; hint?: string };

export function publishChecklist(input: {
  name: string;
  slug: string;
  categoryId: string;
  description: string;
  variantCount: number;
  imageCount: number;
}): PublishChecklistItem[] {
  return [
    { key: 'name', label: 'Product name (min 2 characters)', ok: input.name.trim().length >= 2 },
    { key: 'slug', label: 'URL slug', ok: (input.slug.trim() || slugify(input.name)).length >= 2 },
    { key: 'category', label: 'Category assigned', ok: input.categoryId.length > 0 },
    { key: 'description', label: 'Description (min 12 characters)', ok: input.description.trim().length >= 12 },
    {
      key: 'variant',
      label: 'At least one purchasable variant (SKU, price, attribute)',
      ok: input.variantCount > 0,
      hint: input.variantCount === 0 ? 'Add the first variant after the draft is created.' : undefined,
    },
    {
      key: 'media',
      label: 'At least one product image',
      ok: input.imageCount > 0,
      hint: input.imageCount === 0 ? 'Upload images with the signed Cloudinary workflow after the draft is created.' : undefined,
    },
  ];
}
