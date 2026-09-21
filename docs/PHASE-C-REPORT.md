# Phase C Report — Cloudinary Media Infrastructure & Secure Upload Foundation

## Executive Summary

Phase C built the reusable, production-ready media foundation: server-side
Cloudinary configuration with fail-safe validation, a pure centralized
upload policy, a server-only provider (signing + guarded destroy + result
normalization), an application service layer, one protected endpoint
(`POST /media/sign-upload`), a provider-agnostic browser upload helper,
and hostname-scoped `next/image` support. No ProductImage/profile UI,
catalogue, or storefront work was attempted.

## Existing State (Phase A/B verified, not re-audited)

Phase A found zero Cloudinary code/config; `ProductImage` holds
`url/altText/isPrimary/sortOrder` (no provider metadata); `User.avatarUrl`
exists and is serialized by `/auth/me`. Phase B (report + code verified:
`lib/session.tsx`, `UserAvatar`, `AccountMenu`, permission-gated admin
entry) delivered the session-aware shell Phase C assumes. Cookie-session
auth and tiered RBAC were reused untouched.

## Cloudinary Architecture

```text
Browser → POST /media/sign-upload {context, contentType?, bytes?}
  → requireAuth (+ requireOperationsAccess iff context=product)
  → service (session identity) → policy (MIME/size/context)
  → backend timestamp + folder + UUID public ID → SDK HMAC signature
Browser → direct POST to Cloudinary upload URL (signed fields echoed)
Cloudinary → response → normalize/validate (client now, server at D/F finalization)
```

Installed: `cloudinary@2.11.0` in `@veyra/api` only (official SDK; used
for `utils.api_sign_request`, `config`, `uploader.destroy`). No frontend
Cloudinary dependency. Large files never transit Fastify.

## Configuration

`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` (optional) +
`CLOUDINARY_UPLOAD_FOLDER` (default `jb-mercantile`) added to
`lib/env.ts` (zod) and `.env.example` (placeholders only). Absent
credentials → `503 MEDIA_NOT_CONFIGURED` everywhere (dev clear error,
prod deployment error; no fake uploads). Secret never leaves the server:
verified by tests (response serialization) and by grep (no
`CLOUDINARY_API_SECRET` under `apps/web`).

## Upload Policy

Centralized in `lib/media/policy.ts` (single source): contexts
`product|profile`; JPEG/PNG/WebP only (AVIF/SVG/GIF/raw rejected);
8MB product / 5MB profile; folders `<base>/products|profiles`;
server UUID public IDs (`profiles/<ownerUserId>/<uuid>` for triage);
`image` resource type fixed; `overwrite` unsigned-by-design (UUID entropy);
backend timestamps for prompt use (Cloudinary's own freshness window
documented, not re-implemented); delivery trust = HTTPS
`res.cloudinary.com` only.

## Authentication / Authorization

`requireAuth` on the endpoint (401 otherwise). Profile: any authenticated
user, self-scoped from `request.user.id` — client `userId` ignored.
Product: `requireOperationsAccess` (existing catalogue model, staff+; no
new permission invented). Role boundaries verified by tests: customer
profile-allowed/product-denied; staff+admin product-allowed. Backend is
the authority; nothing client-controlled influences the decision.

## Provider Architecture

`lib/media/cloudinary.ts` (server-only): `getMediaConfig`,
`authorizeDirectUpload`, `signParams`/`buildSignableParams`,
`normalizeUploadResult`, `destroyMedia` (base-folder guard, no HTTP
endpoint), `setMediaConfigForTests` seam. `lib/media/service.ts` owns
WHO/WHAT; routes own HTTP. Business logic never enters the provider.

## Database

No migration. Decision (§26–27): `ProductImage` gains provider fields in
Phase D via forward-only migration; no generic `Media` table (relational
ownership favors extending `ProductImage` + avatar reference). Existing
`User.avatarUrl` / `ProductImage.url` / Unsplash assets untouched and
still render.

## API

`POST /api/v1/media/sign-upload` (§47 contract in `docs/CLOUDINARY.md`);
standard error envelope (400/401/403/413/429/503/502); `sensitiveLimit`
budget. Deliberately NO generic delete endpoint (§95).

## Frontend

`apps/web/lib/media-upload.ts`: `requestUploadAuthorization`,
`uploadFileDirectlyToCloudinary` (XHR real progress, AbortSignal cancel),
`uploadMedia` orchestration, pure `normalizeCloudinaryResponse`
(unit-tested), `MediaUploadError` codes. Statuses idle→authorizing→
uploading→success/error supported; progress is real XHR fractions, never
fabricated. `next.config.mjs` adds hostname-only `res.cloudinary.com`
(Unsplash preserved).

## Security

Threats→mitigations: secret exposure (server-only + tests + bundle grep);
signature abuse (auth + permission + sensitiveLimit + minimal signed
fields + prompt-use timestamps); folder/ID/role/user tampering (ignored /
session-derived — tested); arbitrary transforms/resource types (unsigned,
fixed); file abuse (declared pre-check + normalization gate at
finalization; true pre-upload byte inspection documented as a direct-upload
limitation in `docs/CLOUDINARY.md`); destructive ops (no public endpoint,
prefix guard); SSRF (no URL fetching); logging (safe fields only, no
AuditLog flood — destructive ops audited in D/F). No business-logic
weakening; RBAC suites still green.

## Testing

- New: `policy.test.ts` (8), `cloudinary.test.ts` (8 incl. deterministic
  503-without-credentials via module reset), `routes/media.test.ts` (10:
  401/403 matrix, secret-absence, cross-user scoping, tamper-override,
  400/413, config-missing adaptation, 429 loop), `media-upload.test.ts`
  (2). No live Cloudinary in tests (offline HMAC + injected config).
- Full `npm test`: 19 files, 157 tests — 156 pass on the full parallel run
  (15 pre-existing files unaffected; the single failure was the pre-existing
  bcrypt `hashes and verifies passwords` test exceeding its 5s timeout under
  parallel load — it takes ~4.5s isolated and passes on re-run; unrelated to
  Phase C, which touches no auth code).
- `typecheck` (api+web) pass; `lint` (api+web) pass (only 4 pre-existing
  `<img>` warnings); `next build` pass (54 routes).
- Manual QA: signed parameters verified structurally via tests; live
  end-to-end upload against the dev cloud was NOT performed (no test
  assets left behind; dashboard setup not claimed).

## Known Limitations

- Declared MIME/bytes are advisory until Phase D/F finalization validates
  actual provider results server-side (documented, not oversold).
- `overwrite` unsigned (UUID rationale documented); Phase D/F may add
  explicit `overwrite=false` with live-cloud verification.
- XHR upload path unit-uncovered in node env (jsdom not added); covered by
  pure normalization tests + deferred Phase D/F integration.
- No orphan reaper (triage via namespaced folders; cleanup in D/F).
- No Cloudinary transformations exposed (clients cannot request any).

## Future Consumers

Phase D: product media UI + `ProductImage` migration + persistence-time
`normalizeUploadResult` + `destroyMedia` lifecycle. Phase F: avatar
upload/replace/remove + session refresh (Phase B `notifySessionUpdated`
already wired for this).

```text
PHASE C COMPLETE
```
