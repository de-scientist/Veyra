import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../app.js';
import { hashPassword, hashToken } from '../lib/auth.js';
import { prisma } from '../lib/prisma.js';

let app: FastifyInstance;

const stamp = `vg${Date.now().toString(36)}`;
const emails = { customer: `${stamp}-c@example.com`, staff: `${stamp}-s@example.com` };
const cookies: Record<string, string> = {};
const createdUserIds: string[] = [];
const createdProductIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdAttributeIds: string[] = [];

async function createUser(email: string, roleSlug: string) {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword('password123'), firstName: 'Vg', lastName: roleSlug, status: 'ACTIVE' },
  });
  createdUserIds.push(user.id);
  const role = await prisma.role.upsert({ where: { slug: roleSlug }, update: {}, create: { name: roleSlug, slug: roleSlug } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const rawToken = crypto.randomUUID();
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(rawToken), expiresAt: new Date(Date.now() + 3600000) },
  });
  cookies[email] = `veyra_session=${rawToken}`;
}

async function call(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, email: string | null, payload?: Record<string, unknown>) {
  return app.inject({ method, url, payload, headers: email ? { cookie: cookies[email] } : {} });
}

type Fixture = {
  productId: string;
  categoryCode: string;
  styleCode: string;
  attrs: Record<string, { id: string; values: Record<string, string> }>;
};

let codeCounter = 0;
function uniqueCode(): string {
  codeCounter += 1;
  return `V${Date.now().toString(36).toUpperCase().slice(-3)}${codeCounter}`.slice(0, 5);
}

async function buildFixture(options: {
  key: string;
  template: string;
  styleCode: string;
  attributes: Record<string, Array<{ value: string; code: string }>>;
}): Promise<Fixture> {
  const category = await prisma.category.create({
    data: {
      name: `Vg ${options.key} ${stamp}`,
      slug: `vg-${stamp}-${options.key}`,
      status: 'ACTIVE',
      code: uniqueCode(),
      skuTemplate: options.template,
    },
  });
  createdCategoryIds.push(category.id);
  const attrs: Fixture['attrs'] = {};
  for (const [name, values] of Object.entries(options.attributes)) {
    const attribute = await prisma.attribute.create({
      data: { name: `${name} ${stamp} ${options.key}`, slug: `vg-${stamp}-${options.key}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, type: 'STRING' },
    });
    createdAttributeIds.push(attribute.id);
    const ids: Record<string, string> = {};
    for (const { value, code } of values) {
      const created = await prisma.attributeValue.create({ data: { attributeId: attribute.id, value, code } });
      ids[value] = created.id;
    }
    attrs[name] = { id: attribute.id, values: ids };
  }
  const product = await prisma.product.create({
    data: {
      name: `Vg Product ${options.key} ${stamp}`,
      slug: `vg-${stamp}-${options.key}`,
      description: 'Variant generation engine fixture product.',
      status: 'DRAFT',
      basePrice: 1000,
      categoryId: category.id,
      styleCode: options.styleCode,
    },
  });
  createdProductIds.push(product.id);
  return { productId: product.id, categoryCode: category.code as string, styleCode: options.styleCode, attrs };
}

beforeAll(async () => {
  app = await buildApp();
  await createUser(emails.customer, 'customer');
  await createUser(emails.staff, 'staff');
}, 60000);

afterAll(async () => {
  const variantIds = (await prisma.productVariant.findMany({ where: { productId: { in: createdProductIds } }, select: { id: true } })).map(
    (row) => row.id,
  );
  if (variantIds.length) {
    await prisma.auditLog.deleteMany({ where: { entity: 'ProductVariant', entityId: { in: variantIds } } });
    await prisma.inventory.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.variantAttributeValue.deleteMany({ where: { variantId: { in: variantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  }
  await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await prisma.attributeValue.deleteMany({ where: { attributeId: { in: createdAttributeIds } } });
  await prisma.attribute.deleteMany({ where: { id: { in: createdAttributeIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: createdUserIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
});

describe('variant generation engine', () => {
  it('denies customers (RBAC preserved)', async () => {
    const response = await call('POST', '/api/v1/admin/products/x/variants/generate', emails.customer, { attributes: {} });
    expect(response.statusCode).toBe(403);
  });

  it('generates clothing variants (2 colors x 3 sizes) with deterministic SKUs', async () => {
    const fixture = await buildFixture({
      key: 'clothing',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}C`.slice(0, 8),
      attributes: {
        Color: [{ value: 'Black', code: 'BLK' }, { value: 'White', code: 'WHT' }],
        Size: [{ value: 'S', code: 'S' }, { value: 'M', code: 'M' }, { value: 'L', code: 'L' }],
      },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const size = fixture.attrs.Size as { id: string; values: Record<string, string> };
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string, color.values.White as string], [size.id]: [size.values.S as string, size.values.M as string, size.values.L as string] },
      brandCode: 'NKE',
      price: 2500,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { data: { created: Array<{ sku: string }>; existing: unknown[]; skipped: unknown[]; errors: unknown[]; summary: { created: number } } };
    expect(body.data.summary.created).toBe(6);
    expect(body.data.created.map((row) => row.sku)).toEqual([
      `NKE-${fixture.categoryCode}-${fixture.styleCode}-BLK-S`,
      `NKE-${fixture.categoryCode}-${fixture.styleCode}-BLK-M`,
      `NKE-${fixture.categoryCode}-${fixture.styleCode}-BLK-L`,
      `NKE-${fixture.categoryCode}-${fixture.styleCode}-WHT-S`,
      `NKE-${fixture.categoryCode}-${fixture.styleCode}-WHT-M`,
      `NKE-${fixture.categoryCode}-${fixture.styleCode}-WHT-L`,
    ]);
    // Identity rows, pricing and zeroed inventory persist with each variant.
    const stored = await prisma.productVariant.findMany({
      where: { productId: fixture.productId },
      include: { inventory: true, variantAttributeValues: true },
    });
    expect(stored).toHaveLength(6);
    for (const variant of stored) {
      expect(Number(variant.priceOverride)).toBe(2500);
      expect(variant.inventory?.quantityOnHand).toBe(0);
      expect(variant.inventory?.quantityReserved).toBe(0);
      expect(variant.variantAttributeValues).toHaveLength(2);
    }

    // Idempotency: repeating the request creates nothing.
    const rerun = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string, color.values.White as string], [size.id]: [size.values.S as string, size.values.M as string, size.values.L as string] },
      brandCode: 'NKE',
      price: 2500,
    });
    const rerunBody = rerun.json() as { data: { summary: { created: number; existing: number } } };
    expect(rerunBody.data.summary.created).toBe(0);
    expect(rerunBody.data.summary.existing).toBe(6);

    // Incremental add: only the genuinely new combination is created.
    const xl = await prisma.attributeValue.create({ data: { attributeId: size.id, value: 'XL', code: 'XL' } });
    const add = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string], [size.id]: [xl.id] },
      brandCode: 'NKE',
      price: 2500,
    });
    expect((add.json() as { data: { summary: { created: number; existing: number } } }).data.summary).toMatchObject({ created: 1, existing: 0 });

    // Archived variants are still detected (never duplicated, never deleted).
    const victim = await prisma.productVariant.findFirstOrThrow({ where: { productId: fixture.productId, sku: `NKE-${fixture.categoryCode}-${fixture.styleCode}-BLK-S` } });
    await prisma.productVariant.update({ where: { id: victim.id }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
    const afterArchive = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string], [size.id]: [size.values.S as string] },
      brandCode: 'NKE',
    });
    expect((afterArchive.json() as { data: { summary: { created: number; existing: number } } }).data.summary).toMatchObject({ created: 0, existing: 1 });
  });

  it('generates shoe variants through the scoped shoe-size attribute', async () => {
    const fixture = await buildFixture({
      key: 'shoes',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}S`.slice(0, 8),
      attributes: {
        Color: [{ value: 'Black', code: 'BLK' }, { value: 'White', code: 'WHT' }],
        'Shoe Size': [{ value: '40', code: '40' }, { value: '41', code: '41' }, { value: '42', code: '42' }, { value: '43', code: '43' }],
      },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const shoeSize = fixture.attrs['Shoe Size'] as { id: string; values: Record<string, string> };
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: {
        [color.id]: [color.values.Black as string, color.values.White as string],
        [shoeSize.id]: [shoeSize.values['40'] as string, shoeSize.values['41'] as string, shoeSize.values['42'] as string, shoeSize.values['43'] as string],
      },
      brandCode: 'ADI',
    });
    const body = response.json() as { data: { summary: { created: number }; created: Array<{ sku: string }> } };
    expect(response.statusCode).toBe(200);
    expect(body.data.summary.created).toBe(8);
    expect(body.data.created[0]?.sku).toBe(`ADI-${fixture.categoryCode}-${fixture.styleCode}-BLK-40`);
  });

  it('generates appliance (power + color) and utensil (material + pack) variants', async () => {
    const appliance = await buildFixture({
      key: 'appliance',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}A`.slice(0, 8),
      attributes: {
        Power: [{ value: '500W', code: '500W' }, { value: '1500W', code: '1500W' }],
        Color: [{ value: 'Black', code: 'BLK' }, { value: 'White', code: 'WHT' }],
      },
    });
    const power = appliance.attrs.Power as { id: string; values: Record<string, string> };
    const appColor = appliance.attrs.Color as { id: string; values: Record<string, string> };
    const appResponse = await call('POST', `/api/v1/admin/products/${appliance.productId}/variants/generate`, emails.staff, {
      attributes: { [power.id]: [power.values['500W'] as string, power.values['1500W'] as string], [appColor.id]: [appColor.values.Black as string, appColor.values.White as string] },
      brandCode: 'JB',
    });
    expect((appResponse.json() as { data: { summary: { created: number } } }).data.summary.created).toBe(4);

    const utensil = await buildFixture({
      key: 'utensil',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}U`.slice(0, 8),
      attributes: {
        Material: [{ value: 'Stainless steel', code: 'SST' }, { value: 'Silicone', code: 'SIL' }],
        Pack: [{ value: '6PC', code: '6PC' }, { value: '12PC', code: '12PC' }],
      },
    });
    const material = utensil.attrs.Material as { id: string; values: Record<string, string> };
    const pack = utensil.attrs.Pack as { id: string; values: Record<string, string> };
    const utenResponse = await call('POST', `/api/v1/admin/products/${utensil.productId}/variants/generate`, emails.staff, {
      attributes: { [material.id]: [material.values['Stainless steel'] as string, material.values.Silicone as string], [pack.id]: [pack.values['6PC'] as string, pack.values['12PC'] as string] },
      brandCode: 'JB',
    });
    const utenBody = utenResponse.json() as { data: { summary: { created: number }; created: Array<{ sku: string }> } };
    expect(utenBody.data.summary.created).toBe(4);
    expect(utenBody.data.created.map((row) => row.sku)).toContain(`JB-${utensil.categoryCode}-${utensil.styleCode}-SST-6PC`);
  });

  it('creates a single default variant when no attributes are selected', async () => {
    const fixture = await buildFixture({
      key: 'single',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}1`.slice(0, 8),
      attributes: { Color: [{ value: 'Silver', code: 'SLV' }] },
    });
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: {},
      brandCode: 'GEN',
    });
    const body = response.json() as { data: { summary: { created: number }; created: Array<{ sku: string }> } };
    expect(response.statusCode).toBe(200);
    expect(body.data.summary.created).toBe(1);
    expect(body.data.created[0]?.sku).toBe(`GEN-${fixture.categoryCode}-${fixture.styleCode}`);
    const stored = await prisma.productVariant.findFirstOrThrow({ where: { productId: fixture.productId } });
    expect(stored.isDefault).toBe(true);
    expect(stored.skuTemplateVersion).toBe(1);
  });

  it('previews SKUs with dryRun without persisting anything', async () => {
    const fixture = await buildFixture({
      key: 'dryrun',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}D`.slice(0, 8),
      attributes: { Color: [{ value: 'Red', code: 'RED' }], Size: [{ value: 'M', code: 'M' }] },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const size = fixture.attrs.Size as { id: string; values: Record<string, string> };
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Red as string], [size.id]: [size.values.M as string] },
      brandCode: 'NKE',
      dryRun: true,
    });
    const body = response.json() as { data: { summary: { created: number }; created: Array<{ sku: string; id: null }> } };
    expect(response.statusCode).toBe(200);
    expect(body.data.summary.created).toBe(1);
    expect(body.data.created[0]?.id).toBeNull();
    expect(await prisma.productVariant.count({ where: { productId: fixture.productId } })).toBe(0);
  });

  it('deduplicates repeated values and restricts to explicit allow-lists', async () => {
    const fixture = await buildFixture({
      key: 'allowlist',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}W`.slice(0, 8),
      attributes: { Color: [{ value: 'Black', code: 'BLK' }, { value: 'White', code: 'WHT' }], Size: [{ value: 'S', code: 'S' }, { value: 'M', code: 'M' }] },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const size = fixture.attrs.Size as { id: string; values: Record<string, string> };
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: {
        [color.id]: [color.values.Black as string, color.values.Black as string, color.values.White as string],
        [size.id]: [size.values.S as string, size.values.M as string, size.values.M as string],
      },
      allowList: [
        { [color.id]: color.values.Black as string, [size.id]: size.values.S as string },
        { [color.id]: color.values.White as string, [size.id]: size.values.M as string },
      ],
      brandCode: 'NKE',
    });
    const body = response.json() as { data: { summary: { created: number; skipped: number } } };
    expect(response.statusCode).toBe(200);
    expect(body.data.summary).toMatchObject({ created: 2, skipped: 2 });
  });

  it('rejects invalid generation requests with actionable codes', async () => {
    const fixture = await buildFixture({
      key: 'errors',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}E`.slice(0, 8),
      attributes: { Color: [{ value: 'Black', code: 'BLK' }], Size: [{ value: 'S', code: 'S' }], Fit: [{ value: 'Regular', code: 'REG' }] },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const fit = fixture.attrs.Fit as { id: string; values: Record<string, string> };

    const missing = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string] },
      brandCode: 'NKE',
    });
    expect(missing.statusCode).toBe(400);
    expect((missing.json() as { error: { code: string } }).error.code).toBe('MISSING_REQUIRED_DIMENSION');

    const unknown = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { 'no-such-attribute': ['x'] },
      brandCode: 'NKE',
    });
    expect((unknown.json() as { error: { code: string } }).error.code).toBe('ATTRIBUTE_NOT_FOUND');

    const descriptive = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string], [fit.id]: [fit.values.Regular as string] },
      brandCode: 'NKE',
    });
    expect((descriptive.json() as { error: { code: string } }).error.code).toBe('ATTRIBUTE_NOT_VARIANT_DEFINING');

    const empty = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [] },
      brandCode: 'NKE',
    });
    expect((empty.json() as { error: { code: string } }).error.code).toBe('ATTRIBUTE_VALUES_REQUIRED');

    const notFound = await call('POST', '/api/v1/admin/products/no-such-product/variants/generate', emails.staff, {
      attributes: {},
      brandCode: 'NKE',
    });
    expect(notFound.statusCode).toBe(404);

    // Product without a coded category cannot produce SKUs.
    const uncategorized = await prisma.product.create({
      data: { name: `Vg Loose ${stamp}`, slug: `vg-${stamp}-loose`, description: 'Variant generation engine loose fixture.', status: 'DRAFT', styleCode: 'LOOSE1' },
    });
    createdProductIds.push(uncategorized.id);
    const loose = await call('POST', `/api/v1/admin/products/${uncategorized.id}/variants/generate`, emails.staff, {
      attributes: {},
      brandCode: 'NKE',
    });
    expect((loose.json() as { error: { code: string } }).error.code).toBe('MISSING_CATEGORY_CODE');
  });

  it('surfaces SKU collisions without silent suffixes and leaves no partial state', async () => {
    const fixture = await buildFixture({
      key: 'collision',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}X`.slice(0, 8),
      attributes: { Color: [{ value: 'Black', code: 'BLK' }, { value: 'White', code: 'WHT' }], Size: [{ value: 'S', code: 'S' }] },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const size = fixture.attrs.Size as { id: string; values: Record<string, string> };
    const collidingSku = `NKE-${fixture.categoryCode}-${fixture.styleCode}-BLK-S`;
    // A foreign variant (different attribute identity) already owns the SKU.
    await prisma.productVariant.create({
      data: { productId: fixture.productId, sku: collidingSku, name: 'Foreign', status: 'ACTIVE', priceOverride: 10 },
    });
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: [color.values.Black as string, color.values.White as string], [size.id]: [size.values.S as string] },
      brandCode: 'NKE',
    });
    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('SKU_ALREADY_EXISTS');
    // Atomicity: the non-colliding White/S variant was NOT partially created.
    expect(await prisma.productVariant.count({ where: { productId: fixture.productId, sku: `NKE-${fixture.categoryCode}-${fixture.styleCode}-WHT-S` } })).toBe(0);
  });

  it('rejects combinatorial explosions above the per-operation limit', async () => {
    const colorValues = Array.from({ length: 20 }, (_, i) => ({ value: `Shade${i}`, code: `C${i.toString().padStart(2, '0')}` }));
    const sizeValues = Array.from({ length: 16 }, (_, i) => ({ value: `T${i}`, code: `Z${i.toString().padStart(2, '0')}` }));
    const fixture = await buildFixture({
      key: 'explosion',
      template: '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}',
      styleCode: `VG${stamp.slice(-4).toUpperCase()}Z`.slice(0, 8),
      attributes: { Color: colorValues, Size: sizeValues },
    });
    const color = fixture.attrs.Color as { id: string; values: Record<string, string> };
    const size = fixture.attrs.Size as { id: string; values: Record<string, string> };
    const response = await call('POST', `/api/v1/admin/products/${fixture.productId}/variants/generate`, emails.staff, {
      attributes: { [color.id]: Object.values(color.values), [size.id]: Object.values(size.values) },
      brandCode: 'NKE',
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('TOO_MANY_VARIANTS');
    expect(await prisma.productVariant.count({ where: { productId: fixture.productId } })).toBe(0);
  });
});
