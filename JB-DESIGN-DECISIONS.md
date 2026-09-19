# JB Design Decisions (Mercantile transformation)

## Why JB Mercantile instead of Veyra / clothing-only JB
The business sells fashion, footwear and kitchen & home. A clothing-shaped IA (Men/Women/Accessories nav, apparel-only filters, size/color assumptions) would make every new department look bolted on. The frontend is now organized around departments → categories → flexible attributes, so Beauty/Electronics/Home-décor later need data, not redesigns.

## Why dynamic, data-driven categories
Nav, mega-menu, footer, pills, suggestions and sitemap all render from `lib/catalog.ts`. No JSX hard-codes a department. Category hierarchy uses `parentSlug`, so nesting (Sneakers under footwear) works without code changes — mirroring the backend's `Category.parentId`.

## Why the catalogue still ships static demo data
The backend product database is empty by design (seed: one `apparel` category, zero products) and exposes only `GET /catalog/products[/:id]` publicly. Wiring the storefront to live APIs today would render an empty store. The demo dataset follows the repo's established static-demo pattern (Unsplash imagery note in `next.config.mjs`) and is extended to all three departments with realistic KES pricing. `lib/catalog.ts` documents the exact cutover: replace its data with `/catalog/*` + `/admin/*` responses; pages/filters/product UX consume identical shapes and need no rewrite. Cart/checkout/orders/payments already run on live APIs and are untouched.

## Why flexible attributes + category-aware filters
Fashion filters (Size/Color) are meaningless on kettles; Capacity/Power are meaningless on shirts. Facets derive per search scope from attributes actually present (≥2 values), and `ATTRIBUTE_REGISTRY` maps each attribute to its control (swatch/option/checkbox). `'Shoe Size'` is a distinct kind from apparel `'Size'` so EU 38–44 never mixes with S/M/L.

## Why Light / Dark / System
Customer-продажи happen day and night on mobile; a persisted System-following theme is expected of premium retail. Dark is hand-designed (deep navy, lightened royal blue, AA re-checked) — not inverted. Preference persists in `localStorage` (`jb-mercantile-theme`); a blocking head script applies it pre-paint (no flash); `ThemeProvider` syncs OS changes only in System mode; toggle lives in header, mobile drawer and account preferences.

## Why Royal Blue + White (`#1D4ED8`, `#0047AB`)
`#0047AB` is the classic royal-blue accent for text/links; `#1D4ED8` is the action shade because it holds AA against white for body text. Dark theme lightens the action blue (`#3F6FE0`) to keep white-text contrast while staying recognizably royal.

## Why URL-driven discovery
Filters/sort/search/page live in query params: shareable links, working back-button, reproducible merchandising reviews, and canonical category/department pages for SEO.

## Why reusable product components
One `ProductCard`, one `ProductGallery`, one `ProductSpecifications`, one `ProductActions` serve sneakers and saucepans alike via the attribute registry — no `if (category === ...)` branches in UI code.

## Why no ratings/reviews/warranties in demo content
No review or warranty data exists anywhere in the system. Displaying stars or guarantee claims would be fabrication. Cards show only price/compare/stock; specs show material/care facts.

## Business decisions still required (human input)
1. Production domain + `NEXT_PUBLIC_APP_URL` (sitemap/OG/sitemap use placeholder default).
2. Real product onboarding: photography, taxonomy mapping to departments, attribute definitions via `/admin/attributes` (replacing `ATTRIBUTE_REGISTRY`).
3. Delivery coverage claims: current copy says "across our delivery zones" — confirm zones served.
4. Whether guest checkout stays, and password-reset flow (no UI routes exist — unchanged scope).
5. Review system: none exists; product UX deliberately omits ratings until a real backend ships.
