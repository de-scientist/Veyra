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
};

const CATEGORIES: Array<{ slug: string; name: string; description: string; parent?: string }> = [
  { slug: 'fashion', name: 'Fashion', description: 'Everyday clothing — men, women and accessory staples.' },
  { slug: 'footwear', name: 'Footwear', description: 'Sneakers, casual and formal footwear for men and women.' },
  { slug: 'kitchen-home', name: 'Kitchen & Home', description: 'Kitchen appliances, cookware and home essentials for modern Kenyan homes.' },
  { slug: 'men', name: 'Men', description: 'Structured essentials and elevated staples for everyday wear.', parent: 'fashion' },
  { slug: 'women', name: 'Women', description: 'Soft layers, tailored silhouettes, and statement pieces.', parent: 'fashion' },
  { slug: 'accessories', name: 'Accessories', description: 'Finishing touches for complete looks.', parent: 'fashion' },
  { slug: 'footwear-men', name: "Men's Footwear", description: 'Casual and formal shoes for men.', parent: 'footwear' },
  { slug: 'footwear-women', name: "Women's Footwear", description: 'Casual and formal shoes for women.', parent: 'footwear' },
  { slug: 'sneakers', name: 'Sneakers', description: 'Everyday runners and street-ready trainers.', parent: 'footwear-men' },
  { slug: 'kitchen-appliances', name: 'Kitchen Appliances', description: 'Small appliances that make daily cooking faster and easier.', parent: 'kitchen-home' },
  { slug: 'cookware', name: 'Cookware', description: 'Pots, pans and cooking essentials built for daily use.', parent: 'kitchen-home' },
  { slug: 'home-essentials', name: 'Home Essentials', description: 'Bedding, storage and comfort basics for the home.', parent: 'kitchen-home' },
];

const COLLECTIONS: Array<{ slug: string; name: string; description: string }> = [
  { slug: 'featured', name: 'Featured', description: 'Hand-picked highlights across the catalogue.' },
  { slug: 'city-light', name: 'City Light', description: 'Polished essentials built for everyday movement.' },
  { slug: 'weekend-edit', name: 'Weekend Edit', description: 'Relaxed silhouettes and easy layering for non-stop days.' },
  { slug: 'heritage-essentials', name: 'Heritage Essentials', description: 'Staple wardrobes rooted in utility and comfort.' },
  { slug: 'kitchen-starter', name: 'Kitchen Starter', description: 'The appliances and cookware every kitchen needs first.' },
  { slug: 'step-forward', name: 'Step Forward', description: 'Footwear picks for work, weekends and everything between.' },
];

const ATTRIBUTE_VALUES: Record<string, string[]> = {
  Color: ['Black', 'White', 'Stone', 'Olive', 'Brown', 'Beige', 'Blue', 'Red', 'Silver', 'Nude', 'Grey', 'Green', 'Navy'],
  Size: ['S', 'M', 'L', 'XL', '6', '8', 'Double'],
  'Shoe Size': ['38', '39', '42', '43', '44'],
  Capacity: ['1.5L', '1.8L', '2L'],
  Power: ['500W', '1500W'],
  Material: ['Canvas', 'Leather', 'Non-stick aluminium', 'Cotton', 'Stainless steel'],
  Style: ['Lace-up', 'Slip-on', 'Block heel'],
  Brand: ['JB'],
};

const PRODUCTS: ProductSeed[] = [
  {
    slug: 'classic-black-hoodie', name: 'Classic Black Hoodie',
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
    slug: 'mila-tapered-trouser', name: 'Mila Tapered Trouser',
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
    slug: 'atlas-utility-shirt', name: 'Atlas Utility Shirt',
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
    slug: 'solace-knit-set', name: 'Solace Knit Set',
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
    slug: 'nairobi-utility-bag', name: 'Nairobi Utility Bag',
    description: 'The Nairobi Utility Bag brings function and refinement together with durable finishes, practical storage, and a clean silhouette that pairs well with everyday essentials.',
    category: 'accessories', basePrice: 4200, createdAt: '2026-09-05T09:00:00+03:00',
    collections: ['weekend-edit'],
    images: [U('photo-1548036328-c9fa89d128fa'), U('photo-1525966222134-fcfa99b8ae77')],
    variants: [
      { sku: 'BAG-BRN-01', name: 'Brown / Standard', price: 4200, compareAtPrice: 5000, attrs: { Color: 'Brown', Material: 'Canvas', Brand: 'JB' }, stock: 11 },
    ],
  },
  {
    slug: 'marina-overshirt', name: 'Marina Overshirt',
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
    slug: 'mombasa-road-runner', name: 'Mombasa Road Runner',
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
    slug: 'savanna-leather-loafer', name: 'Savanna Leather Loafer',
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
    slug: 'amina-block-heel', name: 'Amina Block Heel',
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
    slug: 'jikoni-electric-kettle', name: 'Jikoni Electric Kettle 1.8L',
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
    slug: 'savanna-blender-pro', name: 'Savanna Blender Pro 1.5L',
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
    slug: 'karibu-cookware-set', name: 'Karibu 5-Piece Cookware Set',
    description: 'The Karibu 5-Piece Cookware Set covers daily cooking — saucepans, a frying pan and lids in durable non-stick aluminium that heats evenly and cleans easily. Suitable for gas and electric hobs.',
    category: 'cookware', basePrice: 8900, featured: true, createdAt: '2026-07-20T09:00:00+03:00',
    collections: ['featured', 'kitchen-starter'],
    images: [U('photo-1585515320310-259814833e62'), U('photo-1556909212-d5b604d0c90d')],
    variants: [
      { sku: 'COK-GRY-5P', name: 'Grey / 5-piece', price: 8900, compareAtPrice: 10500, attrs: { Color: 'Grey', Material: 'Non-stick aluminium', Brand: 'JB' }, stock: 8 },
    ],
  },
  {
    slug: 'cloud-cotton-duvet-set', name: 'Cloud Cotton Duvet Set',
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

async function main() {
  // Categories (parents before children).
  const categoryIds = new Map<string, string>();
  for (const category of CATEGORIES) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name, description: category.description, status: 'ACTIVE', deletedAt: null },
      create: { name: category.name, slug: category.slug, description: category.description, status: 'ACTIVE' },
    });
    categoryIds.set(category.slug, record.id);
  }
  for (const category of CATEGORIES) {
    if (category.parent) {
      await prisma.category.update({
        where: { slug: category.slug },
        data: { parentId: categoryIds.get(category.parent) ?? null },
      });
    }
  }

  for (const collection of COLLECTIONS) {
    await prisma.collection.upsert({
      where: { slug: collection.slug },
      update: { name: collection.name, description: collection.description, status: 'ACTIVE', deletedAt: null },
      create: { name: collection.name, slug: collection.slug, description: collection.description, status: 'ACTIVE' },
    });
  }

  const attributeIds = new Map<string, string>();
  const valueIds = new Map<string, string>();
  for (const [name, values] of Object.entries(ATTRIBUTE_VALUES)) {
    const attribute = await prisma.attribute.upsert({
      where: { slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') },
      update: { name },
      create: { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), type: 'STRING' },
    });
    attributeIds.set(name, attribute.id);
    for (const value of values) {
      const record = await prisma.attributeValue.upsert({
        where: { attributeId_value: { attributeId: attribute.id, value } },
        update: {},
        create: { attributeId: attribute.id, value },
      });
      valueIds.set(`${name}:${value}`, record.id);
    }
  }

  for (const product of PRODUCTS) {
    const record = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        status: 'ACTIVE',
        deletedAt: null,
        basePrice: product.basePrice,
        categoryId: categoryIds.get(product.category) ?? null,
        createdAt: new Date(product.createdAt),
      },
      create: {
        name: product.name,
        slug: product.slug,
        description: product.description,
        status: 'ACTIVE',
        basePrice: product.basePrice,
        categoryId: categoryIds.get(product.category) ?? null,
        createdAt: new Date(product.createdAt),
      },
    });

    // Variants + inventory + attribute mappings (idempotent by SKU).
    for (const variant of product.variants) {
      const created = await prisma.productVariant.upsert({
        where: { sku: variant.sku },
        update: {
          name: variant.name,
          status: 'ACTIVE',
          priceOverride: variant.price,
          compareAtPrice: variant.compareAtPrice ?? null,
          archivedAt: null,
          deletedAt: null,
        },
        create: {
          productId: record.id,
          sku: variant.sku,
          name: variant.name,
          status: 'ACTIVE',
          priceOverride: variant.price,
          compareAtPrice: variant.compareAtPrice ?? null,
        },
      });
      await prisma.inventory.upsert({
        where: { variantId: created.id },
        update: { quantityOnHand: variant.stock, quantityReserved: 0, lowStockThreshold: 2 },
        create: { variantId: created.id, quantityOnHand: variant.stock, quantityReserved: 0, lowStockThreshold: 2 },
      });
      for (const [attrName, attrValue] of Object.entries(variant.attrs)) {
        const attributeId = attributeIds.get(attrName);
        const attributeValueId = valueIds.get(`${attrName}:${attrValue}`);
        if (!attributeId || !attributeValueId) throw new Error(`Unknown attribute mapping ${attrName}:${attrValue}`);
        await prisma.variantAttributeValue.upsert({
          where: { variantId_attributeId_attributeValueId: { variantId: created.id, attributeId, attributeValueId } },
          update: {},
          create: { variantId: created.id, attributeId, attributeValueId },
        });
      }
    }

    // Images: rebuild deterministically from the seed (external URLs only).
    await prisma.productImage.deleteMany({ where: { productId: record.id } });
    for (const [index, url] of product.images.entries()) {
      await prisma.productImage.create({
        data: {
          productId: record.id,
          url,
          altText: product.name,
          isPrimary: index === 0,
          sortOrder: index,
        },
      });
    }

    // Collection memberships.
    const wanted = new Set(product.collections ?? []);
    if (product.featured) wanted.add('featured');
    await prisma.productCollection.deleteMany({ where: { productId: record.id } });
    for (const slug of wanted) {
      const collection = await prisma.collection.findUnique({ where: { slug } });
      if (collection) {
        await prisma.productCollection.create({ data: { productId: record.id, collectionId: collection.id } });
      }
    }
  }

  console.log(`Seeded ${CATEGORIES.length} categories, ${COLLECTIONS.length} collections, ${PRODUCTS.length} products.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
