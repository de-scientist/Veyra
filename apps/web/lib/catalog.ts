/**
 * JB Mercantile catalogue layer.
 *
 * Data-driven multi-category retail catalogue: departments → categories →
 * products with flexible variant attributes. UI renders from the attribute
 * registry and per-scope facet derivation — never from hard-coded
 * clothing-only assumptions.
 *
 * DATA SOURCE: static demo catalogue (same established pattern as before:
 * the backend product database ships empty and the storefront renders demo
 * content by design — see next.config.mjs imagery note). The functions in
 * the "Backend cutover" section mark exactly where live `/catalog/*` API
 * responses plug in once merchandising onboards real products.
 */

export type DepartmentSlug = 'fashion' | 'footwear' | 'kitchen-home';

export type Department = {
  slug: DepartmentSlug;
  name: string;
  tagline: string;
  description: string;
  image: string;
};

export type Category = {
  slug: string;
  name: string;
  description: string;
  department: DepartmentSlug;
  /** Parent category slug for nested departments (e.g. sneakers → footwear). */
  parentSlug?: string;
  image?: string;
};

export type AttributeControl = 'swatch' | 'option' | 'facet';

export type AttributeDef = {
  name: string;
  control: AttributeControl;
  /** Kind hint for filters/specs (e.g. EU shoe sizes vs apparel sizes). */
  kind: 'color' | 'apparel-size' | 'shoe-size' | 'capacity' | 'power' | 'material' | 'style' | 'brand' | 'generic';
};

export type ProductVariant = {
  id: string;
  sku: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  attributes: Record<string, string>;
  inStock: boolean;
  inventoryLabel?: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  department: DepartmentSlug;
  category: string;
  brand: string;
  featured: boolean;
  newArrival: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  price: number;
  compareAtPrice?: number;
  images: string[];
  variants: ProductVariant[];
  createdAt: string;
  /** Static product-level facts (material, care) — never guarantees/warranties. */
  specs?: Record<string, string>;
};

export type Collection = {
  slug: string;
  name: string;
  description: string;
  image?: string;
  productIds: string[];
};

/* ---------------- Departments ---------------- */

export const departments: Department[] = [
  {
    slug: 'fashion',
    name: 'Fashion',
    tagline: 'Everyday clothing',
    description: 'Men, women and accessory staples — structured essentials built for daily wear.',
    image: 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
  },
  {
    slug: 'footwear',
    name: 'Footwear',
    tagline: 'Shoes for every step',
    description: 'Sneakers, casual and formal footwear for men and women.',
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
  },
  {
    slug: 'kitchen-home',
    name: 'Kitchen & Home',
    tagline: 'Cook, serve, settle in',
    description: 'Kitchen appliances, cookware and home essentials for modern Kenyan homes.',
    image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?auto=format&fit=crop&w=900&q=80',
  },
];

/* ---------------- Categories (data-driven hierarchy) ---------------- */

export const categories: Category[] = [
  // Fashion
  { slug: 'men', name: 'Men', description: 'Structured essentials and elevated staples for everyday wear.', department: 'fashion', image: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80' },
  { slug: 'women', name: 'Women', description: 'Soft layers, tailored silhouettes, and statement pieces.', department: 'fashion', image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80' },
  { slug: 'accessories', name: 'Accessories', description: 'Finishing touches for complete looks.', department: 'fashion' },
  // Footwear
  { slug: 'sneakers', name: 'Sneakers', description: 'Everyday runners and street-ready trainers.', department: 'footwear', parentSlug: 'footwear-men', image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?auto=format&fit=crop&w=900&q=80' },
  { slug: 'footwear-men', name: "Men's Footwear", description: 'Casual and formal shoes for men.', department: 'footwear' },
  { slug: 'footwear-women', name: "Women's Footwear", description: 'Casual and formal shoes for women.', department: 'footwear', image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=80' },
  // Kitchen & Home
  { slug: 'kitchen-appliances', name: 'Kitchen Appliances', description: 'Small appliances that make daily cooking faster and easier.', department: 'kitchen-home', image: 'https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=900&q=80' },
  { slug: 'cookware', name: 'Cookware', description: 'Pots, pans and cooking essentials built for daily use.', department: 'kitchen-home', image: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?auto=format&fit=crop&w=900&q=80' },
  { slug: 'home-essentials', name: 'Home Essentials', description: 'Bedding, storage and comfort basics for the home.', department: 'kitchen-home' },
];

/* ---------------- Attribute registry (control mapping) ---------------- */

export const ATTRIBUTE_REGISTRY: Record<string, AttributeDef> = {
  Color: { name: 'Color', control: 'swatch', kind: 'color' },
  Size: { name: 'Size', control: 'option', kind: 'apparel-size' },
  'Shoe Size': { name: 'Shoe Size', control: 'option', kind: 'shoe-size' },
  Capacity: { name: 'Capacity', control: 'option', kind: 'capacity' },
  Power: { name: 'Power', control: 'option', kind: 'power' },
  Material: { name: 'Material', control: 'facet', kind: 'material' },
  Style: { name: 'Style', control: 'facet', kind: 'style' },
  Brand: { name: 'Brand', control: 'facet', kind: 'brand' },
};

export function attributeDef(name: string): AttributeDef {
  return ATTRIBUTE_REGISTRY[name] ?? { name, control: 'facet', kind: 'generic' };
}

/** Approximate swatch colours for known colorways; unknown values fall back to neutral. */
const COLOR_HEX: Record<string, string> = {
  Black: '#1a1a1a', White: '#f5f5f5', Stone: '#d8cfc2', Olive: '#5b6236', Brown: '#7a4b2a',
  Beige: '#e3d3b8', Blue: '#1d4ed8', Red: '#c81e1e', Silver: '#b9c0cc', Nude: '#e0bfa4',
  Grey: '#6b7280', Gray: '#6b7280', Green: '#157a3d', Navy: '#1e3a8a',
};

export function colorHex(value: string): string | null {
  const direct = COLOR_HEX[value];
  if (direct) return direct;
  const lower = value.toLowerCase();
  const hit = Object.entries(COLOR_HEX).find(([key]) => lower.includes(key.toLowerCase()));
  return hit ? hit[1] : null;
}

/* ---------------- Products ---------------- */

const U = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=80`;

export const products: Product[] = [
  /* ---- Fashion (existing demo range, preserved) ---- */
  {
    id: 'p-1', slug: 'classic-black-hoodie', name: 'Classic Black Hoodie',
    shortDescription: 'A softly brushed cotton hoodie built for daily layering.',
    description: 'The Classic Black Hoodie pairs a premium brushed cotton feel with a confident silhouette and all-day comfort. Designed for cool evenings and polished everyday looks, it layers beautifully from commute to weekend plans.',
    department: 'fashion', category: 'men', brand: 'JB', featured: true, newArrival: true, status: 'ACTIVE',
    price: 2500, compareAtPrice: 3200,
    images: [U('photo-1521572267360-ee0c2909d518'), U('photo-1503342217505-b0a15ec3261c'), U('photo-1529139574466-a303027c1d8b')],
    variants: [
      { id: 'v-1', sku: 'HOD-BLK-M', name: 'Black / M', price: 2500, compareAtPrice: 3200, attributes: { Color: 'Black', Size: 'M' }, inStock: true },
      { id: 'v-2', sku: 'HOD-BLK-L', name: 'Black / L', price: 2500, compareAtPrice: 3200, attributes: { Color: 'Black', Size: 'L' }, inStock: true },
      { id: 'v-3', sku: 'HOD-BLK-XL', name: 'Black / XL', price: 2500, compareAtPrice: 3200, attributes: { Color: 'Black', Size: 'XL' }, inStock: false },
    ],
    createdAt: '2026-08-28T09:00:00+03:00', specs: { Material: 'Brushed cotton fleece', Fit: 'Regular', Care: 'Machine wash cold' },
  },
  {
    id: 'p-2', slug: 'mila-tapered-trouser', name: 'Mila Tapered Trouser',
    shortDescription: 'Crisp drape and sharp detail for polished everyday wear.',
    description: 'The Mila Tapered Trouser blends a tailored profile with comfort-first fabric. It moves from office-ready to after-hours without losing ease, giving the wardrobe an instant premium finish.',
    department: 'fashion', category: 'women', brand: 'JB', featured: true, newArrival: false, status: 'ACTIVE',
    price: 3800, compareAtPrice: 4300,
    images: [U('photo-1483985988355-763728e1935b'), U('photo-1524504388940-b1c1722653e1')],
    variants: [
      { id: 'v-4', sku: 'TRO-WHT-6', name: 'Stone / 6', price: 3800, compareAtPrice: 4300, attributes: { Color: 'Stone', Size: '6' }, inStock: true },
      { id: 'v-5', sku: 'TRO-WHT-8', name: 'Stone / 8', price: 3800, compareAtPrice: 4300, attributes: { Color: 'Stone', Size: '8' }, inStock: true },
    ],
    createdAt: '2026-07-14T09:00:00+03:00', specs: { Material: 'Stretch twill', Fit: 'Tapered', Care: 'Machine wash cold' },
  },
  {
    id: 'p-3', slug: 'atlas-utility-shirt', name: 'Atlas Utility Shirt',
    shortDescription: 'Easy structure with a relaxed yardage and refined utility finish.',
    description: 'The Atlas Utility Shirt delivers a structured silhouette without feeling rigid. Its refined finish works with denim, tailored trousers, and layered fits for a versatile wardrobe base.',
    department: 'fashion', category: 'men', brand: 'JB', featured: false, newArrival: true, status: 'ACTIVE',
    price: 2950,
    images: [U('photo-1515886657613-9f3515b0c78f'), U('photo-1521572163474-6864f9cf17ab')],
    variants: [
      { id: 'v-6', sku: 'SHR-OLV-M', name: 'Olive / M', price: 2950, attributes: { Color: 'Olive', Size: 'M' }, inStock: true },
      { id: 'v-7', sku: 'SHR-OLV-L', name: 'Olive / L', price: 2950, attributes: { Color: 'Olive', Size: 'L' }, inStock: true },
    ],
    createdAt: '2026-08-30T09:00:00+03:00', specs: { Material: 'Cotton ripstop', Fit: 'Relaxed', Care: 'Machine wash cold' },
  },
  {
    id: 'p-4', slug: 'solace-knit-set', name: 'Solace Knit Set',
    shortDescription: 'A modern knit layering set made for softness and movement.',
    description: 'The Solace Knit Set is designed for polished, low-effort styling. The soft knit structure keeps it comfortable while the lean silhouette delivers a clean, intentional finish.',
    department: 'fashion', category: 'women', brand: 'JB', featured: true, newArrival: true, status: 'ACTIVE',
    price: 5200,
    images: [U('photo-1529139574466-a303027c1d8b'), U('photo-1496747611176-843222e1e57c')],
    variants: [
      { id: 'v-8', sku: 'KNT-BLK-S', name: 'Black / S', price: 5200, attributes: { Color: 'Black', Size: 'S' }, inStock: true },
      { id: 'v-9', sku: 'KNT-BLK-M', name: 'Black / M', price: 5200, attributes: { Color: 'Black', Size: 'M' }, inStock: true },
    ],
    createdAt: '2026-09-02T09:00:00+03:00', specs: { Material: 'Soft-touch knit', Fit: 'Lean', Care: 'Hand wash recommended' },
  },
  {
    id: 'p-5', slug: 'nairobi-utility-bag', name: 'Nairobi Utility Bag',
    shortDescription: 'A structured carry-all designed for workdays and city movement.',
    description: 'The Nairobi Utility Bag brings function and refinement together with durable finishes, practical storage, and a clean silhouette that pairs well with everyday essentials.',
    department: 'fashion', category: 'accessories', brand: 'JB', featured: false, newArrival: true, status: 'ACTIVE',
    price: 4200, compareAtPrice: 5000,
    images: [U('photo-1548036328-c9fa89d128fa'), U('photo-1525966222134-fcfa99b8ae77')],
    variants: [
      { id: 'v-10', sku: 'BAG-BRN-01', name: 'Brown / Standard', price: 4200, compareAtPrice: 5000, attributes: { Color: 'Brown', Material: 'Canvas' }, inStock: true },
    ],
    createdAt: '2026-09-05T09:00:00+03:00', specs: { Material: 'Waxed canvas, leather trim', Care: 'Wipe clean' },
  },
  {
    id: 'p-6', slug: 'marina-overshirt', name: 'Marina Overshirt',
    shortDescription: 'A light utility layer for transitional weather and everyday ease.',
    description: 'The Marina Overshirt brings an elevated layer to the wardrobe with a structured fit and soft hand feel. Built for layering and day-to-night ease, it plays across relaxed and tailored looks.',
    department: 'fashion', category: 'women', brand: 'JB', featured: false, newArrival: true, status: 'ACTIVE',
    price: 4600,
    images: [U('photo-1529139574466-a303027c1d8b'), U('photo-1483985988355-763728e1935b')],
    variants: [
      { id: 'v-11', sku: 'OVR-BEIGE-M', name: 'Beige / M', price: 4600, attributes: { Color: 'Beige', Size: 'M' }, inStock: true },
      { id: 'v-12', sku: 'OVR-BEIGE-L', name: 'Beige / L', price: 4600, attributes: { Color: 'Beige', Size: 'L' }, inStock: false },
    ],
    createdAt: '2026-09-08T09:00:00+03:00', specs: { Material: 'Brushed twill', Fit: 'Relaxed', Care: 'Machine wash cold' },
  },
  /* ---- Footwear ---- */
  {
    id: 'p-7', slug: 'mombasa-road-runner', name: 'Mombasa Road Runner',
    shortDescription: 'A cushioned everyday sneaker for city miles and weekend runs.',
    description: 'The Mombasa Road Runner pairs breathable mesh with responsive cushioning and grippy outsoles. A versatile trainer for commutes, workouts and off-duty days.',
    department: 'footwear', category: 'sneakers', brand: 'JB', featured: true, newArrival: true, status: 'ACTIVE',
    price: 6500, compareAtPrice: 7800,
    images: [U('photo-1542291026-7eec264c27ff'), U('photo-1549298916-b41d501d3772')],
    variants: [
      { id: 'v-20', sku: 'SNK-RED-42', name: 'Red / 42', price: 6500, compareAtPrice: 7800, attributes: { Color: 'Red', 'Shoe Size': '42', Style: 'Lace-up' }, inStock: true },
      { id: 'v-21', sku: 'SNK-RED-43', name: 'Red / 43', price: 6500, compareAtPrice: 7800, attributes: { Color: 'Red', 'Shoe Size': '43', Style: 'Lace-up' }, inStock: true },
      { id: 'v-22', sku: 'SNK-WHT-42', name: 'White / 42', price: 6500, attributes: { Color: 'White', 'Shoe Size': '42', Style: 'Lace-up' }, inStock: true },
      { id: 'v-23', sku: 'SNK-WHT-44', name: 'White / 44', price: 6500, attributes: { Color: 'White', 'Shoe Size': '44', Style: 'Lace-up' }, inStock: false },
    ],
    createdAt: '2026-09-10T09:00:00+03:00', specs: { Material: 'Engineered mesh, rubber outsole', Style: 'Lace-up trainer', Care: 'Wipe clean, air dry' },
  },
  {
    id: 'p-8', slug: 'savanna-leather-loafer', name: 'Savanna Leather Loafer',
    shortDescription: 'A polished slip-on loafer for office days and occasions.',
    description: 'The Savanna Leather Loafer is cut from smooth leather with a cushioned insole and durable sole. Dresses up tailoring and sharpens off-duty looks alike.',
    department: 'footwear', category: 'footwear-men', brand: 'JB', featured: false, newArrival: true, status: 'ACTIVE',
    price: 7200,
    images: [U('photo-1560343090-f0409e92791a'), U('photo-1600185365483-26d7a4cc7519')],
    variants: [
      { id: 'v-24', sku: 'LOF-BRN-42', name: 'Brown / 42', price: 7200, attributes: { Color: 'Brown', 'Shoe Size': '42', Material: 'Leather', Style: 'Slip-on' }, inStock: true },
      { id: 'v-25', sku: 'LOF-BRN-43', name: 'Brown / 43', price: 7200, attributes: { Color: 'Brown', 'Shoe Size': '43', Material: 'Leather', Style: 'Slip-on' }, inStock: true },
      { id: 'v-26', sku: 'LOF-BLK-42', name: 'Black / 42', price: 7200, attributes: { Color: 'Black', 'Shoe Size': '42', Material: 'Leather', Style: 'Slip-on' }, inStock: true },
    ],
    createdAt: '2026-09-11T09:00:00+03:00', specs: { Material: 'Full-grain leather upper', Style: 'Slip-on loafer', Care: 'Polish regularly' },
  },
  {
    id: 'p-9', slug: 'amina-block-heel', name: 'Amina Block Heel',
    shortDescription: 'A comfortable block heel for workdays and evenings out.',
    description: 'The Amina Block Heel balances elegance with all-day comfort — a stable block heel, padded footbed and clean straps that pair with dresses and tailoring.',
    department: 'footwear', category: 'footwear-women', brand: 'JB', featured: true, newArrival: true, status: 'ACTIVE',
    price: 5800,
    images: [U('photo-1543163521-1bf539c55dd2')],
    variants: [
      { id: 'v-27', sku: 'HEEL-NDE-38', name: 'Nude / 38', price: 5800, attributes: { Color: 'Nude', 'Shoe Size': '38', Style: 'Block heel' }, inStock: true },
      { id: 'v-28', sku: 'HEEL-NDE-39', name: 'Nude / 39', price: 5800, attributes: { Color: 'Nude', 'Shoe Size': '39', Style: 'Block heel' }, inStock: true },
      { id: 'v-29', sku: 'HEEL-BLK-38', name: 'Black / 38', price: 5800, attributes: { Color: 'Black', 'Shoe Size': '38', Style: 'Block heel' }, inStock: false },
    ],
    createdAt: '2026-09-12T09:00:00+03:00', specs: { Material: 'Synthetic upper, cushioned footbed', Style: 'Block heel', Care: 'Wipe clean' },
  },
  /* ---- Kitchen & Home ---- */
  {
    id: 'p-10', slug: 'jikoni-electric-kettle', name: 'Jikoni Electric Kettle 1.8L',
    shortDescription: 'Fast-boiling 1.8L kettle with auto shut-off for busy kitchens.',
    description: 'The Jikoni Electric Kettle boils a full 1.8 litres quickly and safely, with cordless pouring, auto shut-off and boil-dry protection. A daily essential for tea, coffee and cooking.',
    department: 'kitchen-home', category: 'kitchen-appliances', brand: 'JB', featured: true, newArrival: true, status: 'ACTIVE',
    price: 3400, compareAtPrice: 4200,
    images: [U('photo-1590794056226-79ef3a8147e1')],
    variants: [
      { id: 'v-30', sku: 'KET-SLV-18', name: 'Silver / 1.8L', price: 3400, compareAtPrice: 4200, attributes: { Color: 'Silver', Capacity: '1.8L', Power: '1500W' }, inStock: true },
      { id: 'v-31', sku: 'KET-BLK-18', name: 'Black / 1.8L', price: 3400, attributes: { Color: 'Black', Capacity: '1.8L', Power: '1500W' }, inStock: true },
    ],
    createdAt: '2026-09-13T09:00:00+03:00', specs: { Capacity: '1.8 litres', Power: '1500W', Material: 'Stainless steel', Voltage: '220–240V' },
  },
  {
    id: 'p-11', slug: 'savanna-blender-pro', name: 'Savanna Blender Pro 1.5L',
    shortDescription: 'A 500W workhorse for smoothies, juices and daily blending.',
    description: 'The Savanna Blender Pro powers through fruit, vegetables and ice with a 1.5L jar, stainless blades and simple speed controls. Built for daily family use.',
    department: 'kitchen-home', category: 'kitchen-appliances', brand: 'JB', featured: false, newArrival: true, status: 'ACTIVE',
    price: 5600,
    images: [U('photo-1570222094114-d054a817e56b')],
    variants: [
      { id: 'v-32', sku: 'BLD-WHT-15', name: 'White / 1.5L', price: 5600, attributes: { Color: 'White', Capacity: '1.5L', Power: '500W' }, inStock: true },
      { id: 'v-33', sku: 'BLD-BLK-20', name: 'Black / 2L', price: 6800, attributes: { Color: 'Black', Capacity: '2L', Power: '500W' }, inStock: true },
    ],
    createdAt: '2026-09-14T09:00:00+03:00', specs: { Capacity: '1.5L / 2L jar', Power: '500W', Material: 'BPA-free jar, stainless blades', Voltage: '220–240V' },
  },
  {
    id: 'p-12', slug: 'karibu-cookware-set', name: 'Karibu 5-Piece Cookware Set',
    shortDescription: 'Non-stick pots and pans for everyday family cooking.',
    description: 'The Karibu 5-Piece Cookware Set covers daily cooking — saucepans, a frying pan and lids in durable non-stick aluminium that heats evenly and cleans easily. Suitable for gas and electric hobs.',
    department: 'kitchen-home', category: 'cookware', brand: 'JB', featured: true, newArrival: false, status: 'ACTIVE',
    price: 8900, compareAtPrice: 10500,
    images: [U('photo-1585515320310-259814833e62'), U('photo-1556909212-d5b604d0c90d')],
    variants: [
      { id: 'v-34', sku: 'COK-GRY-5P', name: 'Grey / 5-piece', price: 8900, compareAtPrice: 10500, attributes: { Color: 'Grey', Material: 'Non-stick aluminium' }, inStock: true },
    ],
    createdAt: '2026-07-20T09:00:00+03:00', specs: { Material: 'Non-stick aluminium', Pieces: '5 (3 pots with lids, 1 frying pan)', Hob: 'Gas & electric', Care: 'Hand wash recommended' },
  },
  {
    id: 'p-13', slug: 'cloud-cotton-duvet-set', name: 'Cloud Cotton Duvet Set',
    shortDescription: 'Soft breathable cotton bedding for restful nights.',
    description: 'The Cloud Cotton Duvet Set includes a duvet cover and pillowcases in breathable long-staple cotton. Cool in warm months, cosy when nights turn chilly.',
    department: 'kitchen-home', category: 'home-essentials', brand: 'JB', featured: false, newArrival: true, status: 'ACTIVE',
    price: 4800,
    images: [U('photo-1522771739844-6a9f6d5f14af')],
    variants: [
      { id: 'v-35', sku: 'DVD-WHT-DBL', name: 'White / Double', price: 4800, attributes: { Color: 'White', Size: 'Double', Material: 'Cotton' }, inStock: true },
      { id: 'v-36', sku: 'DVD-BEI-DBL', name: 'Beige / Double', price: 4800, attributes: { Color: 'Beige', Size: 'Double', Material: 'Cotton' }, inStock: true },
    ],
    createdAt: '2026-09-15T09:00:00+03:00', specs: { Material: '100% cotton', Includes: 'Duvet cover + 2 pillowcases', Care: 'Machine wash warm' },
  },
];

export const collections: Collection[] = [
  { slug: 'city-light', name: 'City Light', description: 'Polished essentials built for everyday movement.', productIds: ['p-1', 'p-2', 'p-8', 'p-13'] },
  { slug: 'weekend-edit', name: 'Weekend Edit', description: 'Relaxed silhouettes and easy layering for non-stop days.', productIds: ['p-1', 'p-3', 'p-7', 'p-5'] },
  { slug: 'heritage-essentials', name: 'Heritage Essentials', description: 'Staple wardrobes rooted in utility and comfort.', productIds: ['p-3', 'p-4', 'p-6'] },
  { slug: 'kitchen-starter', name: 'Kitchen Starter', description: 'The appliances and cookware every kitchen needs first.', productIds: ['p-10', 'p-11', 'p-12'] },
  { slug: 'step-forward', name: 'Step Forward', description: 'Footwear picks for work, weekends and everything between.', productIds: ['p-7', 'p-8', 'p-9'] },
];

/* ---------------- Basic selectors (backward compatible) ---------------- */

export function getPublicProducts(): Product[] {
  return products.filter((product) => product.status === 'ACTIVE');
}

export function getFeaturedProducts(): Product[] {
  return getPublicProducts().filter((product) => product.featured).slice(0, 4);
}

export function getNewArrivals(): Product[] {
  return [...getPublicProducts()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
}

export function getProductBySlug(slug: string): Product | undefined {
  return getPublicProducts().find((product) => product.slug === slug);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((category) => category.slug === slug);
}

export function getDepartmentBySlug(slug: string): Department | undefined {
  return departments.find((department) => department.slug === slug);
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return collections.find((collection) => collection.slug === slug);
}

/** Category lookup includes products in child categories (e.g. sneakers under footwear). */
export function getProductsByCategory(slug: string): Product[] {
  const category = getCategoryBySlug(slug);
  const slugs = new Set<string>([slug]);
  if (category) {
    // Include direct children of this category.
    for (const child of categories) {
      if (child.parentSlug === slug) slugs.add(child.slug);
    }
    // If this category is itself a child, a department view also matches siblings —
    // handled at the department level; here we match the category exactly.
  }
  return getPublicProducts().filter((product) => slugs.has(product.category));
}

export function getProductsByDepartment(slug: DepartmentSlug): Product[] {
  return getPublicProducts().filter((product) => product.department === slug);
}

export function getSubcategories(slug: string): Category[] {
  return categories.filter((category) => category.parentSlug === slug);
}

export function getDepartmentCategories(slug: DepartmentSlug): Category[] {
  return categories.filter((category) => category.department === slug && !category.parentSlug);
}

export function getProductsByCollection(slug: string): Product[] {
  const collection = getCollectionBySlug(slug);
  if (!collection) return [];
  const byId = new Map(getPublicProducts().map((product) => [product.id, product]));
  return collection.productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p);
}

export function getProductsByQuery(query: string): Product[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return getPublicProducts();
  return getPublicProducts().filter((product) => {
    const category = getCategoryBySlug(product.category);
    const department = getDepartmentBySlug(product.department);
    const haystack = [
      product.name, product.shortDescription, product.description, product.brand,
      category?.name ?? '', department?.name ?? '',
      ...product.variants.flatMap((v) => Object.values(v.attributes)),
    ].join(' ').toLowerCase();
    return normalized.split(/\s+/).every((token) => haystack.includes(token));
  });
}

export function getAvailableProductsCount(): number {
  return getPublicProducts().length;
}

export function getProductDepartment(product: Product): Department | undefined {
  return getDepartmentBySlug(product.department);
}

export function getProductCategory(product: Product): Category | undefined {
  return getCategoryBySlug(product.category);
}

export function productInStock(product: Product): boolean {
  return product.variants.some((variant) => variant.inStock);
}

export function discountPercent(product: { price: number; compareAtPrice?: number }): number | null {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return null;
  return Math.round((1 - product.price / product.compareAtPrice) * 100);
}

/* ---------------- Discovery: category-aware filtering ---------------- */

export type DiscoveryQuery = {
  department?: DepartmentSlug;
  category?: string;
  q?: string;
  sort?: 'featured' | 'price-asc' | 'price-desc' | 'name' | 'newest';
  attrs?: Record<string, string[]>;
  inStockOnly?: boolean;
  page?: number;
};

export type Facet = {
  attribute: string;
  control: AttributeControl;
  values: Array<{ value: string; count: number }>;
};

export type PriceBucket = { label: string; min: number; max: number | null };

const PAGE_SIZE = 12;

/** Scope products by department/category/search before faceting. */
export function scopeProducts(query: DiscoveryQuery): Product[] {
  let list = getPublicProducts();
  if (query.department) list = list.filter((p) => p.department === query.department);
  if (query.category) {
    const inCategory = new Set(getProductsByCategory(query.category).map((p) => p.id));
    list = list.filter((p) => inCategory.has(p.id));
  }
  if (query.q?.trim()) {
    const inQuery = new Set(getProductsByQuery(query.q).map((p) => p.id));
    list = list.filter((p) => inQuery.has(p.id));
  }
  return list;
}

/**
 * Derive filter facets ONLY from attributes present in the scoped products,
 * with ≥2 distinct values. A footwear search never shows Capacity/Power;
 * an appliance search never shows Shoe Size.
 */
export function deriveFacets(scope: Product[]): Facet[] {
  const counts = new Map<string, Map<string, number>>();
  for (const product of scope) {
    const seen = new Map<string, Set<string>>();
    for (const variant of product.variants) {
      for (const [attr, value] of Object.entries(variant.attributes)) {
        if (!seen.has(attr)) seen.set(attr, new Set());
        seen.get(attr)!.add(value);
      }
    }
    for (const [attr, values] of seen) {
      if (!counts.has(attr)) counts.set(attr, new Map());
      const bucket = counts.get(attr)!;
      for (const value of values) bucket.set(value, (bucket.get(value) ?? 0) + 1);
    }
  }
  const facets: Facet[] = [];
  for (const [attribute, bucket] of counts) {
    if (bucket.size < 2) continue;
    // Single-brand catalogues don't need a brand facet.
    if (attribute === 'Brand') continue;
    facets.push({
      attribute,
      control: attributeDef(attribute).control,
      values: [...bucket.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value)),
    });
  }
  // Stable, meaningful order: Color → sizes → technical → material/style.
  const order = ['Color', 'Size', 'Shoe Size', 'Capacity', 'Power', 'Material', 'Style'];
  facets.sort((a, b) => {
    const ia = order.indexOf(a.attribute);
    const ib = order.indexOf(b.attribute);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return facets;
}

/** Price buckets computed from the scoped price range (data-driven, not hard-coded). */
export function derivePriceBuckets(scope: Product[]): PriceBucket[] {
  if (scope.length < 2) return [];
  const prices = scope.map((p) => p.price).sort((a, b) => a - b);
  const min = prices[0];
  const max = prices[prices.length - 1];
  if (max - min < 1000) return [];
  const fmt = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
  const t1 = min + (max - min) / 3;
  const t2 = min + ((max - min) * 2) / 3;
  return [
    { label: `Under ${fmt(t1)}`, min, max: Math.floor(t1) },
    { label: `${fmt(t1)} – ${fmt(t2)}`, min: Math.ceil(t1), max: Math.floor(t2) },
    { label: `Above ${fmt(t2)}`, min: Math.ceil(t2), max: null },
  ];
}

export function applyDiscovery(scope: Product[], query: DiscoveryQuery): Product[] {
  let list = [...scope];
  if (query.attrs) {
    for (const [attribute, values] of Object.entries(query.attrs)) {
      if (!values.length) continue;
      list = list.filter((product) =>
        product.variants.some((variant) => values.includes(variant.attributes[attribute] ?? '')),
      );
    }
  }
  if (query.inStockOnly) list = list.filter(productInStock);
  switch (query.sort) {
    case 'price-asc': list.sort((a, b) => a.price - b.price); break;
    case 'price-desc': list.sort((a, b) => b.price - a.price); break;
    case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'newest': list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
    default: list.sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt.localeCompare(a.createdAt));
  }
  return list;
}

export function paginate<T>(items: T[], page: number, pageSize: number = PAGE_SIZE): { items: T[]; page: number; totalPages: number; total: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  return {
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    totalPages,
    total: items.length,
  };
}

/** Parse URL search params into a DiscoveryQuery (shareable discovery state). */
export function parseDiscoveryQuery(params: Record<string, string | string[] | undefined>): DiscoveryQuery {
  const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const all = (v: string | string[] | undefined): string[] => {
    if (!v) return [];
    const raw = Array.isArray(v) ? v : [v];
    return raw.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
  };
  const attrs: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (['department', 'category', 'q', 'sort', 'inStock', 'page'].includes(key)) continue;
    const values = all(value);
    if (values.length) attrs[key] = values;
  }
  const sort = first(params.sort);
  const department = first(params.department);
  return {
    department: departments.some((d) => d.slug === department) ? (department as DepartmentSlug) : undefined,
    category: first(params.category),
    q: first(params.q),
    sort: sort === 'price-asc' || sort === 'price-desc' || sort === 'name' || sort === 'newest' ? sort : 'featured',
    attrs,
    inStockOnly: first(params.inStock) === 'true',
    page: Math.max(1, Number(first(params.page)) || 1),
  };
}

/** Serialize a DiscoveryQuery back to URL params (keeps URL ↔ UI ↔ results in sync). */
export function discoveryQueryString(query: DiscoveryQuery): string {
  const params = new URLSearchParams();
  if (query.department) params.set('department', query.department);
  if (query.category) params.set('category', query.category);
  if (query.q) params.set('q', query.q);
  if (query.sort && query.sort !== 'featured') params.set('sort', query.sort);
  if (query.attrs) {
    for (const [key, values] of Object.entries(query.attrs)) {
      if (values.length) params.set(key, values.join(','));
    }
  }
  if (query.inStockOnly) params.set('inStock', 'true');
  if (query.page && query.page > 1) params.set('page', String(query.page));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Lightweight suggestion index for search-as-you-type (names, categories, departments). */
export function getSearchSuggestions(query: string, limit = 6): Array<{ type: 'product' | 'category' | 'department'; label: string; href: string }> {
  const normalized = query.trim().toLowerCase();
  if (normalized.length < 2) return [];
  const suggestions: Array<{ type: 'product' | 'category' | 'department'; label: string; href: string }> = [];
  for (const department of departments) {
    if (department.name.toLowerCase().includes(normalized)) {
      suggestions.push({ type: 'department', label: department.name, href: `/shop?department=${department.slug}` });
    }
  }
  for (const category of categories) {
    if (category.name.toLowerCase().includes(normalized)) {
      suggestions.push({ type: 'category', label: category.name, href: `/categories/${category.slug}` });
    }
  }
  for (const product of getProductsByQuery(query).slice(0, 4)) {
    suggestions.push({ type: 'product', label: product.name, href: `/products/${product.slug}` });
  }
  return suggestions.slice(0, limit);
}

/* ---------------- Backend cutover ---------------- */
/**
 * When merchandising onboards real catalogue data, replace the static
 * `products`/`categories`/`collections` above with responses from:
 *   GET /api/v1/catalog/products        (products + category + variants + images)
 *   GET /api/v1/catalog/products/:id    (product + inventory + attribute values)
 *   GET /api/v1/admin/categories        (operations; build department mapping from parentId)
 *   GET /api/v1/admin/collections       (operations)
 *   GET /api/v1/admin/attributes        (operations; replaces ATTRIBUTE_REGISTRY)
 * All helpers in this module consume the same shapes, so pages, filters and
 * product UX require no rewrite — only this data source changes.
 */
