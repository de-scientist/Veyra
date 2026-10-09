# JB Mercantile — Admin Dashboard User Manual

## 1. Document Information and Version

| Item | Detail |
|---|---|
| Title | JB Mercantile Admin Dashboard User Manual |
| Version | 1.2 |
| Date | 2026-10-09 |
| Reader | Non-technical administrators (basic computer skills assumed) |
| Basis | Source-code reconciliation of the JB Mercantile repository (no live browser testing was available, so all navigation is described in words; no screenshots are included and none are fabricated). Reconciles v1.0 against the implementation; supersedes the audit in `JB-MERCANTILE-ADMIN-MANUAL-AUDIT.md` where they differ (see `JB-MERCANTILE-MANUAL-IMPLEMENTATION-RECONCILIATION.md`; open business questions live in `BUSINESS-DECISIONS.md`). v1.2 documents the simplified product-creation flow with the dedicated Pricing & Stock section (see `JB-PRODUCT-CREATION-AND-PRICING-UX-REPORT.md`) |
| Scope | Admin dashboard operation with emphasis on creating, publishing, editing, and managing products |

> **How to use this manual.** Chapters 2–7 get you signed in and oriented.
> Chapters 8–17 are the product-creation tutorial (the core of this manual).
> Chapter 18 is a complete worked example. Chapters 19–21 cover editing,
> status, and supporting catalogue data. Chapter 22 tours the remaining admin
> modules. Chapters 23–29 are troubleshooting, security, FAQ, glossary,
> checklists, and support. Items the system does not support are stated
> plainly wherever they arise, and open questions are collected in
> Chapter 28.

## 2. Table of Contents

1. Document Information and Version
2. Table of Contents
3. Welcome to JB Mercantile Admin
4. What the Admin Dashboard Is Used For
5. Before You Begin
6. Signing In
7. Understanding the Dashboard Layout
8. Understanding the Catalogue
9. Product Creation at a Glance
10. Step-by-Step Product Creation
11. Product Images and Cloudinary
12. Categories and Collections
13. Attributes and Variants
14. SKUs
15. Pricing and Discounts
16. Inventory and Stock
17. SEO and Product Visibility
18. Saving, Publishing and Archiving
19. Complete Worked Example
20. Editing Existing Products
21. Managing Categories, Collections and Attributes
22. Other Admin Modules
23. Troubleshooting
24. Security and Good Operating Practices
25. Frequently Asked Questions
26. Glossary
27. Product Creation Quick-Reference Checklist
28. Support and Escalation
29. Document Limitations and Items Requiring Confirmation

## 3. Welcome to JB Mercantile Admin

JB Mercantile is an online retail store selling fashion, footwear, and
kitchen & home goods in Kenya (prices in Kenya Shillings, KSh). The **Admin
Dashboard** (also called the operations dashboard) is the staff-only area of
the website where administrators manage the product catalogue, stock, orders,
payments, deliveries, customers, and related business data.

This manual teaches you to operate the dashboard starting from zero. You do
not need programming knowledge. When a technical term first appears, it is
explained in plain English, and the most important terms are collected in the
Glossary (Chapter 26).

> **Note.** This manual describes the system exactly as implemented at the
> time of writing. If a button, label, or workflow described here does not
> match what you see, stop and report it to technical support (Chapter 28)
> rather than guessing.

## 4. What the Admin Dashboard Is Used For

As an administrator you can:

- Create, edit, publish, and archive products (Chapters 9–20).
- Upload and organise product images (Chapter 11).
- Manage categories, collections, and attributes (Chapters 12–13, 21).
- Generate product variants and SKUs (Chapters 13–14).
- Set prices and manage stock levels (Chapters 15–16).
- Review orders, payments, deliveries, and returns (Chapter 22).
- Manage customers, reviews, coupons, notifications, and reports
  (Chapter 22).
- Review the audit trail of sensitive operations (Chapter 22).

What you **cannot** do in the dashboard (by design):

- Delete products, variants, or transaction history permanently. The system
  archives instead of deleting, so history is preserved.
- Set a product's price to be paid manually by staff — only verified M-Pesa
  payments (or audited manual verification) mark an order as paid.
- Edit website code, server settings, or secrets. The Settings page is
  read-only.

## 5. Before You Begin

1. You need an administrator account. Accounts are created by existing
   administrators or technical staff; you cannot grant access to yourself.
   Your account must have an operations role (staff, admin, or super-admin).
   A plain customer account cannot open the dashboard.
2. You need a modern web browser (Chrome, Edge, Firefox, or Safari) with
   JavaScript enabled and cookies allowed. The dashboard signs you in with a
   secure cookie; private/incognito windows work but will sign you out when
   closed.
3. Product images should be prepared in advance as **JPG, PNG, or WebP**
   files — clear, well-lit photos. Other formats (for example GIF, SVG, PDF)
   are rejected. Very large files may be rejected by size limits that are
   enforced silently; if an upload fails, try a smaller file (see
   Chapter 23).
4. Have your product facts ready: exact name, description (at least
   12 characters), category, prices in KSh, opening stock quantities, and the
   options the product comes in (for example sizes or colours).
5. If your user account only has limited permissions, some menu items or
   buttons may be missing. That is normal — see Chapter 7 and Chapter 23.

## 6. Signing In

### 6.1. How to sign in

1. Go to the store website and open the sign-in page (`/login`), or follow
   the sign-in link your administrator gave you.
2. You will see the heading **"Sign in to JB Mercantile"** under the eyebrow
   **"Welcome back"**.
3. Enter your **Email address** (for example `you@example.com`).
4. Enter your **Password** (minimum 8 characters). Tick **"Show password"**
   if you want to check what you typed.
5. Select **"Sign in"**. While it processes, the button reads
   **"Signing in…"**.
6. Success: you leave the sign-in page. If you were sent to sign in from a
   protected page, you return there automatically. Otherwise you go to your
   account page.

### 6.2. How to reach the dashboard after signing in

1. Open your account menu (your name/avatar in the site header).
2. If your account has an operations role, the menu contains
   **"Admin Dashboard"**. Select it to open `/admin/dashboard`.
3. If **"Admin Dashboard"** is missing, your account is a customer account or
   lacks an operations role — ask your administrator to grant access. Do not
   try to type admin addresses directly; you will be bounced back to sign-in
   or to a **"403 — Not authorized"** page.

### 6.3. Sign-in problems

| What you see | What it means | What to do |
|---|---|---|
| Red message under the form (for example invalid email or password) | The email/password combination was not recognised | Re-type carefully (passwords are case-sensitive); use **"Show password"** to check |
| Returned to the sign-in page when opening `/admin/…` | You are not signed in (session expired or signed out) | Sign in again; you will be returned to the page you wanted |
| **"403 — Not authorized"** with *"You do not have permission to access this area."* | You are signed in but lack an operations role | Ask your administrator to grant access; the page offers **"Back to storefront"** and **"My account"** |
| Account suspended/deleted message | Your account was deactivated | Contact your administrator; you cannot resolve this yourself |

Sessions last **7 days**. If the dashboard starts behaving as if you are
signed out (for example data fails to load), sign in again.

### 6.4. How to sign out

- **From the storefront:** open the account menu and sign out (you will see a
  confirmation that you have been signed out).
- **From the admin sidebar:** open the account menu (your name at the bottom
  of the sidebar) and select **"Sign out"**, or use the **"Log out"** button
  in the sidebar footer. A confirmation dialog titled **"Log out of JB
  operations?"** appears with the text *"You will be signed out of the
  operations dashboard on this device."* Select **"Log out"** to confirm or
  close the dialog to stay signed in. Always sign out on shared computers.

## 7. Understanding the Dashboard Layout

### 7.1. The sidebar

The left sidebar is your primary navigation. At the top it shows the JB logo
with **"JB Mercantile"** and **"Commerce Platform"**. Sections and items:

| Section | Items |
|---|---|
| Overview | Dashboard |
| Catalogue | Products, Categories, Collections, Attributes, Inventory |
| Orders & Fulfillment | Orders, Payments, Fulfillment, Returns |
| Customers | Customers, Reviews |
| Commerce | Coupons, Notifications |
| Insights | Analytics |
| System | Audit Logs, Settings, Users (super-admin only), Roles (super-admin only) |

- Selecting an item opens that page; the current page is highlighted.
- Some items open sub-pages not listed in the sidebar (for example a
  specific product editor, order detail, or analytics sub-reports); the
  sidebar highlights the parent item.
- **Users** and **Roles** are visible only to super-admins. All other
  administrators simply do not see them — this is permission filtering, not
  an error.

### 7.2. Expanding, collapsing, and mobile

- On desktop, a collapse button in the sidebar toggles between expanded
  (labels visible) and collapsed (icons only). Its accessible names are
  **"Collapse admin sidebar"** / **"Expand admin sidebar"**. Your choice is
  remembered on that computer.
- Sidebar sections can also be expanded/collapsed individually; the choice
  lasts for the browser session.
- On small screens, select the **"Admin"** menu button to open the navigation
  as a slide-over panel, and **"Close"** (or tap outside it) to dismiss it.

### 7.3. The account area

At the bottom of the sidebar you see your name, role (for example Staff,
Admin, Super Admin), and email. Selecting your name opens the account menu
with:

- Your name and email (display only).
- **"Profile"** — opens your account profile page.
- **"Security"** — opens password and session management.
- **"Sign out"** — signs you out after confirmation (see §6.4).

### 7.4. Loading and access states

- While the dashboard checks your access you see **"Checking admin access…"**.
  Wait for it to finish; do not click repeatedly.
- Not signed in → you are sent to the sign-in page and returned afterwards.
- Signed in without an operations role → **"403 — Not authorized"** page
  (*"If you need operations access, ask your administrator to grant it to
  your account."*).

## 8. Understanding the Catalogue

The **catalogue** is the complete set of products the store can sell. It is
built from five connected ideas (each explained fully in its chapter):

1. **Products** (Chapter 10) — the things you sell (for example "Men's
   Cotton T-Shirt"). A product starts as a **draft** (invisible to
   customers), becomes **active** when published, and can later be
   **archived** (hidden again, history preserved).
2. **Variants** (Chapter 13) — the buyable options of a product (for example
   "Black / Size M"). Customers buy variants, not products. Every variant has
   its own **SKU** (Chapter 14), **price** (Chapter 15), and **stock**
   (Chapter 16).
3. **Categories** (Chapter 12) — what kind of thing a product is (for example
   Fashion → Men's Fashion → T-Shirts). Each product has exactly one
   category.
4. **Collections** (Chapter 12) — merchandising groups (for example "New
   Arrivals"). A product may belong to many collections or none.
5. **Attributes** (Chapter 13) — descriptive facets such as Size, Colour, or
   Capacity. Attributes describe products and define variants.

The catalogue section of the sidebar (**Products, Categories, Collections,
Attributes, Inventory**) is where all of this is managed.

## 9. Product Creation at a Glance

Creating a sellable product always follows the same stages, in order:

1. **Describe the product** — enter name, description, and category; select
   **"Save Draft"**. This creates the product record and unlocks everything
   else. (Chapter 10.)
2. **Add photos** — upload images; the first photo is the primary (main)
   image. (Chapter 11.)
3. **Set the price and stock** — in **Pricing & Stock**, enter the selling
   price (KES) and quantity. For a single item this creates the buyable item
   automatically — no variant table needed. (Chapters 15–16.)
4. **Add options only if needed** — if customers choose between versions
   (for example colours × sizes), tick **"This product has options or
   variations"** and configure them, setting each item's price.
   (Chapters 13–15.) Skip this entirely for single-item products.
5. **Organise (optional)** — attach collections. (Chapter 12.)
6. **Review and publish** — check the readiness checklist, then select
   **"Publish product"**. Only published (**active**) products with at least
   one priced item and one image can be bought by customers.
   (Chapters 17–18).

> **Warning.** Do not try to publish before the price and images exist: the
> **"Publish product"** button is disabled until then, and the server rejects
> premature publishing. Follow the stages in order and you will not get
> stuck.

## 10. Step-by-Step Product Creation

### 10.1. Opening the product creation page

1. Sign in (Chapter 6) and open the **Admin Dashboard**.
2. In the sidebar under **Catalogue**, select **"Products"**. You will see
   the heading **"Products"** with the subheading *"Catalogue management
   across all statuses"*.
3. Select the **"New Product"** button (top of the list). If the list is
   empty you will see **"No products"** with the message *"No products match
   the current filters."* and another **"New Product"** button — use it.
4. The **"Create Product"** page opens with the hint *"Three quick steps:
   describe the product, add photos, set the price and stock. Save a draft
   first to unlock photos and pricing."* A **"← Back to Products"** link returns to the
   list without saving.
5. If **"Products"** or **"New Product"** is missing, your role lacks catalogue
   access: ask your administrator. If you get **"403 — Not authorized"**, see
   §6.3.

### 10.2. Section 1 — Basic information

Fill the fields in order. Exact labels, rules, and guidance:

| Field (exact label) | Required? | What to enter | Example (illustrative) | Common mistake |
|---|---|---|---|---|
| Product name * | Yes — at least 2 characters, at most 200 | The customer-facing name. Be specific: include kind, key feature, and audience | "Men's Cotton Crew-Neck T-Shirt" | Vague names like "Shirt" that customers cannot distinguish |
| Slug (auto: …) | No — auto-generated from the name if left blank | Web-address text. Leave blank unless you need a custom address; if you type one, keep it short, lowercase, words separated by hyphens | Leave blank (recommended) | Typing uppercase letters or spaces; the system normalises them anyway |
| Description * (min 12 characters) | Yes — at least 12 characters, at most 10,000 | A useful description: what it is, material/features, fit or size guidance, care, what is in the box | "Soft 100% cotton crew-neck T-shirt for everyday wear. Breathable knit, reinforced collar, machine washable." | One-word descriptions; copying supplier text with false claims |
| Category * | Yes — you must choose one | The single best-fitting category from the dropdown | Fashion → Men's Fashion → T-Shirts (illustrative) | Leaving "Select a category" chosen — saving is blocked |
| Status | Has a default; see below | Leave as **"Draft — not purchasable"** while creating. **"Archived — hidden from storefront"** hides the product. There is deliberately **no Active option here** — publishing happens later via **"Publish product"** | Draft | Trying to publish from this dropdown — it is not possible on this page |

What the fields mean:

- **Product name** is what customers see. It is different from the **SKU**
  (Chapter 14), which is an internal stock code customers rarely see.
- **Slug** becomes the product's web address (`/products/your-slug`). You
  cannot change it after the draft is created, so if you type a custom slug,
  double-check it.
- **Category** is required before publishing and determines which variant
  options are available (Chapter 13). If the category you need does not
  exist, see Chapter 12 — do not pick a wrong category as a placeholder.
- **Status** here is only a starting state. Saving never publishes: even
  though the system technically supports an active state, this page only
  offers Draft and Archived, and publishing is a separate gated step
  (Chapter 18).

### 10.3. Saving the draft

1. When name, description, and category are filled, select **"Save Draft"**
   (or **"Cancel"** to abandon; cancelling asks for confirmation —
   **"Discard unsaved changes?"** — and unsaved typing is lost).
2. While saving, the button reads **"Saving…"** and is disabled. Wait. Do not
   click repeatedly and do not close the page mid-save.
3. Success: a confirmation **"Draft created. Add images and the first variant
   below."** appears, and the page unlocks: media uploads, variants,
   collections, autosave, and the review panel all become available. The
   header buttons change to **"Back to Products"**, **"Open product editor"**,
   and **"Publish product"** (disabled until ready).
4. If fields are invalid you see **"Fix the highlighted fields before
   saving."** with a clickable list — select each item to jump to the field,
   correct it, and save again.
5. After the draft exists, edits to name/description/category save via
   **"Save changes"**, and an autosave runs about 1.5 seconds after you stop
   typing. Watch the status line: **"Autosaving draft…"**, **"All changes
   saved."** / **"Draft saved …"**, or **"Autosave failed: …"** with
   **"Retry now"**. If you see *"Changed elsewhere — reloaded the latest
   version."*, someone else edited the same draft: your open copy was
   refreshed with their version, so re-apply your edit and save again.

### 10.4. What to do next

After the draft is saved, work through the unlocked sections in this order:
images (Chapter 11), variants (Chapter 13), prices (Chapter 15), stock
(Chapter 16), collections (Chapter 12), then review and publish
(Chapters 17–18). The sidebar **"Setup progress"** panel tracks you
(**"{done} of {total} sections complete"**) across Basic information,
Product media, Variants/SKUs/pricing, Categories & collections, and Review &
publish, and the **"Storefront preview"** panel shows how the product will
look to customers as you fill it in.

## 11. Product Images and Cloudinary

**Cloudinary** is the image-hosting service the store uses. Your uploads go
directly to Cloudinary and are then recorded on the product — a preview on
screen is *not* proof of saving (see §11.4).

### 11.1. Where and how to upload

1. On the **"Create Product"** (or edit) page, find section **Product
   media**. Before the draft exists it shows *"Save a draft first — then
   drag & drop or browse JPG · PNG · WebP here."* — save the draft first
   (§10.3).
2. After the draft exists you see **"Drag images here"** with a
   **"choose files"** option and the note *"JPEG, PNG, or WebP. Use clear,
   well-lit product photos."*
3. Either drag image files onto the area or select **"choose files"** and
   pick files from your computer. Accepted types: **JPEG, PNG, WebP** only.
   Anything else is rejected with *"…file(s) rejected: only JPEG, PNG, or
   WebP images are allowed."*
4. Each file shows an upload progress bar (*"Uploading {name}"*). Up to three
   uploads run at once; large files take longer — wait for each to finish.
5. Success: the file is marked **"Saved"** and joins the product gallery.
   Each successful upload is saved immediately; a failed upload never
   pretends to be saved.

### 11.2. Organising images

- **Primary image.** The main photo used in listings and prominent positions.
  It carries a **"PRIMARY"** badge. To change it, select **"Set primary"** on
  any other image; you will see **"Primary image changed."** The first image
  you upload becomes primary automatically.
- **Reorder.** Each image has **"← Prev"** and **"Next →"** buttons (inside a
  "Reorder image N" group). There is no drag-to-reorder. Success:
  **"Image order saved."**
- **Preview.** Select the expand control (*"Expand preview for image N"*) to
  view an image larger; collapse it afterwards.
- **Alternative (alt) text.** A short description of the photo used by screen
  readers and search (at most 200 characters; example placeholder: *"Blue
  1.5L countertop blender"*). Select **"Edit alt text"**, type, then
  **"Save"** (**"Cancel"** abandons). Success: **"Alt text updated."** Too
  long: *"Alt text must be 200 characters or fewer."*

### 11.3. Replacing and deleting

- **Replace:** select **"Replace"** on an image, choose the new file
  (*"Choose a replacement image"*). The position, primary status, and order
  are kept; only the photo changes. Success: **"Product image replaced."**
  If the old hosted file could not be removed you are told so explicitly —
  the product still uses the new photo.
- **Delete:** select **"Delete"** and confirm **"Delete this product
  image?"** (**"Delete image"** to confirm). If it was primary, the next
  image becomes primary automatically. Success: **"Product image deleted."**
  If hosted cleanup failed, the message says the product record was removed
  but the file *"may need manual removal"* — report this to support.
- If the product is **archived**, images are read-only (*"This product is
  archived — its images are read-only."*). Restore it first (Chapter 18).

### 11.4. Preview vs. uploaded vs. saved

| Stage | What it looks like | Saved? |
|---|---|---|
| File picker / drag | File names waiting | No |
| Upload progress bar | *"Uploading {name}"* with a bar | No — in progress |
| **"Saved"** in the upload queue, photo in the gallery with position badge | Permanent gallery entry | **Yes** |
| Upload error with **"Retry"** / **"Dismiss"** | Error message | No — use **"Retry"**, or **dismiss** and try a smaller/supported file |

If the page shows a photo but the gallery count (**"Setup progress"** →
Product media, e.g. *"No images yet"*) did not increase, it was only a
temporary preview: re-upload and confirm **"Saved"**.

### 11.5. Practical photo guidance

Use clear, well-lit photos on plain backgrounds; show the product from
several angles plus one lifestyle/context shot; keep the first (primary)
photo the most representative. These are quality recommendations, not system
rules — the enforced rules are only the file types above (size limits are
enforced silently; shrink the file if an upload fails without a clear
reason).

## 12. Categories and Collections

### 12.1. Categories

A **category** describes what kind of product something is. Categories can be
nested (a category inside a parent, for example Illustrative:
`Kitchen & Home → Kitchen Appliances → Blenders`, or
`Fashion → Men's Fashion → T-Shirts`). Label these examples as illustrative
unless your store shows those exact names. Every product has exactly one
category, chosen in Basic information (§10.2) and required before publishing.

If the category you need does not exist:

1. Go to **Catalogue → Categories** (heading **"Categories"**, *"Department
   hierarchy for discovery and navigation"*).
2. Fill **"Name *"** (at least 2 characters), optional **"Slug"**
   (auto-generated if blank, create-only — it cannot be changed when
   editing), **"Parent"** (**"Top level (department)"** or an
   existing category), and **"Description"**.
3. Fill **"SKU code (2–5 letters/digits)"** (for example `TSH`): 2–5
   letters/digits (A–Z, 0–9), typed in capitals. This is the dictionary
   code the variant generator uses when building SKUs. Leave it blank
   only if SKUs for this category are managed by technical support.
4. Optionally fill **"SKU template (optional)"** (for example
   `{BRAND}-{CATEGORY}-{STYLE}`): the pattern used to build SKUs for
   this category. Leave it blank to use the system default for the
   category's department.
5. Select **"Create category"**. Success: **"Category created."** To change
   an existing one, select its **"Edit"**, adjust, and **"Save changes"**
   (**"Category updated."**).
6. Do not type a new category into the product form — the product dropdown
   only accepts existing categories.
7. Categories with products, or with live sub-categories, cannot be archived
   until their products are moved first (the confirmation dialog tells you).
   Archiving hides the category from the storefront; nothing is permanently
   deleted.

> **SKU safety rules for category codes.** The help text under the code
> field states the rule: *"The code is used when generating variant SKUs.
> Once set it cannot be removed from here — changing it does not rewrite
> existing SKUs."* In practice: set the code once, early, before generating
> variants. Changing it later affects only future SKUs and cannot repair or
> rename SKUs that already exist. If a code must be removed or fundamentally
> redefined, ask technical support — do not work around it by recreating the
> category, because the products and SKUs belong to the existing record.

> **Category codes are self-service.** Variant SKUs require the product's
> category to have an internal dictionary **code**, and you set it yourself on
> the Categories page (**SKU code** field — §12.1). If the variant panel says
> the category has no dictionary code, follow §12.1: open
> **Catalogue → Categories → Edit**, enter the code, and save. Changing a code
> never rewrites existing SKUs.

### 12.2. Collections

A **collection** groups products for a merchandising purpose — for example
(illustrative) New Arrivals, Featured Products, or Best Sellers. Difference in
one line: **a category describes what a product is; a collection promotes a
set of products together.** A product may be in many collections or none.

Assigning collections to a product (after its draft exists):

1. On the **"Create Product"** (or edit) page, find **Categories &
   collections**. Category is shown read-only here (it is set in Basic
   information).
2. Tick the **Collections** checkboxes (up to 20 shown; *"No collections
   available yet."* if none exist).
3. Select **"Save collections"**. Success: **"Collection assignments saved."**
   / **"Assignments saved."** Unticking and saving removes memberships.
4. **"Manage Collections"** opens **Catalogue → Collections** (heading
   **"Collections"**, *"Curated merchandising sets for the storefront"*),
   where **"Create collection"** / **"Save changes"** work like categories,
   with an additional **"Status"** (Active/Draft/Archived). Archiving a
   collection removes its product memberships and hides it; products
   themselves are unaffected.

## 13. Attributes and Variants

### 13.1. Attributes in plain English

An **attribute** is a product feature with a fixed list of options — for
example attribute **Colour** with **attribute values** Black and White. (The
attribute is the question; the values are the allowed answers.) Typical
attributes: Size, Colour, Material, Capacity, Power, Shoe Size, Style, Brand.
Which attributes exist depends on your store's configuration — do not assume
an attribute exists until you see it listed.

Where attributes live:

- **Catalogue → Attributes** (heading **"Attributes"**, *"Variant facets
  for filters and specifications"*): the dictionary. **"Create attribute"**
  adds one (**"Name *"** only, e.g. `Colour`); **"Rename"** renames it (the
  internal slug never changes). Inside each attribute card, type a
  **"New value…"** and select **"Add value"** (**"Value added."**). Remove
  with × (**"Remove value"**). Values or attributes already used by product
  variants **cannot** be removed or deleted (*"Values used by product variants
  cannot be removed."*) — this protects live products.
- On the product, attributes are *selected* (VariantManager, §13.3), not
  created. If the value you need is missing, create it under
  **Catalogue → Attributes** first, then return to the product.

Attribute vs. value, T-shirt vs. shoe vs. blender (illustrative):

| Product | Useful attributes (illustrative) | Example values |
|---|---|---|
| T-shirt | Size, Colour, Material | M, L, XL; Black, White; Cotton |
| Shoe | Shoe Size, Colour, Material | 42, 43; Brown, Black; Leather |
| Blender | Capacity, Power, Colour | 1.5L; 500W; White |

### 13.2. What a variant is

A **variant** is one buyable combination — e.g. "Black / Size M". A product
with no options still has exactly one variant (the default). With 2 colours
× 3 sizes, the maximum is 6 combinations:

| Colour | Size |
|---|---|
| Black | M |
| Black | L |
| Black | XL |
| White | M |
| White | L |
| White | XL |

JB generates every valid combination of the values you select (it never
duplicates an existing combination), and you can narrow the set if some
combinations should not exist (see allow-list note in §13.3). Each variant
gets its own SKU, price, and stock.

### 13.3. Generating variants — exact procedure

Prerequisite: the product draft exists **and a category is assigned**
(*"Assign a category to the product first — variant dimensions are
category-scoped."* otherwise). New variants start with **zero stock** — you
add stock afterwards in Inventory (Chapter 16).

> **Note on order.** Variants do **not** require images to exist first: you
> may generate variants before uploading images. **Publishing** is what
> requires images (at least one image, including a primary — Chapter 18).
> The stage order in Chapter 9 (images before variants) is recommended
> because it keeps the readiness checklist green as you go, not because the
> system blocks variant creation on an imageless draft.

1. Open section **Variants, SKUs & pricing**. Read the hint: select variant
   options to preview server-generated SKUs, then set per-variant prices and
   stock.
2. Under **"Variant options — what changes between variants?"**, select
   **"+ Add variant option"** and **"Add"** for each dimension (e.g. Colour,
   Size). The category lists which dimensions are required
   (*"Required for this category: …"*).
3. Tick the values for each dimension (checkbox pills, e.g. Black, White).
   Remove a wrong dimension with **"Remove"**.
4. Brand: if a Brand attribute exists, choose it from **"Brand"**; otherwise
   type a **"Brand code (2–6 letters/digits, e.g. NKE)"** (e.g. `PHILIPS`
   would be too long — use the configured brand value or a short code your
   business defines).
5. Read the summary line: e.g. *"2 Colours × 3 Sizes"*, then the SKU preview:
   **"{new} new · {existing} existing · {skipped} skipped"**, or
   **"Generating SKUs…"** while it works. **"Refresh preview"** re-checks.
6. If blocked, read the inline hint and fix it (do not force it):
   - *"This category has no dictionary code, so SKUs cannot be generated
     yet. Give the category a code under Catalogue → Categories → Edit
     (SKU code field), or move the product to a coded category."* → open
     **Catalogue → Categories**, select **"Edit"** on the product's
     category, enter the **"SKU code (2–5 letters/digits)"**, and select
     **"Save changes"** (§12.1); then return and **"Refresh preview"**.
   - *"Enter a brand code (or select a brand)…"* → complete step 4.
   - *"Select at least one value for each variant attribute…"* → tick values.
   - *"This selection would create {N} variants — above the limit of 300
     per operation. Narrow the selection."* → untick values or split the
     work.
7. Select **"Create {N} variant(s)"** and confirm **"Create variants"**
   (*"{N} new variant(s) will be created for {product}. Existing variants are
   preserved."*). While saving: **"Saving…"**. Success: *"Created {c}
   variant(s){, {e} already existed}."* If everything already exists:
   *"Nothing new to create — every previewed combination already exists."*
8. The variant table appears (caption *"Product variants with SKU, price and
   stock"*): columns **Select, Variant, SKU, Barcode, Price (KES), Stock,
   Status, Actions**. New rows show a **"New"** badge. Verify every expected
   combination is present with a sensible SKU; a missing row means its values
   were not selected or were skipped — adjust and generate again (existing
   rows are never duplicated: *"Idempotent — existing combinations are
   preserved, never duplicated."*).
9. On failure you get the server's message plus a fix hint, or row-level
   *"Row {sku}: {error}"* messages, and **"Try again"**. Correct the inputs
   and retry once. Do not click **"Create"** repeatedly while it is still
   processing.

Advanced: an allow-list (commercially-valid subset) can restrict which
combinations are created; it is an API-level option applied through the same
flow. Bulk barcode creation (**"Generate missing barcodes"**) never changes
existing codes.

### 13.4. Managing variants afterwards

- **Prices:** type per-row (new rows: price field with *"Inherit"*
  placeholder; existing rows: *"New price"* field) and **"Save price
  changes"** (*"Price updated for {N} variant(s)."* / *"No price changes to
  save."*). Bulk: enter **"Bulk price (KES)"**, tick rows, **"Apply to {N}
  selected"**, then save (**"Bulk values staged for {N} variant(s). Save to
  persist."**).
- **Stock:** per-row *"Set stock"* + **"Apply"** (*"Stock for {sku} set to
  {N}."*) or bulk stock the same way. Larger corrections belong in Inventory
  (Chapter 16).
- **Status:** **Archive** a variant to stop selling it (**"Archive variant
  {sku}? It stops being purchasable; orders and stock history are
  preserved — it is never hard-deleted."**) and **Restore** to reactivate
  (**"Restore variant {sku} to ACTIVE?"**).
- **Barcodes:** existing variants show their code or **"Generate"**
  (*"Barcode {code} assigned to {sku}."*). There is no manual barcode typing
  in this table; replacing a code is done in Scan Station (Chapter 16/22).

## 14. SKUs

**SKU means Stock Keeping Unit**: the unique identifier for one variant used
for stock and order management. Think of it as the variant's ID card number.

- **Where it appears:** the variant table's **SKU** column; inventory rows;
  order lines; the Scan Station. Quote it whenever reporting a stock or order
  problem.
- **How SKUs are made:** the server generates them from the category
  template, e.g. brand–category–style–colour–size (illustrative shape like
  `NKE-SHO-AM90-BLK-42`). The preview in §13.3 is authoritative — what you
  see is what will be created.
- **Can you edit a SKU?** No. SKUs are immutable after creation (there is no
  SKU field in any edit form), and category template changes never rewrite
  existing SKUs. If a SKU is wrong, archive that variant and create the
  correct combination instead — never reuse or retype SKUs.
- **Duplicates:** impossible to save — the server rejects them
  (`SKU_ALREADY_EXISTS`) and the UI reports existing combinations instead of
  duplicating.
- **Finding a SKU:** **Catalogue → Products → Edit** the product and read the
  variant table, or search it in **Catalogue → Inventory**.

## 15. Pricing and Discounts

### 15.1. How prices work

- Prices are set **per variant** in Kenyan Shillings (the store currency is
  fixed to KES; you enter plain numbers like `3500`, formatted as
  `KSh 3,500` on the storefront).
- There is **no product-level price field** in the admin: the selling price
  lives on each variant. A new variant with no explicit price inherits for
  display, but **publishing requires every active variant to have a real
  price above zero** — set a price on every variant before publishing.
- Rules enforced on prices: valid number with at most two decimals (e.g.
  `2500.00`); never negative (*"Price cannot be negative."*); at most
  99,999,999.99 (*"Price must not exceed …"*); malformed entries
  (*"Enter a valid price, e.g. 2500.00."*) are rejected, never silently
  saved.

### 15.2. Discounts and compare-at prices

The backend supports an optional per-variant **compare-at (original) price**,
but the admin interface currently exposes **no field for it**. Practical
consequences:

- Set the price customers will actually pay. Do not invent a "discount" the
  system does not display.
- Do not type the original price into the selling-price field — that would
  overcharge customers.
- If your business needs visible was/now pricing, confirm with technical
  support how compare-at prices should be entered (see Chapter 29).

### 15.3. Avoiding price mistakes

- Never leave a variant priceless before publishing (it blocks publishing).
- Never enter `0` as a selling price — zero fails the publish readiness
  check and, worse, could mislead if ever displayed.
- Keep variant prices consistent (e.g. larger sizes may cost more, but review
  the full table before saving).
- Prices are authoritative from the backend at checkout: what you save here
  is exactly what customers are charged.

## 16. Inventory and Stock

### 16.1. Stock vocabulary

- **Quantity on hand:** physical stock recorded in the system.
- **Reserved quantity:** stock set aside for open (unpaid but eligible)
  orders. You cannot sell it twice and you cannot edit it directly.
- **Available quantity:** what new shoppers can still buy, always calculated
  as **on hand − reserved** (never negative; minimum zero). Do not invent or
  override this number — the system computes it on every read.
- **Low-stock threshold:** the per-variant level that flags
  **"LOW_STOCK"**; **"OUT_OF_STOCK"** shows when nothing is available.
- **Movement:** every stock change writes an immutable movement record
  (restock, adjustment, reservation, release, sale, return) with who, what,
  and why. History is never edited or deleted.

### 16.2. Why new variants start at zero

Variant creation starts each variant at **zero on hand** (a deliberate
safety rule: nothing is sellable before you confirm real stock). After
generating variants, add opening stock as follows.

### 16.3. Adding and correcting stock

1. Go to **Catalogue → Inventory** (heading **"Inventory"**, *"Controlled
   stock operations — every change writes a movement record"*).
2. In **"Restock / Adjust"**, choose **"Variant (SKU)"** (search by SKU or
   product name; note the dropdown lists the current page/filter — search
   first if your variant is not visible).
3. Choose **"Operation"**: **"Restock (add stock)"** for new arrivals
   (quantity must be positive) or **"Adjust (positive or negative)"** for
   corrections (*"Quantity (use negative to reduce)"*).
4. Enter a whole non-zero **Quantity** (at most 100,000 per entry).
5. Enter a **"Reason *"** of at least 3 characters (e.g. `opening stock`,
   `damaged`, `stock count correction`). Every change requires a reason.
6. Select **"Apply Stock Change"** and confirm **"Apply stock change?"**
   (*"{sku}: {old} → {new} on hand. Reason: {reason}. A movement record will
   be written."*, **"Apply change"** to confirm).
7. Success: **"Restocked and recorded as an IN movement."** / **"Adjustment
   applied and recorded."** The table's **On Hand / Reserved / Available**
   update; over-selling is impossible because the system validates
   availability at checkout.
8. Guardrails you will meet: *"Restock quantity must be positive."*,
   *"Select a variant and enter a non-zero whole quantity."*,
   *"A reason of at least 3 characters is required…"*, and *"This change
   would leave {sku} at {negative} on hand. Stock cannot go negative."*
   Adjustments that would eat into reserved stock are refused
   (*"Release or fulfil first"*).

### 16.4. Reviewing history and reservations

- **"Movement History"** (`Inventory → Movement History`, *"Immutable stock
  audit trail"*) lists every change: time, SKU, type
  (IN/OUT/ADJUSTMENT/RESERVED/RELEASED/RETURN), quantity, reason, reference.
  Filter by type or search by reason/reference.
- **"Active Reservations"** on the Inventory page is **read-only**: stock
  held for open orders converts or releases through order processing
  automatically — there is no manual control, by design.
- **Scan Station** (`Inventory → Scan Station`) looks up any barcode
  (*"Scan barcode"*, *"Scan or type, then Enter"*), shows product/variant/
  SKU/price/stock, prints shelf labels (**"Add label ×1"**,
  **"Add labels ×12"**, **"Preview & print labels"**, optional **"Print price
  on labels"**), and replaces barcodes with an audited reason
  (**"Replace barcode…"**, reason minimum 3 characters). It never changes
  stock directly; **"Adjust stock"** sends you to Inventory.

## 17. SEO and Product Visibility

- **Slug / product URL:** `/products/your-slug`, auto-generated from the
  name, shown in the SEO panel as `Slug /products/…` with `Title {name} |
  JB Mercantile` and a 140-character description excerpt. There are **no
  separate SEO title/description fields** — search presentation derives from
  name and description, so write both carefully. The slug cannot be changed
  after draft creation.
- **Visibility rule:** only **Active** products with at least one purchasable
  variant and one image appear to customers. Draft and Archived products are
  invisible on the storefront (archived variants likewise stop being
  purchasable). Saving is not publishing: a saved draft stays invisible until
  you publish (Chapter 18).
- **Checking visibility:** after publishing, use **"View storefront"** on the
  product page. If the product does not appear, see Chapter 23 (status,
  missing variant/image, category archived).

## 18. Saving, Publishing and Archiving

### 18.1. The five actions (use only these)

| Action | Where | Effect |
|---|---|---|
| Save Draft | Create page, before anything exists | Creates the product as **Draft**; unlocks media/variants/collections |
| Save changes | Create page (after draft) and Edit page | Saves name/description/category/status (and collections via **"Save collections"**); never publishes by itself on the create page |
| Publish product | Create page, **"7 · Review & publish"** (and sticky bar) | Flips Draft → **Active** after passing the readiness checklist; then opens the editor |
| Change Status + Save Changes | Edit page status dropdown | Requests a status change (Draft/Active/Archived). Switching to **Active** runs the **same server readiness check** as publishing: an incomplete product is rejected with its issues listed — the edit page cannot bypass publishing rules (see §18.3) |
| Archive / Restore | Product list row actions; **"Archive"** / **"Restore"** with confirmation | Archive hides from storefront (*"It will disappear from the storefront but historical orders are preserved."*); Restore re-activates |

### 18.2. The publish checklist (create page)

**"7 · Review & publish"** requires all of:

1. Product name (min 2 characters).
2. URL slug present.
3. Category assigned.
4. Description (min 12 characters).
5. At least one purchasable variant — real SKU, price above zero, and at
   least one attribute mapping (*"Add the first variant after the draft is
   created."*).
6. At least one product image, including a primary image (*"Upload images
   with the signed Cloudinary workflow after the draft is created."*).

The **"Publish product"** button is disabled until variants and images exist
(*"Add at least one variant and one image before publishing"*). If the server
still refuses, you get **"Publishing was rejected by the server. Review the
issues below."** plus a **"Server readiness issues"** list — fix each item
and retry. Success: **"Product published."** and the editor opens; use
**"View storefront"** to confirm visibility.

### 18.3. Archiving, restoring, and status notes

- **Archive** (list row **"Archive"**, or edit-page status **Archived** +
  save): product and its variants disappear from the storefront; images
  become read-only; historical orders, stock history, and records are fully
  preserved. Reversible via **"Restore"**.
- There is **no permanent delete** for products or variants anywhere in the
  dashboard. Never recreate a product just to change its description or
  image — edit it (Chapter 20).
- The edit page's status dropdown is **also** readiness-gated by the server:
  switching to **Active** runs the same publication check as
  **"Publish product"** (name, slug, category, description, purchasable
  variants with real prices, image + primary). The page warns you first
  (*"Publishing checklist incomplete: … The server will reject the change
  until these are complete."*), and if you save anyway the server refuses
  with *"This product cannot be published yet: … Complete the missing items
  (category, variant with price, primary image) and try again."* Nothing
  changes on a rejected publish — the product keeps its previous status and
  the rejection is audit-logged. Prefer the create-page **"Publish product"**
  flow (its checklist shows every requirement up front), and always verify
  on the storefront afterwards.
- While any save is processing (**"Saving…"**, **"Publishing…"**,
  **"Apply…"**), wait for it to finish. Do not double-click create/generate
  buttons, and do not refresh mid-save.

## 19. Complete Worked Example

> **Illustrative example.** Product, brand, prices, and stock below are
> invented for teaching. Your real categories, collections, and attributes
> depend on your store's configuration (seed demo data, if installed, uses
> different names — see Chapter 29). Follow the *steps*, substituting your
> real data.

**Goal:** create **"Philips 1.5L Electric Blender"** (illustrative), white,
500W, KSh 8,500 (illustrative price), 20 units opening stock.

1. **Name.** Catalogue → Products → **"New Product"**. Product name:
   `Philips 1.5L Electric Blender`. Leave slug blank (auto-address).
2. **Description.** Write ≥12 characters, e.g. *"1.5-litre electric blender
   with 500W motor, two speeds plus pulse, detachable stainless-steel blades,
   and a 1-litre grinding attachment. Ideal for fruit, vegetables, and
   spices. Wipe-clean base."*
3. **Category.** Choose the blender category (illustrative:
   Kitchen & Home → Kitchen Appliances → Blenders). Leave Status on Draft.
4. **Save Draft.** Select **"Save Draft"**, wait for *"Draft created. Add
   images and the first variant below."*
5. **Images.** In Product media, upload 3–4 JPG photos (front, side, jug
   detail, in-use). Confirm each shows **"Saved"** and the media count grows.
   Keep the best front shot first (primary), then **"Set primary"** if
   needed. Add alt text (*"White 1.5L countertop blender"*).
6. **Collections.** Tick an illustrative collection such as New Arrivals (if
   your store has one; otherwise skip — collections are optional), then
   **"Save collections"** → *"Collection assignments saved."*
7. **Attributes.** If Capacity/Power/Colour values are missing, create them
   under Catalogue → Attributes first (e.g. value `1.5L` under Capacity).
8. **Variants.** In Variants/SKUs/pricing: add dimensions (illustrative:
   Colour, Capacity), tick White × 1.5L (plus any real options), complete
   brand, review the SKU preview, then **"Create 1 variant"** (or N) and
   confirm. If the panel complains about a missing category code, set it
   yourself under Catalogue → Categories → Edit (**"SKU code"** field,
   §12.1), then **"Refresh preview"** and continue.
9. **Price.** Enter `8500` in the variant's price field and **"Save price
   changes"** → *"Price updated for 1 variant(s)."*
10. **Stock.** Catalogue → Inventory → select the variant SKU → Restock,
    quantity `20`, reason `opening stock` → **"Apply Stock Change"**,
    confirm → *"Restocked and recorded as an IN movement."*
11. **Review.** Check Setup progress (all complete), Storefront preview
    (photo, name, `KSh 8,500`, `/products/philips-1-5l-electric-blender`),
    and the Review & publish checklist (all ticked).
12. **Publish.** Select **"Publish product"** → *"Product published."*
13. **Verify.** Select **"View storefront"**: correct name, photo, price,
    options, and add-to-cart availability. If anything is wrong, edit
    (Chapter 20) — do not recreate the product.

## 20. Editing Existing Products

### 20.1. Finding and opening a product

1. Go to **Catalogue → Products** (heading **"Products"**).
2. Search by **"Name or slug…"**, filter by **Status** (**All, DRAFT,
   ACTIVE, ARCHIVED**) and **Category**, page with **"Previous"** /
   **"Next"** (*"Page X of Y (Z records)"*).
3. Select the product **name** or **"Edit"**. The editor shows
   *"{slug} • [status] • {N} variant(s) • {M} image(s)"* with
   **"← Back to Products"** (returns without saving) and **"View
   storefront"**.

### 20.2. What you can change

- **Name, description, category, status** in **"Product information"**, then
  **"Save Changes"** (with check icon). Success: *"Product updated"*.
  Name ≥2, description ≥12 characters, same as creation. Category may be set
  to **"No category"**, but the product then fails publish-readiness until a
  category is restored. Slug cannot be changed here.
- **Status** changes to Draft or Archived take effect on save immediately.
  Switching to **Active** is a publish request: the server runs the same
  readiness check as the create-page **"Publish product"** flow and rejects
  incomplete products with the issues listed (§18.3). An *"incomplete"*
  product can therefore never slip onto the storefront through the edit
  page — but still prefer the create-page flow, whose checklist shows every
  requirement before you attempt it.
- **Images:** same tools as Chapter 11 (upload/reorder/primary/alt/replace/
  delete), except archived products are read-only.
- **Collections:** tick/untick (first 20 shown) and **"Save collections"**
  (*"Collection assignments saved."*); **"Open Collections"** manages the
  dictionary.
- **Variants & pricing:** the same VariantManager as Chapter 13 (generate
  more combinations, batch prices, stock, archive/restore, barcodes); changes
  reload the page data automatically.
- **Inventory:** managed from **Catalogue → Inventory** (see §16.3), reachable
  via **"Open Inventory"**. **"Manage Attributes"** jumps to the attribute
  dictionary.

### 20.3. Effects on orders and history

- Changing name/description/images/collections never alters historical
  orders: past orders keep their own snapshots.
- Changing a variant's **price** affects only future purchases. Changing
  **stock** never touches reserved quantities or history (every change is a
  new movement record).
- Archiving never deletes anything: orders, stock history, and records
  remain, and the product can be restored.
- Because of this, **never delete-and-recreate a product to fix a typo or
  photo** — edit it. Recreation would orphan continuity (new IDs, new URLs)
  while history stays with the old record.

## 21. Managing Categories, Collections and Attributes

Covered in full in §12.1 (categories), §12.2 (collections), and §13.1
(attributes). Summary of exact UI for daily reference:

- **Categories** (`Catalogue → Categories`): **"New category"** form
  (**"Name *"**, **"Slug (optional)"** create-only, **"Parent"**,
  **"Description"**, **"SKU code (2–5 letters/digits)"** e.g. `TSH`,
  **"SKU template (optional)"** e.g. `{BRAND}-{CATEGORY}-{STYLE}`) →
  **"Create category"** (*"Category created."*);
  per-row **"Edit"** → **"Save changes"** (*"Category updated."*, no slug
  editing; a code once set cannot be removed from this form). The table
  shows each category's **Code** (or `—`). Per-row **"Archive"** with
  confirmation (blocked with an explanatory message while products or live
  sub-categories remain). Codes/templates feed future SKU generation only
  and never rewrite existing SKUs (§12.1).
- **Collections** (`Catalogue → Collections`): same pattern plus
  **"Status"** (Active/Draft/Archived); **"Archive"** unlinks memberships
  (*"It holds {n} product(s). Memberships will be removed…"*). No code
  fields; assignment to products via product-page checkboxes.
- **Attributes** (`Catalogue → Attributes`): **"Create attribute"**
  (name only) / **"Rename"** (slug unchanged); per-attribute **"New value…"**
  + **"Add value"**; × removes a value; delete flows confirm and refuse
  anything used by variants. No type editing in the UI.

## 22. Other Admin Modules

Each module below exists in the sidebar. Purpose, access, tasks, cautions:

- **Dashboard** (`Overview → Dashboard`, *"Operations Dashboard"*): morning
  starting point — **Needs Attention** (unpaid orders, failed deliveries,
  pending returns/refunds, low stock), plus Commerce/Operations/Inventory/
  Customers summaries with links (e.g. unpaid orders, low-stock list). Note:
  *"Paid order value … an operational figure, not audited revenue."*
- **Orders** (`Orders & Fulfillment → Orders`, *"Search and operate on all
  orders"*): search by number/customer/SKU; filter by order, payment, and
  fulfilment status. Order detail shows totals, items, payments, deliveries,
  timeline; **cancel** is allowed for unpaid orders only (audited; already-
  cancelled repeats succeed harmlessly).
- **Payments** (*"Read-only payment visibility…"*): never mark orders paid by
  hand — only verified M-Pesa callbacks (or audited manual verification)
  change payment state. Review the manual-payment queue (**verify** with a
  note / **reject** with a reason, both audited). Payment analytics and the
  failed-payment queue live here and under Insights.
- **Fulfillment** (*"Fulfillment queue"*): start (**"Start"**), pick
  (**"Mark picked"**), pack (**"Mark packed"**), ready-for-pickup, assign
  couriers (**"Assign…"**), **"Refresh"**. Empty state: *"No paid orders need
  fulfillment. The queue will populate after a verified payment."* Only paid
  orders with converted stock reservations can progress; illegal jumps are
  refused with an explanatory error.
- **Returns** (returns queue): review → approve/reject (reason required) →
  receive → inspect (condition/disposition per item) → refund. Each step is
  audited; refunds complete through the finance path.
- **Customers** (*"Customer directory"*): search/filter (statuses
  Active/Suspended/Inactive/Deleted); detail shows profile, addresses,
  recent orders, returns. Staff may edit name/phone (**"Save"**); only
  admins+ may **Suspend**/**Reactivate** (audited). Data shown is minimised
  to support-relevant fields.
- **Reviews** (*"Moderate customer product reviews"*): pending queue first;
  **"Approve"**/**"Reject"** each with confirmation (*"The review will be
  marked {status} and the decision is audited."*).
- **Coupons**: **"New Coupon"** (code auto-uppercased, value, type, validity,
   usage cap) → **"Create Coupon"** (*"Coupon created and audited."*). Later
   you can only change status, usage cap, and expiry — code/value/type are
   permanent. Redemption at checkout is **not implemented**: do not promise
   coupons to customers; confirm redemption behaviour with the business
   owner first (see Chapter 29).
- **Notifications**: operations queue for system messages (order/delivery
  updates) with delivery status across in-app, email, and SMS channels
  (filter by All/QUEUED/PROCESSING/SENT/DELIVERED/FAILED); select
  **"Run worker"** to drain pending items (*"Worker ran: X processed,
  Y failed"*); **"Resend"** failed items individually (*"Delivery queued
  for resend"*). Customer notification preferences live on the customer
  side. Delivery is queued and retried, never guaranteed instant — see
  Chapter 29.
- **Analytics** (*"Analytics"*, Africa/Nairobi timezone): read-only
  Overview/Sales/Products/Customers/Inventory/Payments/Fulfillment/Delivery/
  Returns/Reports/Data Quality/Definitions with date presets and audited CSV
  exports. Interpretive thresholds (e.g. high-value orders, inactive
  customers) are technical defaults — confirm business definitions before
  quoting them.
- **Audit Logs** (*"Append-only record of sensitive operations"*): who did
  what to which record and when. Read-only; filter by entity/action/actor.
  Cite entries (action, entity, time) when escalating issues.
- **Settings** (*"Operational Settings"*): read-only currency (KES), shipping
  zones/methods/rates. Changes require technical support — never improvise
  shipping promises to customers.
- **Users / Roles** (super-admin only): user directory and per-user
  **"Assign role"**/**"Revoke role"** (self-lockout is blocked); Roles page
  is a read-only matrix. First super-admin is created by direct database
  setup, never with a default password.

## 23. Troubleshooting

For every issue: symptom → likely cause → safe first action → escalation
info → what NOT to do. Escalation info always: what you clicked, product
name/SKU, exact on-screen message, approximate time.

| # | What you see | Common cause | First action | If unresolved, tell support | What NOT to do |
|---|---|---|---|---|---|
| 1 | Cannot sign in (error under form) | Wrong email/password; deactivated account | Re-type with **"Show password"**; confirm the exact email with your admin | Email used, time, exact message | Do not share your password with anyone |
| 2 | Admin menu item missing | Role lacks permission (e.g. Users/Roles need super-admin) | Confirm your role in the sidebar account area; ask admin for the grant | Which item, your role | Do not use another person's account |
| 3 | Product creation page will not open / 403 | Not signed in or no catalogue role | Sign in; check role; use **"New Product"** from the Products list | URL, time | Do not edit the page address by hand repeatedly |
| 4 | "Fix the highlighted fields…" | Name <2 chars, description <12, no category | Follow the clickable error list; correct each field; save again | Field, message | Do not publish to bypass validation |
| 5 | Category list empty / needed category missing | None created yet | Create it under Catalogue → Categories (§12.1) | — | Do not use a wrong category as placeholder |
| 6 | Collection assignment fails / none listed | No collections exist; save not clicked | Create under Collections; tick boxes; **"Save collections"**; confirm *"saved"* message | Product, collection, message | Do not assume ticking alone saved |
| 7 | Attribute options do not appear | Attribute/value not in dictionary | Create under Attributes (§13.1), return to product | Attribute name | Do not free-type values into variant fields |
| 8 | Variant generation error / blocked hint | Missing category, category without code, missing brand, empty values, >300 combos | Read the exact hint; for a missing category code, set it yourself under **Catalogue → Categories → Edit** (**"SKU code"** field, §12.1), then **"Refresh preview"**; fix other inputs likewise; retry once | Full message, product, selection | Do not click Create repeatedly while it is still processing |
| 9 | Duplicate SKU / combination already exists | Combination exists | Reuse the existing row (*"already existed"*); archive+recreate only if genuinely wrong | SKU | Do not retype SKUs; they are immutable |
| 10 | Image upload fails / rejected | Wrong format; too large; network drop; draft not saved | Use JPG/PNG/WebP; smaller file; save draft first; **"Retry"** | File type/size, message, time | Do not assume a preview means saved — confirm **"Saved"** + count |
| 11 | Cannot set primary image | Archived product; image not saved yet | Restore product; confirm image in gallery; **"Set primary"** → *"Primary image changed."* | Product, message | — |
| 12 | Preview shows but product unchanged | Only a temporary preview / upload failed | Re-upload; verify gallery count grew | — | — |
| 13 | Product missing on storefront | Draft/Archived; no purchasable variant; no image; category archived | Check status, variants+prices, images+primary, category; **"View storefront"** | Slug, status, checklist state | Do not recreate the product |
| 14 | Price wrong / missing | Variant priceless or zero; wrong field used | Set per-variant price; **"Save price changes"**; verify table | SKU, expected vs shown | Do not put original price in the selling field |
| 15 | Stock wrong / unavailable | Zero opening stock (normal for new variants); reservations held; negative blocked | Add stock via Inventory (§16.3); check Available = on-hand − reserved; movements history | SKU, quantities seen | Do not invent availability; never edit the database |
| 16 | Changes not reflected | Unsaved (no confirmation toast); autosave failed; viewing cached page | Confirm success toast; **"Retry now"** on autosave failure; reload the page | Action, time | Do not re-submit blindly while processing |
| 17 | Session expires mid-work | 7-day/session revoked/signed out elsewhere | Sign in again; drafts and media persist — resume where you left off | — | — |
| 18 | Page stuck loading | Network issue; checking access | Wait for **"Checking admin access…"**; reload once; sign in again if bounced | Page, duration | Do not hammer refresh during saves |
| 19 | Save/publish rejected by server | Readiness issues listed | Read **"Server readiness issues"** (create page) or the *"cannot be published yet"* message (edit page); fix each item; retry once | Full issues list, product | Do not re-attempt publishing without fixing the listed items — the server enforces the same checklist on every publish path |

## 24. Security and Good Operating Practices

1. Keep your password private; never share accounts. Each administrator
   should have their own account so the audit log stays truthful.
2. Sign out on shared computers (Chapter 6.4).
3. Use only your assigned permissions. A missing menu item means "not
   permitted", not "broken" — request access instead of working around it.
4. Never send passwords or session cookies to support staff. Support needs
   only: what you clicked, product/SKU, exact message, time.
5. Verify prices and stock before publishing — checkout charges exactly what
   is saved.
6. While anything is processing (**"Saving…"**, **"Publishing…"**,
   **"Uploading…"**), wait. Double-clicking Create/Generate can create
   duplicates or conflicting requests.
7. Archive, don't delete — and check consequences first (archiving hides the
   product and locks its images; history is preserved and restorable).
8. Report unexpected dashboard behaviour promptly with the escalation info
   from Chapter 23.

## 25. Frequently Asked Questions

**Do I need technical skills?** No. Basic computer skills (browser, forms,
files) plus this manual are enough. Anything requiring code or database
access belongs to technical support.

**What is the difference between Save Draft, Save Changes, and Publish?**
Draft creates the invisible product record; Changes update it; Publish makes
it Active (buyable) after the readiness checklist passes (Chapter 18).

**Why can't I publish?** The button enables only with ≥1 variant and ≥1
image, and the server additionally requires name, slug, category,
description ≥12 chars, purchasable variants with real prices, and a primary
image. Work the checklist top to bottom. The same check runs if you set
**Active** on the edit page — there is no way to publish an incomplete
product through the dashboard.

**Must I upload images before creating variants?** No — either order works.
Variants can be generated on an imageless draft; only publishing requires
images (at least one, including a primary). Images-first is recommended
because it keeps the readiness checklist green as you go.

**What is a variant / SKU / primary image / collection?** See Glossary
(Chapter 26) and Chapters 13, 14, 11, 12.

**Can I delete a product?** No — archive it. Nothing is permanently deleted
from the dashboard.

**Can I change a SKU later?** No — SKUs are permanent. Archive the wrong
variant and create the right combination.

**Can I offer a discount?** Set the actual selling price per variant. A
separate compare-at/original price field is not available in the dashboard
(Chapter 15).

**Why is stock zero on my new variants?** By design — new variants start at
zero until you record real stock in Inventory (Chapter 16).

**Why can't my colleague see Users/Roles?** Only super-admins see those
pages. Granting roles requires a super-admin (Chapter 7/22).

**Who do I contact when stuck?** Chapter 28.

## 26. Glossary

- **Admin Dashboard (operations dashboard):** staff-only area for managing
  the store (Chapter 7).
- **Archive:** hide a product/variant/category/collection from the
  storefront while preserving all history; reversible via Restore.
- **Attribute:** a product feature with fixed options (e.g. Colour).
- **Attribute value:** one allowed option of an attribute (e.g. Black).
- **Available quantity:** stock available for new purchases = on hand −
  reserved, computed by the system.
- **Brand code:** short 2–6 letter/digit business code used in SKU
  generation (e.g. NKE — illustrative).
- **Category:** what kind of thing a product is; one per product, possibly
  nested.
- **Cloudinary:** the image-hosting service storing product photos.
- **Collection:** a merchandising group of products (e.g. New Arrivals —
  illustrative).
- **Compare-at price:** optional original price for was/now display;
  supported by the backend but not enterable in the dashboard.
- **Draft:** an invisible, unpublished product state.
- **Inventory movement:** an immutable record of one stock change.
- **Primary image:** the main product photo used in listings.
- **Publish (Active):** make a product buyable after readiness checks.
- **Quantity on hand:** physical stock recorded in the system.
- **Reserved quantity:** stock set aside for open orders; not directly
  editable.
- **Role (staff/admin/super-admin/customer):** permission group on your
  account determining what you may see and do.
- **Session:** your signed-in state (cookie-based, 7 days); expiry signs you
  out.
- **SKU (Stock Keeping Unit):** the unique, permanent identifier of one
  variant.
- **Slug:** the URL text of a product (`/products/…`), auto-generated,
  unchangeable after creation.
- **Status:** product lifecycle state — Draft, Active, or Archived (variants:
  Active/Inactive/Archived).
- **Variant:** one buyable combination of a product (e.g. Black / M), with
  its own SKU, price, and stock.

## 27. Product Creation Quick-Reference Checklist

Copy/use per product. All boxes must be ticked before publishing.

- [ ] Signed in with an operations account; **Products** visible.
- [ ] **"New Product"** → **"Create Product"** page open.
- [ ] Name ≥2 chars (specific, customer-facing).
- [ ] Description ≥12 chars (accurate, no false claims).
- [ ] Correct existing category chosen (or created first under Categories).
- [ ] Status left as Draft; **"Save Draft"** → *"Draft created…"* confirmed.
- [ ] Images uploaded (JPG/PNG/WebP), each **"Saved"**, count increased.
- [ ] Primary image set (**"PRIMARY"** badge correct).
- [ ] Alt text added (≤200 chars).
- [ ] Collections ticked (if any) → **"Save collections"** → *"saved"*
      confirmed.
- [ ] Attributes/values exist; dimensions + values selected; brand completed.
- [ ] SKU preview sane → **"Create {N} variant(s)"** confirmed → success
      message; table shows all combinations, no duplicates.
- [ ] Every variant has a real price > 0 → **"Save price changes"**
      confirmed.
- [ ] Opening stock added in Inventory with a ≥3-char reason; success
      message confirmed.
- [ ] Setup progress complete; storefront preview correct (name, photo,
      price, URL).
- [ ] Review & publish checklist all ticked; **"Publish product"** →
      *"Product published."*
- [ ] **"View storefront"** verified: visible, priced, purchasable.

## 28. Support and Escalation

Contact technical support when: access/roles are wrong; a category code
must be removed or fundamentally redefined (setting codes is
self-service — §12.1); compare-at pricing is required; shipping/tax
configuration must change; any server error persists after one careful
retry; image cleanup warnings appear; or the UI contradicts this manual.

Always include: your account email (never your password), exact page/URL,
product name and SKU (for catalogue issues), the exact on-screen message,
approximate time, and what you clicked just before. For audit-relevant
disputes, cite the Audit Logs entry (action, entity, time).

## 29. Document Limitations and Items Requiring Confirmation

Evidence labels: **VERIFIED** (confirmed in code), **PARTIALLY VERIFIED**
(some behaviour confirmed), **NOT VERIFIED** (could not confirm),
**NOT IMPLEMENTED** (absent).

- Product creation/edit/media/variant/attribute/category/collection/
  inventory UI flows: **VERIFIED** against web source; backend rules
  **VERIFIED** against API source, schemas, and Prisma models. End-to-end
  execution in a live browser: **NOT VERIFIED** (no browser tooling
  available) — first-time publishers should keep devtools open and report
  anomalies.
- Seed/demo names (categories, collections, attributes, products) come from
  `prisma/seed*.ts` and are illustrative where labelled; live store data was
  not inspected: **PARTIALLY VERIFIED**.
- Category dictionary codes/SKU templates: settable by administrators via
  the **"SKU code"** / **"SKU template"** fields with validation and help
  text (**VERIFIED** — the v1.0 "contact support" dead end is closed in
  v1.1). Business must still confirm who in the organisation may set or
  change codes and confirm the intended SKU format policy
  (`docs/BUSINESS-DECISIONS.md` BD-002, BD-003).
- Compare-at/discount display: backend field exists, dashboard field
  **NOT IMPLEMENTED** — confirm whether was/now pricing is wanted (BD-005).
- Product-level base price: present in the data model as a display fallback
  but not settable from the dashboard: **VERIFIED** — confirm the
  variant-price-only model is intentional (BD-004).
- Variants may be generated before images are uploaded; **publishing**
  requires at least one image including a primary (**VERIFIED** against
  backend enforcement + intent comments). The recommended path in this
  manual (images before variants) keeps the checklist green either way
  (BD-012).
- Coupon administration (create, activate/deactivate, usage caps, expiry):
  **VERIFIED**. Coupon redemption at checkout: **NOT IMPLEMENTED** (no
  redemption path exists in the API) — do not advertise coupons to
  customers before the business defines redemption behaviour (BD-006).
- Analytics thresholds/definitions: metric queries and the Nairobi-timezone
  Definitions page are **VERIFIED**, but interpretive thresholds are
  technical defaults — confirm business definitions before quoting them
  (BD-007).
- Notification delivery: queue/worker/resend mechanics are **VERIFIED**,
  but production email/SMS vendors are **NOT VERIFIED** — confirm
  expectations and vendors with the business owner (BD-008).
- Reviews: moderation queue (Approve/Reject, audited) and APPROVED-only
  storefront display are **VERIFIED**; customer review submission is
  **NOT IMPLEMENTED** — confirm submission/moderation policy before
  promising it (BD-009).
- Historical defect reports (variant-400, primary-image-400, collection
  CORS, form runtime errors) show fixed code patterns and regression tests
  in the current tree, but live-browser E2E remains **NOT VERIFIED**.
