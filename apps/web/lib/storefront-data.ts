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
  category: string;
  brand: string;
  featured: boolean;
  newArrival: boolean;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  price: number;
  compareAtPrice?: number;
  images: string[];
  variants: ProductVariant[];
};

export type Category = {
  slug: string;
  name: string;
  description: string;
};

export type Collection = {
  slug: string;
  name: string;
  description: string;
};

export const categories: Category[] = [
  { slug: 'men', name: 'Men', description: 'Structured essentials and elevated staples for everyday wear.' },
  { slug: 'women', name: 'Women', description: 'Soft layers, tailored silhouettes, and statement pieces.' },
  { slug: 'accessories', name: 'Accessories', description: 'Finishing touches for complete looks.' },
  { slug: 'new-arrivals', name: 'New Arrivals', description: 'Fresh seasonal pieces ready for the wardrobe.' },
];

export const collections: Collection[] = [
  { slug: 'city-light', name: 'City Light', description: 'Polished essentials built for everyday movement.' },
  { slug: 'weekend-edit', name: 'Weekend Edit', description: 'Relaxed silhouettes and easy layering for non-stop days.' },
  { slug: 'heritage-essentials', name: 'Heritage Essentials', description: 'Staple wardrobes rooted in utility and comfort.' },
];

export const products: Product[] = [
  {
    id: 'p-1',
    slug: 'classic-black-hoodie',
    name: 'Classic Black Hoodie',
    shortDescription: 'A softly brushed cotton hoodie built for daily layering.',
    description:
      'The Classic Black Hoodie pairs a premium brushed cotton feel with a confident silhouette and all-day comfort. Designed for Kenya’s cool evenings and polished everyday looks, it layers beautifully from commute to weekend plans.',
    category: 'men',
    brand: 'Veyra',
    featured: true,
    newArrival: true,
    status: 'ACTIVE',
    price: 2500,
    compareAtPrice: 3200,
    images: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    ],
    variants: [
      { id: 'v-1', sku: 'HOD-BLK-M', name: 'Black / M', price: 2500, compareAtPrice: 3200, attributes: { Color: 'Black', Size: 'M' }, inStock: true },
      { id: 'v-2', sku: 'HOD-BLK-L', name: 'Black / L', price: 2500, compareAtPrice: 3200, attributes: { Color: 'Black', Size: 'L' }, inStock: true },
      { id: 'v-3', sku: 'HOD-BLK-XL', name: 'Black / XL', price: 2500, compareAtPrice: 3200, attributes: { Color: 'Black', Size: 'XL' }, inStock: false },
    ],
  },
  {
    id: 'p-2',
    slug: 'mila-tapered-trouser',
    name: 'Mila Tapered Trouser',
    shortDescription: 'Crisp drape and sharp detail for polished everyday wear.',
    description:
      'The Mila Tapered Trouser blends a tailored profile with comfort-first fabric. It moves from office-ready to after-hours without losing ease, giving the wardrobe an instant premium finish.',
    category: 'women',
    brand: 'Veyra',
    featured: true,
    newArrival: false,
    status: 'ACTIVE',
    price: 3800,
    compareAtPrice: 4300,
    images: [
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
    ],
    variants: [
      { id: 'v-4', sku: 'TRO-WHT-6', name: 'Stone / 6', price: 3800, compareAtPrice: 4300, attributes: { Color: 'Stone', Size: '6' }, inStock: true },
      { id: 'v-5', sku: 'TRO-WHT-8', name: 'Stone / 8', price: 3800, compareAtPrice: 4300, attributes: { Color: 'Stone', Size: '8' }, inStock: true },
    ],
  },
  {
    id: 'p-3',
    slug: 'atlas-utility-shirt',
    name: 'Atlas Utility Shirt',
    shortDescription: 'Easy structure with a relaxed yardage and refined utility finish.',
    description:
      'The Atlas Utility Shirt delivers a structured silhouette without feeling rigid. Its refined finish works with denim, tailored trousers, and layered fits for a versatile wardrobe base.',
    category: 'men',
    brand: 'Veyra',
    featured: false,
    newArrival: true,
    status: 'ACTIVE',
    price: 2950,
    images: [
      'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
    ],
    variants: [
      { id: 'v-6', sku: 'SHR-OLV-M', name: 'Olive / M', price: 2950, attributes: { Color: 'Olive', Size: 'M' }, inStock: true },
      { id: 'v-7', sku: 'SHR-OLV-L', name: 'Olive / L', price: 2950, attributes: { Color: 'Olive', Size: 'L' }, inStock: true },
    ],
  },
  {
    id: 'p-4',
    slug: 'solace-knit-set',
    name: 'Solace Knit Set',
    shortDescription: 'A modern knit layering set made for softness and movement.',
    description:
      'The Solace Knit Set is designed for polished, low-effort styling. The soft knit structure keeps it comfortable while the lean silhouette delivers a clean, intentional finish.',
    category: 'women',
    brand: 'Veyra',
    featured: true,
    newArrival: true,
    status: 'ACTIVE',
    price: 5200,
    images: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80',
    ],
    variants: [
      { id: 'v-8', sku: 'KNT-BLK-S', name: 'Black / S', price: 5200, attributes: { Color: 'Black', Size: 'S' }, inStock: true },
      { id: 'v-9', sku: 'KNT-BLK-M', name: 'Black / M', price: 5200, attributes: { Color: 'Black', Size: 'M' }, inStock: true },
    ],
  },
  {
    id: 'p-5',
    slug: 'nairobi-utility-bag',
    name: 'Nairobi Utility Bag',
    shortDescription: 'A structured carry-all designed for workdays and city movement.',
    description:
      'The Nairobi Utility Bag brings function and refinement together with durable finishes, practical storage, and a clean silhouette that pairs well with everyday essentials.',
    category: 'accessories',
    brand: 'Veyra',
    featured: false,
    newArrival: true,
    status: 'ACTIVE',
    price: 4200,
    compareAtPrice: 5000,
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80',
    ],
    variants: [
      { id: 'v-10', sku: 'BAG-BRN-01', name: 'Brown / Standard', price: 4200, compareAtPrice: 5000, attributes: { Color: 'Brown', Size: 'Standard' }, inStock: true },
    ],
  },
  {
    id: 'p-6',
    slug: 'marina-overshirt',
    name: 'Marina Overshirt',
    shortDescription: 'A light utility layer for transitional weather and everyday ease.',
    description:
      'The Marina Overshirt brings an elevated layer to the wardrobe with a structured fit and soft hand feel. Built for layering and day-to-night ease, it plays across relaxed and tailored looks.',
    category: 'women',
    brand: 'Veyra',
    featured: false,
    newArrival: true,
    status: 'ACTIVE',
    price: 4600,
    images: [
      'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80',
    ],
    variants: [
      { id: 'v-11', sku: 'OVR-BEIGE-M', name: 'Beige / M', price: 4600, attributes: { Color: 'Beige', Size: 'M' }, inStock: true },
      { id: 'v-12', sku: 'OVR-BEIGE-L', name: 'Beige / L', price: 4600, attributes: { Color: 'Beige', Size: 'L' }, inStock: false },
    ],
  },
];

export function getPublicProducts() {
  return products.filter((product) => product.status === 'ACTIVE');
}

export function getFeaturedProducts() {
  return getPublicProducts().filter((product) => product.featured).slice(0, 4);
}

export function getNewArrivals() {
  return getPublicProducts().filter((product) => product.newArrival).slice(0, 4);
}

export function getProductBySlug(slug: string) {
  return getPublicProducts().find((product) => product.slug === slug);
}

export function getProductsByCategory(slug: string) {
  return getPublicProducts().filter((product) => product.category === slug);
}

export function getProductsByCollection(slug: string) {
  return getPublicProducts().filter((product) => product.id.includes(slug.slice(0, 3)) || slug === 'weekend-edit');
}

export function getProductsByQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return getPublicProducts();

  return getPublicProducts().filter((product) => {
    const haystack = [product.name, product.shortDescription, product.description, product.brand].join(' ').toLowerCase();
    return haystack.includes(normalized);
  });
}

export function getCategoryBySlug(slug: string) {
  return categories.find((category) => category.slug === slug);
}

export function getCollectionBySlug(slug: string) {
  return collections.find((collection) => collection.slug === slug);
}

export function getAvailableProductsCount() {
  return getPublicProducts().length;
}
