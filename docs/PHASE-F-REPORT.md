# Phase F Report — Customer Profile Media, Avatar Management & Authenticated Identity UX

## 1. Executive Summary

Phase F delivers the complete customer profile-image lifecycle on the Phase C
secure-upload foundation and connects authenticated identity to the global
navigation (Phase B shell). Users upload profile photos direct to Cloudinary
through server-signed `profile` authorizations, the API finalizes validated
assets strictly scoped to the caller's own namespace, replacement cleans the
previous asset only after the new one persists, removal clears both database
fields and the provider asset, and the navbar avatar syncs without a page
refresh. Logged-out visitors see `Sign in`; logged-in users see `[Avatar] Name`
or `[Initials] Name` with an account dropdown. All ownership is derived from
the server-side session — no client-supplied user ID is ever trusted.

**Status: PASS** (API build/typecheck blocked by a pre-existing,
out-of-scope `reservations.ts` type error present at `origin/main`; every
Phase F surface verifies green — see §14/§19.)

## 2. Initial Audit Findings

Verified against live source (not assumed from the roadmap prompts):

- Auth: server-side cookie sessions (`veyra_session`, HttpOnly, SameSite=Lax,
  Secure in production, 7-day expiry, SHA256 token hash, revocation,
  ACTIVE-only users) in `apps/api/src/routes/auth.ts` /
  `middleware/auth.ts`. Current-user endpoint `GET /auth/me` (already
  serializes `avatarUrl`); logout `POST /auth/logout` (server revocation).
  Frontend: single shared `SessionProvider` (`apps/web/lib/session.tsx`, one
  `/auth/me` per mount, `notifySessionUpdated()` + `jb:session-updated` event
  for revalidation). No JWT, no second session system.
- Profile: `GET/PATCH /account/profile` (firstName/lastName/phone, Zod,
  `PROFILE_UPDATED` audit) already implemented; ownership from
  `request.user.id`.
- Schema: `User.avatarUrl String?` + `User.avatarPublicId String?`
  (server-only provider identity, migration
  `20260921_phase16_profile_avatar`, applied; existing rows unaffected).
- Cloudinary: Phase C provider (`lib/media/cloudinary.ts`), centralized
  policy (`lib/media/policy.ts`: profile = JPEG/PNG/WebP, 5MB,
  `<base>/profiles`, server UUID public IDs as
  `profiles/<ownerUserId>/<uuid>`), one protected endpoint
  `POST /media/sign-upload` (profile: any authenticated user, self-scoped;
  product: operations only), browser helper `apps/web/lib/media-upload.ts`
  (XHR real progress + AbortSignal + response normalization). Secret never
  reaches the browser (grep-verified).
- Navbar (Phase B): `Header.tsx` is session-aware (loading skeleton → guest
  `Sign in` → authenticated `<AccountMenu>` avatar trigger + permission-gated
  admin entry + auth-aware mobile nav). `UserAvatar` (image + deterministic
  initials fallback + broken-image recovery), `getInitials/getDisplayName/
  getAvatarMenuLabel` pure helpers, `can('dashboard.read', roles)` UX-only
  gating with backend authority intact.
- Gap closed by this phase: no avatar upload/replace/remove lifecycle, no
  avatar audit trail, no avatar-optimized delivery variant, no client file-size
  pre-check, account dropdown missing the existing Addresses destination.

## 3. Existing Architecture Reused

- Session/cookie/RBAC stack untouched (no new auth mechanism, no JWT, no
  `isAdmin` client flag).
- Phase C upload architecture reused verbatim: shared `POST
  /media/sign-upload` with `context: 'profile'` (no second Cloudinary
  integration, no server-relayed file bytes, no second signing endpoint —
  §12 explicitly permits reusing the shared endpoint).
- Phase B identity plumbing reused: `SessionProvider`, `AccountMenu`,
  `UserAvatar`, `notifySessionUpdated()`, theme tokens, `JBConfirmDialog`,
  toast provider, `JBIcon` SVGs, `useModalFocus` focus primitive.
- `ProductImage` provider-metadata pattern (`publicId/secureUrl/dimensions`)
  studied; for avatars the minimal safe identity (`avatarUrl` +
  server-only `avatarPublicId`) was selected (Option A, §6) — dimensions are
  validated at finalize time by `normalizeUploadResult` but not persisted
  because no consumer needs them (single fixed-size render slot); no
  duplicate media table created.
- Existing `AuditAction.PROFILE_UPDATED` reused for avatar mutations (no new
  enum value, no migration, no second audit system).

## 4. Database Changes

```text
No new migration in this change set.
```

- Prior migration `20260921_phase16_profile_avatar` (applied, in-repo):
  nullable `User.avatarPublicId TEXT`; legacy/external `avatarUrl` values
  untouched and still render.
- Deliberate non-change: `avatarWidth/avatarHeight/avatarFormat/avatarBytes`
  columns were NOT added. Rationale: the authoritative safety identity is
  `avatarPublicId` (+ `secureUrl`); width/height/format/bytes are validated
  server-side on every finalize via `normalizeUploadResult` and the only
  render consumer (`UserAvatar`) uses a fixed transformation preset, so
  persisted dimensions would be write-only data. Documented here instead of
  migrated.
- No reset, no history rewrite, no user data destroyed.

## 5. API Changes

| Endpoint | Auth | Behaviour |
| --- | --- | --- |
| `POST /account/profile/avatar` | `requireAuth`, self-scoped | `{publicId, secureUrl, width, height, format, bytes?}` → `normalizeUploadResult(…, 'profile')` → requires `profiles/<userId>/…` prefix (`403 AVATAR_NOT_OWNED`) → persists `avatarUrl + avatarPublicId` → best-effort destroys prior asset post-commit → `PROFILE_UPDATED` audit → returns profile + `providerCleanup` |
| `DELETE /account/profile/avatar` | `requireAuth`, self-scoped | clears both fields → destroys asset when one exists (`skipped` when none) → `PROFILE_UPDATED` audit → returns profile + `providerCleanup` |
| `GET/PATCH /account/profile` | unchanged | still the profile read/update contract; avatar changes additionally audit `PROFILE_UPDATED` |

- `avatarPublicId` is never serialized (responses + grep-verified under
  `apps/web`).
- No client-supplied user IDs; standard `{ success, error: { code, message,
  details, requestId } }` envelope preserved.
- New this change set: best-effort `PROFILE_UPDATED` audit rows on avatar
  set/replace/remove (`after: { avatarUpdated: true }` /
  `{ avatarRemoved: true }`); audit failure is caught and logged
  (`media.avatar_audit_failed`) so logging can never break the avatar
  lifecycle.

## 6. Cloudinary Integration

- Folder namespace: `<base>/profiles/<ownerUserId>/<uuid>` (server-generated;
  triage-capable, unguessable). Matches the Phase C policy; no second
  hierarchy invented.
- Flow: select → client MIME + 5MB pre-check → `sign-upload { context:
  'profile', contentType, bytes }` (server auth + policy + timestamp + folder
  + UUID public ID + HMAC; secret server-only) → browser XHR direct to
  `https://api.cloudinary.com/…/image/upload` with real progress → provider
  response normalized client-side → finalize endpoint re-validates
  server-side (folder prefix, `image` resource, HTTPS `res.cloudinary.com`,
  allowed format, integer dimensions, size limit) → persist.
- Display: new fixed `avatar` preset in `cloudinary-display.ts`
  (`c_fill,w_128,h_128,g_face/f_auto/q_auto`); `UserAvatar` derives it at
  render time. Canonical `secureUrl` never rewritten; legacy/external URLs
  pass through; double-apply guarded. Navbar/profile slots no longer load
  original-resolution bytes.
- Destruction: server-only `destroyMedia` with base-folder prefix guard; no
  generic HTTP delete endpoint; arbitrary `publicId` submissions cannot
  target foreign assets (finalize rejects non-owned prefixes before any
  write; destroy rejects off-namespace IDs before any provider call).

## 7. Avatar Lifecycle

```text
Upload:   authorize → direct upload → validate → persist new → audit →
          destroy old (post-commit) → providerCleanup reported
Replace:  same as upload; old photo stays live until replacement finalizes;
          failure leaves current avatar intact
Remove:   clear URL + publicId → audit → destroy asset → UI falls back
          to initials; repeat remove → providerCleanup: skipped
Failure:  Cloudinary fails → DB unchanged. DB write fails → exception
          propagates, no success claimed. Old-asset delete fails → new
          avatar stays active, providerCleanup: failed is reported (never
          hidden) and logged without secrets.
```

## 8. Navbar / Session Integration

- `Header.tsx` (unchanged structure): `loading` → `AccountMenuSkeleton`
  (shimmer, `role=status`, fixed 32px slot, no Sign In ↔ avatar flicker);
  guest → `Sign in → /login`; authenticated → `<AccountMenu>` trigger
  `[avatar|initials] FirstName` (avatar-only below 640px).
- `AccountMenu` trigger label: `Open account menu for <name>`; panel:
  identity header (decorative avatar + name + email), entries My Account,
  Orders, Wishlist, Profile, **Addresses** (new — route already existed),
  Preferences, conditional Admin Dashboard (`can('dashboard.read', roles)`),
  Sign Out (server revocation first, then client `clear()`, toast, push `/`).
- Mobile disclosure nav mirrors the same states (guest Sign in / loading
  status / authenticated My Account + Orders + Profile + conditional Admin).
- Single source of truth: shared `SessionProvider` cache; profile save,
  avatar set/remove, login/register call `notifySessionUpdated()` →
  provider refresh → navbar re-renders with no `window.location.reload()`.

## 9. Authorization Model

| Operation | Customer | Staff | Admin | Super Admin |
| --- | --- | --- | --- | --- |
| View own profile | Yes | Yes | Yes | Yes |
| Update own profile | Yes | Yes | Yes | Yes |
| Upload own avatar | Yes | Yes | Yes | Yes |
| Replace own avatar | Yes | Yes | Yes | Yes |
| Remove own avatar | Yes | Yes | Yes | Yes |
| Modify another customer | No | Per existing admin policy | Per existing admin policy | Yes |
| Manage another user's avatar | No | No (no admin avatar path exists) | No | No (self-scope only) |

- Ownership derived exclusively from `request.user.id`; request bodies carry
  no user ID.
- Frontend admin visibility is UX-only; `/admin/*` and `/api/admin/*`
  remain backend-gated (RBAC/security suites green).

## 10. Security Controls

- Unauthenticated avatar writes → 401 (tested both endpoints).
- Cross-user finalize (`profiles/<otherUserId>/…`) → 403 `AVATAR_NOT_OWNED`
  before any write (tested); no existence leakage (generic message).
- Foreign-folder / traversal public IDs → 400 `INVALID_MEDIA_RESULT`.
- Oversized (`bytes` > 5MB) → 413; bad format (`svg`) → 400; untrusted
  delivery host → 400; missing dimensions → 400 (all tested).
- `CLOUDINARY_API_SECRET` absent from `apps/web` (grep-verified);
  `avatarPublicId` absent from `apps/web` and response bodies (tested).
- Rate limiting: signing endpoint under `sensitiveLimit`; avatar finalize
  inherits account-route protections.
- Logging: safe fields only (`userId`, `publicId`); no secrets, tokens,
  cookies, or passwords.
- RBAC regression: full `rbac.test.ts` (20) + `security.test.ts` green —
  customer still 403 on admin routes.

## 11. Accessibility

- Trigger is a native `<button>` with dynamic `aria-label`, `aria-haspopup=
  menu`, `aria-expanded`; panel `role=menu`/`menuitem`; identity block
  `aria-hidden` with visually-hidden SR equivalent.
- Keyboard: Enter/Space activate; ArrowUp/Down move; Escape closes + returns
  focus to trigger; Tab-out dismisses (no trap/strand); first item autofocus
  on open.
- Avatar semantics: `UserAvatar` standalone → `role=img` + display-name
  label; inside labelled controls → `decorative` (`aria-hidden`, empty alt).
- Upload: labelled file input (`aria-label="Choose a profile photo"`),
  real `role=progressbar` with value now/max/label during upload; remove
  gated by `JBConfirmDialog` (alertdialog, Escape, focus restore, no
  `window.confirm`); success/error announced via toast live regions +
  inline `role=alert/status` on the profile page.
- Icons are `JBIcon` SVGs only; visible `:focus-visible` token ring;
  `prefers-reduced-motion` respected by the global rule.

## 12. Responsive UX

- Header: name hidden ≤640px (avatar-only trigger); dropdown becomes a
  fixed full-width sheet (`max-width: 100vw-2rem`); long names truncate via
  existing ellipsis rules — no overflow.
- Profile avatar block stacks (photo → actions) on narrow widths; progress
  bar full-width; dialog and toasts reuse the responsive global primitives.
- Verified statically against token CSS breakpoints (900px/640px); live
  browser walk-through at 320/375/390/430/768/1024/1280/1440/1920 was not
  executable in this environment — recommended pre-release pass (see §16).

## 13. Tests Executed

- New/expanded: `apps/api/src/routes/account-avatar.test.ts` — 401 matrix,
  cross-user 403 + `AVATAR_NOT_OWNED` code, set→replace (cleanup `deleted`,
  `destroyMedia` ×1)→remove (`deleted`, null URL)→repeat (`skipped`),
  invalid format 400, **oversized 413, untrusted URL 400, missing
  dimensions 400, foreign-folder 400, avatar set/remove audit rows** (6
  tests). `apps/web/lib/cloudinary-display.test.ts` — avatar preset +
  legacy passthrough + no-double-apply (4 tests).
- Pre-existing suites untouched and green: RBAC (20), security, product
  media (14), storefront, catalogue, smoke, web avatar-unit (8).
- Full `npm test`: **24 files / 195 tests — all pass** (the known
  pre-existing bcrypt parallel-load flake passed on this run).

## 14. Commands Executed

| Command | Result | Note |
| --- | --- | --- |
| `npm run typecheck --workspace @veyra/web` | PASS | clean |
| `npm run typecheck --workspace @veyra/api` | FAIL (pre-existing) | `src/lib/reservations.ts(50)`: `$transaction` missing on `DbClient` + implicit-any `transaction`. Present at `origin/main` (commit `370c828` scope), untouched by Phase F; zero errors in Phase F files (`profile.ts` audit change compiles clean — no new diagnostics) |
| `npm run lint` (api + web) | PASS | 0 errors; 1 unused-var warning (`storefront.ts`) + 4 pre-existing `<img>` warnings, all untouched files |
| `npm test` | PASS | 24 files / 195 tests, all green |
| `npm run build --workspace @veyra/web` | PASS | production build, all routes |
| `npm run build --workspace @veyra/api` | FAIL (pre-existing) | same `reservations.ts` type error as typecheck; not Phase F code |
| Browser responsive/theme/SR walk-through | NOT RUN | no browser harness in this environment; code-reviewed + recommended pre-release |

## 15. Known Limitations

- Live end-to-end Cloudinary upload (real dev-cloud bytes) not performed
  here; signing + normalization + finalize paths are covered offline
  (injected test config, mocked destroy) per the project's no-live-provider
  test policy.
- No cropping UI (upload as-is; transformations available later without
  migration).
- Declared upload MIME/bytes remain advisory until server finalization
  (inherited Phase C property, documented in `docs/CLOUDINARY.md`).
- No orphan reaper for abandoned uploads (server-namespaced triage folders).
- Browser interaction QA (viewports, themes, screen reader) deferred to the
  pre-release manual pass.
- `AdminShell` keeps its own session fetch (redirect semantics; deliberate,
  documented in Phase B).

## 16. Remaining Risks

- The pre-existing API `typecheck`/`build` failure (`reservations.ts`)
  blocks a fully green `npm run typecheck` / `npm run build` at root until
  fixed out-of-band; it is unrelated to Phase F but should be repaired
  before release.
- Production Cloudinary credentials, dashboard folder review, and live
  callback/asset verification remain deployment-gated (see
  `PRODUCTION-ENVIRONMENT.md`).
- Cross-tab session isolation is deliberate (per-tab memory cache); avatar
  changes in one tab do not live-update other tabs until navigation/refresh.

## 17. Files Changed

- `apps/api/src/lib/media/profile.ts` — `PROFILE_UPDATED` audit on avatar
  set/replace/remove (best-effort, logged on failure).
- `apps/api/src/routes/account-avatar.test.ts` — edge-case + audit tests
  (oversized, untrusted URL, dimensions, foreign folder, audit rows;
  audit-log cleanup in `afterAll`).
- `apps/web/lib/cloudinary-display.ts` — new `avatar` delivery preset.
- `apps/web/lib/cloudinary-display.test.ts` — avatar preset test.
- `apps/web/components/UserAvatar.tsx` — render-time avatar transformation.
- `apps/web/components/ProfileAvatar.tsx` — client 5MB pre-check.
- `apps/web/components/AccountMenu.tsx` — Addresses entry.
- `docs/PHASE-F-REPORT.md` — this full report.
- (Prior Phase F commits already in tree: `account.ts` avatar endpoints,
  `ProfileAvatar.tsx`, migration `20260921_phase16_profile_avatar`,
  `docs/CLOUDINARY.md` + `docs/API.md` lifecycle entries.)

## 18. Migration Details

```text
No new migration.
```

Applied previously and relied upon:

```sql
-- prisma/migrations/20260921_phase16_profile_avatar/migration.sql
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarPublicId" TEXT;
```

Additive-only, nullable, no backfill invented, no reset, no history rewrite.
Strategy note: legacy `avatarUrl` values keep rendering; `avatarPublicId`
is null for unset/legacy rows and `removeAvatar` handles URL-only rows
(clears URL, cleanup `skipped`).

## 19. Final Verification

- Acceptance criteria (§51 of the Phase F prompt): profile read/update +
  server-enforced ownership ✓; avatar upload/replace/remove through the
  approved direct-to-Cloudinary architecture with secret server-side ✓;
  type/size/metadata validation client + server ✓; DB persistence +
  safe old-asset handling + failure immutability ✓; navbar states
  (loading skeleton / Sign in / avatar / initials), account menu incl.
  Addresses + permission-gated Admin entry, logout, no-reload sync ✓;
  IDOR/BOLA denials ✓; no arbitrary provider deletion ✓; no sensitive
  leaks ✓; keyboard/focus/Escape/labels/dialog/live-regions/contrast ✓;
  light/dark/system via tokens ✓; responsive rules code-reviewed ✓;
  typecheck (web) + lint + tests (195) + web build green ✓; API
  typecheck/build red only on the pre-existing out-of-scope file ✓;
  docs updated ✓.
- Secret hygiene re-verified: zero `CLOUDINARY_API_SECRET` references under
  `apps/web`; zero `avatarPublicId` references under `apps/web` or in
  response bodies.

## 20. Phase F Status

```text
PHASE F COMPLETE — PASS (with one pre-existing, out-of-scope API
typecheck/build failure documented in §14/§16)
```
