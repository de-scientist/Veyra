/**
 * VariantPersistenceService (Phase 2).
 *
 * Record loading + transactional persistence for the variant generation
 * engine. Planning stays pure in `./variant-generation.ts`; this module
 * owns Prisma access and follows the project's transaction conventions
 * (single `prisma.$transaction`, variant + mappings + zeroed inventory
 * persisted atomically, DB unique constraints as final authority).
 *
 * Order safety: variants are only ever created or left untouched here.
 * Archival/deletion is out of scope — use the existing variant PATCH
 * endpoint (ARCHIVED) so historical orders stay traceable.
 */

import { Prisma } from '@prisma/client';

import { HttpError } from './errors.js';
import { prisma } from './prisma.js';
import { normalizeSku, skuConflictFromPrismaTarget } from './sku.js';
import {
  isGenerationIssues,
  planGenerationFromRecords,
  summarizeResult,
  type ExistingVariantRecord,
  type GenerationIssue,
  type PlanGenerationInput,
  type PlanGenerationRecords,
  type PlannedCombination,
  type VariantSummary,
} from './variant-generation.js';

function toHttpError(issues: GenerationIssue[]): HttpError {
  const first = issues[0] ?? { code: 'INVALID_GENERATION_REQUEST', message: 'Invalid variant generation request.' };
  return new HttpError(400, first.code, first.message, { issues });
}

async function loadRecords(productId: string): Promise<{ product: { id: string; name: string; status: string; styleCode: string | null; category: { slug: string; code: string | null; skuTemplate: string | null; skuTemplateVersion: number } | null }; records: PlanGenerationRecords }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: { select: { slug: true, code: true, skuTemplate: true, skuTemplateVersion: true } } },
  });
  if (!product || product.deletedAt) {
    throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found.');
  }
  if (product.status === 'ARCHIVED') {
    throw new HttpError(409, 'PRODUCT_ARCHIVED', 'This product is archived and cannot gain new variants. Restore it first.');
  }

  const [attributes, values, existing] = await Promise.all([
    prisma.attribute.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } }),
    prisma.attributeValue.findMany({ select: { id: true, attributeId: true, value: true, code: true } }),
    prisma.productVariant.findMany({
      where: { productId },
      select: {
        id: true,
        sku: true,
        status: true,
        variantAttributeValues: { select: { attributeId: true, attributeValueId: true } },
      },
    }),
  ]);

  const existingVariants: ExistingVariantRecord[] = existing.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    status: variant.status,
    mappings: variant.variantAttributeValues.map((mapping) => ({
      attributeId: mapping.attributeId,
      attributeValueId: mapping.attributeValueId,
    })),
  }));

  return {
    product: {
      id: product.id,
      name: product.name,
      status: product.status,
      styleCode: product.styleCode,
      category: product.category,
    },
    records: {
      productName: product.name,
      styleCode: product.styleCode,
      categorySlug: product.category?.slug ?? null,
      categoryCode: product.category?.code ?? null,
      categoryTemplate: product.category?.skuTemplate ?? null,
      attributes,
      values,
      existingVariants,
    },
  };
}

function summaryOf(
  item: PlannedCombination,
  records: PlanGenerationRecords,
  id: string | null,
): VariantSummary {
  const valueById = new Map(records.values.map((value) => [value.id, value]));
  const attrById = new Map(records.attributes.map((attr) => [attr.id, attr]));
  const attributes: Record<string, string> = {};
  for (const pair of item.pairs) {
    const attr = attrById.get(pair.attributeId);
    const resolved = valueById.get(pair.attributeValueId);
    if (attr && resolved) attributes[attr.name] = resolved.value;
  }
  return { id, sku: item.sku, attributes };
}

function planOrThrow(productId: string, input: PlanGenerationInput, records: PlanGenerationRecords) {
  try {
    return planGenerationFromRecords(productId, input, records);
  } catch (error) {
    if (isGenerationIssues(error)) throw toHttpError(error.issues);
    throw error;
  }
}

/**
 * Dry run: validate + plan + detect existing/colliding variants without
 * writing anything. Powers admin SKU preview (Phase 3 seam).
 */
export async function previewVariantGeneration(productId: string, input: PlanGenerationInput) {
  const { records } = await loadRecords(productId);
  const { planned, skippedPlanned } = planOrThrow(productId, input, records);

  const existingKeys = new Map(records.existingVariants.map((variant) => [variantKey(productId, variant.mappings), variant]));
  const skus = planned.map((item) => item.sku);
  const clashes = skus.length
    ? await prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { id: true, sku: true, productId: true } })
    : [];
  const clashBySku = new Map(clashes.map((row) => [normalizeSku(row.sku), row]));

  const created: VariantSummary[] = [];
  const existing: VariantSummary[] = [];
  const errors: GenerationIssue[] = [];
  for (const item of planned) {
    const match = existingKeys.get(item.key);
    if (match) {
      existing.push(summaryOf(item, records, match.id));
      continue;
    }
    const clash = clashBySku.get(normalizeSku(item.sku));
    if (clash) {
      errors.push({
        code: 'SKU_ALREADY_EXISTS',
        message: `Generated SKU ${item.sku} already belongs to another variant${clash.productId === productId ? ' of this product' : ''}. Correct the conflicting codes or use a distinct style/model code.`,
      });
      continue;
    }
    created.push(summaryOf(item, records, null));
  }
  return summarizeResult({
    created,
    existing,
    skipped: skippedPlanned.map((item) => summaryOf(item, records, null)),
    errors,
  });
}

function variantKey(productId: string, mappings: Array<{ attributeId: string; attributeValueId: string }>): string {
  const parts = mappings.map((mapping) => `${mapping.attributeId}:${mapping.attributeValueId}`).sort();
  return `${productId}|${parts.join('|')}`;
}

/**
 * Live generation: all-or-nothing persistence. Existing combinations are
 * reported (never duplicated); foreign SKU collisions abort with 409 and
 * roll back; otherwise every new variant (+ mappings + zeroed inventory +
 * audit entries) commits in one transaction.
 */
export async function generateProductVariants(productId: string, input: PlanGenerationInput, actorId: string) {
  const { product, records } = await loadRecords(productId);
  const { planned, skippedPlanned, template, singleVariant } = planOrThrow(productId, input, records);

  const existingByKey = new Map(records.existingVariants.map((variant) => [variantKey(productId, variant.mappings), variant]));
  const toCreate: PlannedCombination[] = [];
  const existing: VariantSummary[] = [];
  for (const item of planned) {
    const match = existingByKey.get(item.key);
    if (match) existing.push(summaryOf(item, records, match.id));
    else toCreate.push(item);
  }

  // Pre-flight foreign-SKU check for an actionable 409 before writing.
  // The DB unique constraint remains the final authority for races.
  if (toCreate.length > 0) {
    const clashes = await prisma.productVariant.findMany({
      where: { sku: { in: toCreate.map((item) => item.sku) } },
      select: { sku: true, productId: true },
    });
    if (clashes.length > 0) {
      const clash = clashes[0] as { sku: string; productId: string };
      throw new HttpError(
        409,
        'SKU_ALREADY_EXISTS',
        `Generated SKU ${clash.sku} already belongs to another variant${clash.productId === productId ? ' of this product with different attributes' : ''}. Correct the conflicting codes or use a distinct style/model code.`,
      );
    }
  }

  const created: VariantSummary[] = [];
  if (toCreate.length > 0) {
    try {
      const persisted = await prisma.$transaction(async (client) => {
        const rows: Array<{ id: string; sku: string }> = [];
        const markDefault = singleVariant && records.existingVariants.length === 0;
        for (const item of toCreate) {
          const variant = await client.productVariant.create({
            data: {
              productId,
              sku: item.sku,
              // Single-variant products inherit the product name; matrix
              // variants use the combination label (e.g. `Black / M`).
              name: item.label,
              status: 'ACTIVE',
              // Pricing is inherited (null override => product basePrice) or
              // set explicitly per request; stock always starts at zero.
              priceOverride: input.price ?? null,
              compareAtPrice: input.compareAtPrice ?? null,
              isDefault: markDefault,
              skuTemplateVersion: product.category?.skuTemplateVersion ?? 1,
            },
            select: { id: true, sku: true },
          });
          for (const pair of item.pairs) {
            await client.variantAttributeValue.create({
              data: { variantId: variant.id, attributeId: pair.attributeId, attributeValueId: pair.attributeValueId },
            });
          }
          await client.inventory.create({
            data: { variantId: variant.id, quantityOnHand: 0, quantityReserved: 0, lowStockThreshold: 5 },
          });
          await client.auditLog.create({
            data: {
              actorId,
              action: 'VARIANT_CREATED',
              entity: 'ProductVariant',
              entityId: variant.id,
              after: { sku: variant.sku, template } as Prisma.InputJsonValue,
            },
          });
          rows.push(variant);
        }
        return rows;
      });
      const bySku = new Map(persisted.map((row) => [row.sku, row.id]));
      for (const item of toCreate) created.push(summaryOf(item, records, bySku.get(item.sku) ?? null));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const mapped = skuConflictFromPrismaTarget(error.meta?.target);
        if (mapped) throw new HttpError(409, mapped.code, mapped.message);
        throw new HttpError(409, 'ALREADY_EXISTS', 'A record with these unique details already exists.');
      }
      throw error;
    }
  }

  return summarizeResult({
    created,
    existing,
    skipped: skippedPlanned.map((item) => summaryOf(item, records, null)),
    errors: [],
  });
}
