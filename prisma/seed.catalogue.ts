/**
 * JB Mercantile merchandising seed (Phase E).
 * Idempotent (upserts by slug/SKU): safe to re-run. Mirrors the established
 * demo range so storefront URLs remain stable across the DB cutover.
 * Images are external Unsplash references (legacy-compatible); no fake
 * Cloudinary assets are created. Run: `npm run db:seed:catalogue`.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

type VariantSeed = {
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  attrs: Record<string, string>;
  stock: number;
};

type ProductSeed = {
  slug: string;
  name: string;
  description: string;
  category: string;
  basePrice: number;
  featured?: boolean;
  createdAt: string;
  collections?: string[];
  images: string[];
  variants: VariantSeed[];
  // SKU foundation (Phase 1): stable style identifier, matching the legacy
  // SKU prefix so prefix-search stays consistent with preserved history.
  styleCode: string;
};

// SKU foundation (Phase 1): stable category codes + per-category templates.
// Codes are admin-curated (never blind first-3-letters); templates freeze per
// variant at creation so later edits never rewrite history.
const CLOTHING_TEMPLATE = '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}';
const FOOTWEAR_TEMPLATE = '{BRAND}-{CATEGORY}-{STYLE}-{COLOR}-{SIZE}';
const APPLIANCE_TEMPLATE = '{BRAND}-{CATEGORY}-{STYLE}-{POWER}-{COLOR}';
const UTENSIL_TEMPLATE = '{BRAND}-{CATEGORY}-{STYLE}-{MATERIAL}-{PACK}';

const CATEGORIES: Array<{ slug: string; name: string; description: string; parent?: string; code: string; skuTemplate: string }> = [
  { slug: 'fashion', name: 'Fashion', description: 'Everyday clothing — men, women and accessory staples.', code: 'FSH', skuTemplate: CLOTHING_TEMPLATE },
  { slug: 'footwear', name: 'Footwear', description: 'Sneakers, casual and formal footwear for men and women.', code: 'FTW', skuTemplate: FOOTWEAR_TEMPLATE },
  { slug: 'kitchen-home', name: 'Kitchen & Home', description: 'Kitchen appliances, cookware and home essentials for modern Kenyan homes.', code: 'KTH', skuTemplate: CLOTHING_TEMPLATE },
  { slug: 'men', name: 'Men', description: 'Structured essentials and elevated staples for everyday wear.', parent: 'fashion', code: 'MEN', skuTemplate: CLOTHING_TEMPLATE },
  { slug: 'women', name: 'Women', description: 'Soft layers, tailored silhouettes, and statement pieces.', parent: 'fashion', code: 'WMN', skuTemplate: CLOTHING_TEMPLATE },
  { slug: 'accessories', name: 'Accessories', description: 'Finishing touches for complete looks.', parent: 'fashion', code: 'ACC', skuTemplate: CLOTHING_TEMPLATE },
  { slug: 'footwear-men', name: "Men's Footwear", description: 'Casual and formal shoes for men.', parent: 'footwear', code: 'MFW', skuTemplate: FOOTWEAR_TEMPLATE },
  { slug: 'footwear-women', name: "Women's Footwear", description: 'Casual and formal shoes for women.', parent: 'footwear', code: 'WFW', skuTemplate: FOOTWEAR_TEMPLATE },
  { slug: 'sneakers', name: 'Sneakers', description: 'Everyday runners and street-ready trainers.', parent: 'footwear-men', code: 'SNK', skuTemplate: FOOTWEAR_TEMPLATE },
  { slug: 'kitchen-appliances', name: 'Kitchen Appliances', description: 'Small appliances that make daily cooking faster and easier.', parent: 'kitchen-home', code: 'KAP', skuTemplate: APPLIANCE_TEMPLATE },
  { slug: 'cookware', name: 'Cookware', description: 'Pots, pans and cooking essentials built for daily use.', parent: 'kitchen-home', code: 'CKW', skuTemplate: UTENSIL_TEMPLATE },
  { slug: 'home-essentials', name: 'Home Essentials', description: 'Bedding, storage and comfort basics for the home.', parent: 'kitchen-home', code: 'HES', skuTemplate: CLOTHING_TEMPLATE },
];

const COLLECTIONS: Array<{ slug: string; name: string; description: string }> = [
  { slug: 'featured', name: 'Featured', description: 'Hand-picked highlights across the catalogue.' },
  { slug: 'city-light', name: 'City Light', description: 'Polished essentials built for everyday movement.' },
  { slug: 'weekend-edit', name: 'Weekend Edit', description: 'Relaxed silhouettes and easy layering for non-stop days.' },
  { slug: 'heritage-essentials', name: 'Heritage Essentials', description: 'Staple wardrobes rooted in utility and comfort.' },
  { slug: 'kitchen-starter', name: 'Kitchen Starter', description: 'The appliances and cookware every kitchen needs first.' },
  { slug: 'step-forward', name: 'Step Forward', description: 'Footwear picks for work, weekends and everything between.' },
];

// SKU foundation (Phase 1): curated dictionary codes. Unique per attribute so
// Blue->BLU never collides with Black->BLK, and Navy takes NVY explicitly.
const ATTRIBUTE_VALUES: Record<string, Array<{ value: string; code: string }>> = {
  Color: [
    { value: 'Black', code: 'BLK' }, { value: 'White', code: 'WHT' }, { value: 'Stone', code: 'STN' },
    { value: 'Olive', code: 'OLV' }, { value: 'Brown', code: 'BRN' }, { value: 'Beige', code: 'BEI' },
    { value: 'Blue', code: 'BLU' }, { value: 'Red', code: 'RED' }, { value: 'Silver', code: 'SLV' },
    { value: 'Nude', code: 'NDE' }, { value: 'Grey', code: 'GRY' }, { value: 'Green', code: 'GRN' },
    { value: 'Navy', code: 'NVY' },
  ],
  Size: [
    { value: 'S', code: 'S' }, { value: 'M', code: 'M' }, { value: 'L', code: 'L' },
    { value: 'XL', code: 'XL' }, { value: '6', code: '6' }, { value: '8', code: '8' },
    { value: 'Double', code: 'DBL' },
  ],
  'Shoe Size': [
    { value: '38', code: '38' }, { value: '39', code: '39' }, { value: '42', code: '42' },
    { value: '43', code: '43' }, { value: '44', code: '44' },
  ],
  Capacity: [
    { value: '1.5L', code: '15L' }, { value: '1.8L', code: '18L' }, { value: '2L', code: '2L' },
  ],
  Power: [{ value: '500W', code: '500W' }, { value: '1500W', code: '1500W' }],
  Material: [
    { value: 'Canvas', code: 'CNV' }, { value: 'Leather', code: 'LEA' },
    { value: 'Non-stick aluminium', code: 'NSA' }, { value: 'Cotton', code: 'CTN' },
    { value: 'Stainless steel', code: 'SST' },
  ],
  Style: [
    { value: 'Lace-up', code: 'LCU' }, { value: 'Slip-on', code: 'SLO' }, { value: 'Block heel', code: 'BLH' },
  ],
  Brand: [{ value: 'JB', code: 'JB' }],
};

const PRODUCTS: ProductSeed[] = [
  {
    slug: 'classic-black-hoodie', styleCode: 'HOD', name: 'Classic Black Hoodie',
    description: 'The Classic Black Hoodie pairs a premium brushed cotton feel with a confident silhouette and all-day comfort. Designed for cool evenings and polished everyday looks, it layers beautifully from commute to weekend plans.',
    category: 'men', basePrice: 2500, featured: true, createdAt: '2026-08-28T09:00:00+03:00',
    collections: ['featured', 'city-light', 'weekend-edit'],
    images: [U('photo-1521572267360-ee0c2909d518'), U('photo-1503342217505-b0a15ec3261c'), U('photo-1529139574466-a303027c1d8b')],
    variants: [
      { sku: 'HOD-BLK-M', name: 'Black / M', price: 2500, compareAtPrice: 3200, attrs: { Color: 'Black', Size: 'M', Brand: 'JB' }, stock: 12 },
      { sku: 'HOD-BLK-L', name: 'Black / L', price: 2500, compareAtPrice: 3200, attrs: { Color: 'Black', Size: 'L', Brand: 'JB' }, stock: 9 },
      { sku: 'HOD-BLK-XL', name: 'Black / XL', price: 2500, compareAtPrice: 3200, attrs: { Color: 'Black', Size: 'XL', Brand: 'JB' }, stock: 0 },
    ],
  },
  {
    slug: 'mila-tapered-trouser', styleCode: 'TRO', name: 'Mila Tapered Trouser',
    description: 'The Mila Tapered Trouser blends a tailored profile with comfort-first fabric. It moves from office-ready to after-hours without losing ease, giving the wardrobe an instant premium finish.',
    category: 'women', basePrice: 3800, featured: true, createdAt: '2026-07-14T09:00:00+03:00',
    collections: ['featured', 'city-light'],
    images: [U('photo-1483985988355-763728e1935b'), U('photo-1524504388940-b1c1722653e1')],
    variants: [
      { sku: 'TRO-WHT-6', name: 'Stone / 6', price: 3800, compareAtPrice: 4300, attrs: { Color: 'Stone', Size: '6', Brand: 'JB' }, stock: 7 },
      { sku: 'TRO-WHT-8', name: 'Stone / 8', price: 3800, compareAtPrice: 4300, attrs: { Color: 'Stone', Size: '8', Brand: 'JB' }, stock: 5 },
    ],
  },
  {
    slug: 'atlas-utility-shirt', styleCode: 'SHR', name: 'Atlas Utility Shirt',
    description: 'The Atlas Utility Shirt delivers a structured silhouette without feeling rigid. Its refined finish works with denim, tailored trousers, and layered fits for a versatile wardrobe base.',
    category: 'men', basePrice: 2950, createdAt: '2026-08-30T09:00:00+03:00',
    collections: ['weekend-edit', 'heritage-essentials'],
    images: [U('photo-1515886657613-9f3515b0c78f'), U('photo-1521572163474-6864f9cf17ab')],
    variants: [
      { sku: 'SHR-OLV-M', name: 'Olive / M', price: 2950, attrs: { Color: 'Olive', Size: 'M', Brand: 'JB' }, stock: 10 },
      { sku: 'SHR-OLV-L', name: 'Olive / L', price: 2950, attrs: { Color: 'Olive', Size: 'L', Brand: 'JB' }, stock: 6 },
    ],
  },
  {
    slug: 'solace-knit-set', styleCode: 'KNT', name: 'Solace Knit Set',
    description: 'The Solace Knit Set is designed for polished, low-effort styling. The soft knit structure keeps it comfortable while the lean silhouette delivers a clean, intentional finish.',
    category: 'women', basePrice: 5200, featured: true, createdAt: '2026-09-02T09:00:00+03:00',
    collections: ['featured'],
    images: [U('photo-1529139574466-a303027c1d8b'), U('photo-1496747611176-843222e1e57c')],
    variants: [
      { sku: 'KNT-BLK-S', name: 'Black / S', price: 5200, attrs: { Color: 'Black', Size: 'S', Brand: 'JB' }, stock: 8 },
      { sku: 'KNT-BLK-M', name: 'Black / M', price: 5200, attrs: { Color: 'Black', Size: 'M', Brand: 'JB' }, stock: 8 },
    ],
  },
  {
    slug: 'nairobi-utility-bag', styleCode: 'BAG', name: 'Nairobi Utility Bag',
    description: 'The Nairobi Utility Bag brings function and refinement together with durable finishes, practical storage, and a clean silhouette that pairs well with everyday essentials.',
    category: 'accessories', basePrice: 4200, createdAt: '2026-09-05T09:00:00+03:00',
    collections: ['weekend-edit'],
    images: [U('photo-1548036328-c9fa89d128fa'), U('photo-1525966222134-fcfa99b8ae77')],
    variants: [
      { sku: 'BAG-BRN-01', name: 'Brown / Standard', price: 4200, compareAtPrice: 5000, attrs: { Color: 'Brown', Material: 'Canvas', Brand: 'JB' }, stock: 11 },
    ],
  },
  {
    slug: 'marina-overshirt', styleCode: 'OVR', name: 'Marina Overshirt',
    description: 'The Marina Overshirt brings an elevated layer to the wardrobe with a structured fit and soft hand feel. Built for layering and day-to-night ease, it plays across relaxed and tailored looks.',
    category: 'women', basePrice: 4600, createdAt: '2026-09-08T09:00:00+03:00',
    collections: [],
    images: [U('photo-1529139574466-a303027c1d8b'), U('photo-1483985988355-763728e1935b')],
    variants: [
      { sku: 'OVR-BEIGE-M', name: 'Beige / M', price: 4600, attrs: { Color: 'Beige', Size: 'M', Brand: 'JB' }, stock: 4 },
      { sku: 'OVR-BEIGE-L', name: 'Beige / L', price: 4600, attrs: { Color: 'Beige', Size: 'L', Brand: 'JB' }, stock: 0 },
    ],
  },
  {
    slug: 'mombasa-road-runner', styleCode: 'SNK', name: 'Mombasa Road Runner',
    description: 'The Mombasa Road Runner pairs breathable mesh with responsive cushioning and grippy outsoles. A versatile trainer for commutes, workouts and off-duty days.',
    category: 'sneakers', basePrice: 6500, featured: true, createdAt: '2026-09-10T09:00:00+03:00',
    collections: ['featured', 'step-forward', 'weekend-edit'],
    images: [U('photo-1542291026-7eec264c27ff'), U('photo-1549298916-b41d501d3772')],
    variants: [
      { sku: 'SNK-RED-42', name: 'Red / 42', price: 6500, compareAtPrice: 7800, attrs: { Color: 'Red', 'Shoe Size': '42', Style: 'Lace-up', Brand: 'JB' }, stock: 14 },
      { sku: 'SNK-RED-43', name: 'Red / 43', price: 6500, compareAtPrice: 7800, attrs: { Color: 'Red', 'Shoe Size': '43', Style: 'Lace-up', Brand: 'JB' }, stock: 9 },
      { sku: 'SNK-WHT-42', name: 'White / 42', price: 6500, attrs: { Color: 'White', 'Shoe Size': '42', Style: 'Lace-up', Brand: 'JB' }, stock: 6 },
      { sku: 'SNK-WHT-44', name: 'White / 44', price: 6500, attrs: { Color: 'White', 'Shoe Size': '44', Style: 'Lace-up', Brand: 'JB' }, stock: 0 },
    ],
  },
  {
    slug: 'savanna-leather-loafer', styleCode: 'LOF', name: 'Savanna Leather Loafer',
    description: 'The Savanna Leather Loafer is cut from smooth leather with a cushioned insole and durable sole. Dresses up tailoring and sharpens off-duty looks alike.',
    category: 'footwear-men', basePrice: 7200, createdAt: '2026-09-11T09:00:00+03:00',
    collections: ['step-forward', 'city-light'],
    images: [U('photo-1560343090-f0409e92791a'), U('photo-1600185365483-26d7a4cc7519')],
    variants: [
      { sku: 'LOF-BRN-42', name: 'Brown / 42', price: 7200, attrs: { Color: 'Brown', 'Shoe Size': '42', Material: 'Leather', Style: 'Slip-on', Brand: 'JB' }, stock: 5 },
      { sku: 'LOF-BRN-43', name: 'Brown / 43', price: 7200, attrs: { Color: 'Brown', 'Shoe Size': '43', Material: 'Leather', Style: 'Slip-on', Brand: 'JB' }, stock: 5 },
      { sku: 'LOF-BLK-42', name: 'Black / 42', price: 7200, attrs: { Color: 'Black', 'Shoe Size': '42', Material: 'Leather', Style: 'Slip-on', Brand: 'JB' }, stock: 3 },
    ],
  },
  {
    slug: 'amina-block-heel', styleCode: 'HEEL', name: 'Amina Block Heel',
    description: 'The Amina Block Heel balances elegance with all-day comfort — a stable block heel, padded footbed and clean straps that pair with dresses and tailoring.',
    category: 'footwear-women', basePrice: 5800, featured: true, createdAt: '2026-09-12T09:00:00+03:00',
    collections: ['featured', 'step-forward'],
    images: [U('photo-1543163521-1bf539c55dd2')],
    variants: [
      { sku: 'HEEL-NDE-38', name: 'Nude / 38', price: 5800, attrs: { Color: 'Nude', 'Shoe Size': '38', Style: 'Block heel', Brand: 'JB' }, stock: 6 },
      { sku: 'HEEL-NDE-39', name: 'Nude / 39', price: 5800, attrs: { Color: 'Nude', 'Shoe Size': '39', Style: 'Block heel', Brand: 'JB' }, stock: 6 },
      { sku: 'HEEL-BLK-38', name: 'Black / 38', price: 5800, attrs: { Color: 'Black', 'Shoe Size': '38', Style: 'Block heel', Brand: 'JB' }, stock: 0 },
    ],
  },
  {
    slug: 'jikoni-electric-kettle', styleCode: 'KET', name: 'Jikoni Electric Kettle 1.8L',
    description: 'The Jikoni Electric Kettle boils a full 1.8 litres quickly and safely, with cordless pouring, auto shut-off and boil-dry protection. A daily essential for tea, coffee and cooking.',
    category: 'kitchen-appliances', basePrice: 3400, featured: true, createdAt: '2026-09-13T09:00:00+03:00',
    collections: ['featured', 'kitchen-starter'],
    images: [U('photo-1590794056226-79ef3a8147e1')],
    variants: [
      { sku: 'KET-SLV-18', name: 'Silver / 1.8L', price: 3400, compareAtPrice: 4200, attrs: { Color: 'Silver', Capacity: '1.8L', Power: '1500W', Brand: 'JB' }, stock: 15 },
      { sku: 'KET-BLK-18', name: 'Black / 1.8L', price: 3400, attrs: { Color: 'Black', Capacity: '1.8L', Power: '1500W', Brand: 'JB' }, stock: 10 },
    ],
  },
  {
    slug: 'savanna-blender-pro', styleCode: 'BLD', name: 'Savanna Blender Pro 1.5L',
    description: 'The Savanna Blender Pro powers through fruit, vegetables and ice with a 1.5L jar, stainless blades and simple speed controls. Built for daily family use.',
    category: 'kitchen-appliances', basePrice: 5600, createdAt: '2026-09-14T09:00:00+03:00',
    collections: ['kitchen-starter'],
    images: [U('photo-1570222094114-d054a817e56b')],
    variants: [
      { sku: 'BLD-WHT-15', name: 'White / 1.5L', price: 5600, attrs: { Color: 'White', Capacity: '1.5L', Power: '500W', Brand: 'JB' }, stock: 9 },
      { sku: 'BLD-BLK-20', name: 'Black / 2L', price: 6800, attrs: { Color: 'Black', Capacity: '2L', Power: '500W', Brand: 'JB' }, stock: 7 },
    ],
  },
  {
    slug: 'karibu-cookware-set', styleCode: 'COK', name: 'Karibu 5-Piece Cookware Set',
    description: 'The Karibu 5-Piece Cookware Set covers daily cooking — saucepans, a frying pan and lids in durable non-stick aluminium that heats evenly and cleans easily. Suitable for gas and electric hobs.',
    category: 'cookware', basePrice: 8900, featured: true, createdAt: '2026-07-20T09:00:00+03:00',
    collections: ['featured', 'kitchen-starter'],
    images: [U('photo-1585515320310-259814833e62'), U('photo-1556909212-d5b604d0c90d')],
    variants: [
      { sku: 'COK-GRY-5P', name: 'Grey / 5-piece', price: 8900, compareAtPrice: 10500, attrs: { Color: 'Grey', Material: 'Non-stick aluminium', Brand: 'JB' }, stock: 8 },
    ],
  },
  {
    slug: 'cloud-cotton-duvet-set', styleCode: 'DVD', name: 'Cloud Cotton Duvet Set',
    description: 'The Cloud Cotton Duvet Set includes a duvet cover and pillowcases in breathable long-staple cotton. Cool in warm months, cosy when nights turn chilly.',
    category: 'home-essentials', basePrice: 4800, createdAt: '2026-09-15T09:00:00+03:00',
    collections: ['city-light'],
    images: [U('photo-1522771739844-6a9f6d5f14af')],
    variants: [
      { sku: 'DVD-WHT-DBL', name: 'White / Double', price: 4800, attrs: { Color: 'White', Size: 'Double', Material: 'Cotton', Brand: 'JB' }, stock: 12 },
      { sku: 'DVD-BEI-DBL', name: 'Beige / Double', price: 4800, attrs: { Color: 'Beige', Size: 'Double', Material: 'Cotton', Brand: 'JB' }, stock: 12 },
    ],
  },
];

type SkuConflict = { sku: string };

type DryRunReport = {
  categories: { existing: number; missing: number };
  collections: { existing: number; missing: number };
  attributes: { existing: number; missing: number };
  attributeValues: { existing: number; missing: number };
  products: { existing: number; missing: number; skippedInactive: number };
  variants: { existing: number; missing: number; conflicts: SkuConflict[] };
  inventory: { existingPreserved: number; newWouldInitialize: number };
  images: { existingPreserved: number; newWouldCreate: number };
  memberships: { existingPreserved: number; missingWouldAdd: number };
  warnings: string[];
  blocked: boolean;
  blockReason?: string;
};

function reportSummary(report: DryRunReport, dryRun: boolean) {
  const lines: string[] = [];
  lines.push('=== Catalogue seed preflight report ===');
  lines.push(`Mode: ${dryRun ? 'dry-run (no changes)' : 'live'}`);
  lines.push(`Categories: ${report.categories.existing} existing, ${report.categories.missing} missing`);
  lines.push(`Collections: ${report.collections.existing} existing, ${report.collections.missing} missing`);
  lines.push(`Attributes: ${report.attributes.existing} existing, ${report.attributes.missing} missing`);
  lines.push(`Attribute values: ${report.attributeValues.existing} existing, ${report.attributeValues.missing} missing`);
  lines.push(`Products: ${report.products.existing} existing (preserved), ${report.products.missing} missing (would be created), ${report.products.skippedInactive} inactive/soft-deleted skipped`);
  lines.push(`Variants: ${report.variants.existing} existing (preserved), ${report.variants.missing} missing (would be created)`);
  if (report.variants.conflicts.length > 0) {
    lines.push(`SKU ownership conflicts: ${report.variants.conflicts.length} (blocking)`);
    for (const _ of report.variants.conflicts) {
      lines.push(`  - SKU ***REDACTED*** conflicts with a variant owned by a different product`);
    }
  }
  lines.push(`Inventory: ${report.inventory.existingPreserved} existing preserved, ${report.inventory.newWouldInitialize} new would be initialized`);
  lines.push(`Product images: ${report.images.existingPreserved} existing preserved, ${report.images.newWouldCreate} new would be created (new products only)`);
  lines.push(`Collection memberships: ${report.memberships.existingPreserved} existing preserved, ${report.memberships.missingWouldAdd} missing would be added`);
  if (report.warnings.length > 0) {
    lines.push(`Warnings (${report.warnings.length}):`);
    for (const w of report.warnings) lines.push(`  - ${w}`);
  }
  lines.push(`Blocked: ${report.blocked}${report.blockReason ? ` — ${report.blockReason}` : ''}`);
  lines.push('=== End preflight report ===');
  console.log(lines.join('\n'));
}

export async function main({
  db = prisma,
  dryRun = process.argv.includes('--dry-run'),
}: {
  db?: PrismaClient;
  dryRun?: boolean;
} = {}) {
  const report: DryRunReport = {
    categories: { existing: 0, missing: 0 },
    collections: { existing: 0, missing: 0 },
    attributes: { existing: 0, missing: 0 },
    attributeValues: { existing: 0, missing: 0 },
    products: { existing: 0, missing: 0, skippedInactive: 0 },
    variants: { existing: 0, missing: 0, conflicts: [] },
    inventory: { existingPreserved: 0, newWouldInitialize: 0 },
    images: { existingPreserved: 0, newWouldCreate: 0 },
    memberships: { existingPreserved: 0, missingWouldAdd: 0 },
    warnings: [],
    blocked: false,
  };

  const categoryIds = new Map<string, string>();
  const attributeIds = new Map<string, string>();
  const valueIds = new Map<string, string>();

  for (const category of CATEGORIES) {
    const existing = await db.category.findUnique({ where: { slug: category.slug } });
    if (existing) {
      categoryIds.set(category.slug, existing.id);
      report.categories.existing++;
      if (existing.deletedAt !== null) {
        report.warnings.push(`Category '${category.slug}' is soft-deleted; left unchanged`);
      }
    } else {
      report.categories.missing++;
    }
  }

  for (const collection of COLLECTIONS) {
    const existing = await db.collection.findUnique({ where: { slug: collection.slug } });
    if (existing) {
      report.collections.existing++;
      if (existing.deletedAt !== null) {
        report.warnings.push(`Collection '${collection.slug}' is soft-deleted; left unchanged`);
      }
    } else {
      report.collections.missing++;
    }
  }

  for (const [name, values] of Object.entries(ATTRIBUTE_VALUES)) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const existingAttr = await db.attribute.findUnique({ where: { slug } });
    if (existingAttr) {
      attributeIds.set(name, existingAttr.id);
      report.attributes.existing++;
    } else {
      report.attributes.missing++;
    }

    const attributeId = attributeIds.get(name) ?? existingAttr?.id;
    if (!attributeId) continue;
    for (const { value } of values) {
      const existingValue = await db.attributeValue.findFirst({ where: { attributeId, value } });
      if (existingValue) {
        valueIds.set(`${name}:${value}`, existingValue.id);
        report.attributeValues.existing++;
      } else {
        report.attributeValues.missing++;
      }
    }
  }

  const productIds = new Map<string, string>();
  for (const product of PRODUCTS) {
    const existingProduct = await db.product.findUnique({ where: { slug: product.slug } });
    const productId = existingProduct?.id;
    if (productId) productIds.set(product.slug, productId);

    if (existingProduct) {
      report.products.existing++;
      if (existingProduct.deletedAt !== null || existingProduct.status !== 'ACTIVE') {
        report.products.skippedInactive++;
        report.warnings.push(`Product '${product.slug}' is inactive or soft-deleted; left unchanged (no reactivation)`);
      }
      continue;
    }

    report.products.missing++;
    report.images.newWouldCreate += product.images.length;
    const wanted = new Set(product.collections ?? []);
    if (product.featured) wanted.add('featured');
    for (const slug of wanted) report.memberships.missingWouldAdd++;

    for (const variant of product.variants) {
      const existingVariant = await db.productVariant.findUnique({ where: { sku: variant.sku } });
      if (existingVariant) {
        report.variants.existing++;
        if (existingVariant.deletedAt !== null || existingVariant.archivedAt !== null || existingVariant.status !== 'ACTIVE') {
          report.warnings.push(`Variant '${variant.sku}' is archived/inactive/deleted; left unchanged`);
        }
        if (existingVariant.productId !== undefined) {
          report.variants.conflicts.push({ sku: variant.sku });
        }
      } else {
        report.variants.missing++;
      }
    }
  }

  if (report.variants.conflicts.length > 0) {
    report.blocked = true;
    report.blockReason = 'SKU ownership conflict: one or more seed SKUs are owned by a different product';
    reportSummary(report, dryRun);
    throw new Error(report.blockReason);
  }

  if (dryRun) {
    reportSummary(report, true);
    return;
  }

  for (const category of CATEGORIES) {
    const existing = await db.category.findUnique({ where: { slug: category.slug } });
    if (existing) {
      categoryIds.set(category.slug, existing.id);
      continue;
    }
    const created = await db.category.create({
      data: {
        name: category.name,
        slug: category.slug,
        description: category.description,
        status: 'ACTIVE',
        code: category.code,
        skuTemplate: category.skuTemplate,
        parentId: category.parent ? (categoryIds.get(category.parent) ?? null) : null,
      },
    });
    categoryIds.set(category.slug, created.id);
  }

  for (const collection of COLLECTIONS) {
    const existing = await db.collection.findUnique({ where: { slug: collection.slug } });
    if (existing) continue;
    await db.collection.create({
      data: { name: collection.name, slug: collection.slug, description: collection.description, status: 'ACTIVE' },
    });
  }

  for (const [name, values] of Object.entries(ATTRIBUTE_VALUES)) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let attributeId = attributeIds.get(name);
    if (!attributeId) {
      const created = await db.attribute.create({ data: { name, slug, type: 'STRING' } });
      attributeId = created.id;
      attributeIds.set(name, created.id);
    }
    for (const { value, code } of values) {
      const existingValue = await db.attributeValue.findFirst({ where: { attributeId, value } });
      if (existingValue) {
        valueIds.set(`${name}:${value}`, existingValue.id);
        continue;
      }
      const created = await db.attributeValue.create({ data: { attributeId, value, code } });
      valueIds.set(`${name}:${value}`, created.id);
    }
  }

  for (const product of PRODUCTS) {
    await db.$transaction(async (tx) => {
      const existingProduct = await tx.product.findUnique({ where: { slug: product.slug } });
      if (existingProduct) {
        return;
      }

      const created = await tx.product.create({
        data: {
          name: product.name,
          slug: product.slug,
          description: product.description,
          status: 'ACTIVE',
          basePrice: product.basePrice,
          categoryId: categoryIds.get(product.category) ?? null,
          createdAt: new Date(product.createdAt),
          styleCode: product.styleCode,
        },
      });

      for (const variant of product.variants) {
        const existingVariant = await tx.productVariant.findUnique({ where: { sku: variant.sku } });
        if (existingVariant) continue;

        const createdVariant = await tx.productVariant.create({
          data: {
            productId: created.id,
            sku: variant.sku,
            name: variant.name,
            status: 'ACTIVE',
            priceOverride: variant.price,
            compareAtPrice: variant.compareAtPrice ?? null,
          },
        });

        const existingInventory = await tx.inventory.findUnique({ where: { variantId: createdVariant.id } });
        if (!existingInventory) {
          await tx.inventory.create({
            data: {
              variantId: createdVariant.id,
              quantityOnHand: variant.stock,
              quantityReserved: 0,
              lowStockThreshold: 2,
            },
          });
        }

        for (const [attrName, attrValue] of Object.entries(variant.attrs)) {
          const attributeId = attributeIds.get(attrName);
          const attributeValueId = valueIds.get(`${attrName}:${attrValue}`);
          if (!attributeId || !attributeValueId) {
            throw new Error(`Unknown attribute mapping ${attrName}:${attrValue}`);
          }
          await tx.variantAttributeValue.upsert({
            where: { variantId_attributeId_attributeValueId: { variantId: createdVariant.id, attributeId, attributeValueId } },
            update: {},
            create: { variantId: createdVariant.id, attributeId, attributeValueId },
          });
        }
      }

      for (const [index, url] of product.images.entries()) {
        await tx.productImage.create({
          data: {
            productId: created.id,
            url,
            altText: product.name,
            isPrimary: index === 0,
            sortOrder: index,
          },
        });
      }

      const wanted = new Set(product.collections ?? []);
      if (product.featured) wanted.add('featured');
      const existingMemberships = await tx.productCollection.findMany({
        where: { productId: created.id },
        select: { collectionId: true },
      });
      const existingCollectionIds = new Set(existingMemberships.map((m) => m.collectionId));
      const collections = await tx.collection.findMany({
        where: { slug: { in: Array.from(wanted) } },
        select: { id: true, slug: true },
      });
      const collectionBySlug = new Map(collections.map((c) => [c.slug, c.id]));
      for (const slug of wanted) {
        const collectionId = collectionBySlug.get(slug);
        if (!collectionId || existingCollectionIds.has(collectionId)) continue;
        await tx.productCollection.create({
          data: { productId: created.id, collectionId },
        });
      }
    });
  }

  reportSummary(report, false);
}

// Run only when invoked directly as a script (`tsx prisma/seed.catalogue.ts`),
// so importing this module in tests does not execute the seed.
if (process.argv[1] && process.argv[1].endsWith('seed.catalogue.ts')) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
