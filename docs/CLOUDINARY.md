# Cloudinary Media Infrastructure (Phase C)

Canonical reference for JB Mercantile media uploads. The browser never
receives `CLOUDINARY_API_SECRET`. Upload authorization is generated
server-side. The database/application remains the source of truth for
ownership and authorization. Cloudinary is the media storage/delivery
provider.

## Required environment variables

```env
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=jb-mercantile
```

Placeholders only in `.env.example`; real values live in untracked local
`.env` (dev) or the deployment secret store (staging/production). Never
prefix these with `NEXT_PUBLIC_*`. If the three credentials are absent,
`POST /media/sign-upload` fails with `503 MEDIA_NOT_CONFIGURED` — the
system never falls back to fake uploads.

## Local setup

1. Create/use a Cloudinary **development** account (never production for dev).
2. Copy cloud name, API key, API secret from the Cloudinary dashboard.
3. Put them in local `.env` (never commit).
4. Restart the API (`env.ts` parses at boot).
5. Run `npx vitest run apps/api/src/lib/media apps/api/src/routes/media.test.ts`.

Staging/production must use separate Cloudinary configuration/resources from
development. Never run destructive provider operations against production
during development.

## Upload architecture

```text
Browser → POST /api/v1/media/sign-upload { context, contentType?, bytes? }
API     → requireAuth (+ requireOperationsAccess for context=product)
        → policy check (context, declared MIME/size)
        → server timestamp + server folder + server public ID
        → HMAC signature (cloudinary SDK, secret stays server-side)
Browser → POST https://api.cloudinary.com/v1_1/<cloud>/image/upload
          (file + api_key + timestamp + signature + folder + public_id)
Cloudinary → upload response → client normalizes/validates
Phase D/F → domain endpoint validates provider result again and persists
            only approved metadata (publicId, secureUrl, dimensions, format)
```

Signature generation creates **no database records**. `signature generated`
≠ `media uploaded`: assets become referenced only when a Phase D/F domain
endpoint persists validated metadata.

## Upload policy (single source: `apps/api/src/lib/media/policy.ts`)

| Context   | Folder                      | MIME                          | Max bytes | Public ID                    | Who                        |
| --------- | --------------------------- | ----------------------------- | --------- | ---------------------------- | -------------------------- |
| `product` | `<base>/products`           | jpeg, png, webp               | 8,000,000 | server UUID                  | operations roles (staff+)  |
| `profile` | `<base>/profiles`           | jpeg, png, webp               | 5,000,000 | `<ownerUserId>/<uuid>`       | any authenticated user     |

- Resource type is always `image`; the client cannot switch to video/raw.
- AVIF/SVG/GIF are rejected (AVIF may be added later without breakage).
- `overwrite` is not signed: UUID public IDs make collisions infeasible.
- Timestamps are backend-generated for immediate use; Cloudinary enforces
  its own freshness window (documented, not re-implemented).
- Declared `contentType`/`bytes` are advisory pre-checks (direct upload
  means no server-side file inspection); `normalizeUploadResult` enforces
  resource type, HTTPS `res.cloudinary.com` URL, format, dimensions, and
  bytes at finalization.

## API contract

`POST /api/v1/media/sign-upload` (rate budget: `sensitiveLimit`, default
30/min) → `200`:

```json
{
  "provider": "cloudinary",
  "cloudName": "...",
  "apiKey": "...",
  "uploadUrl": "https://api.cloudinary.com/v1_1/<cloud>/image/upload",
  "timestamp": 1234567890,
  "signature": "...",
  "folder": "jb-mercantile/products",
  "publicId": "...",
  "resourceType": "image",
  "allowedFormats": ["jpg", "jpeg", "png", "webp"],
  "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"],
  "maxBytes": 8000000
}
```

Errors use the standard envelope: `400 INVALID_MEDIA_CONTEXT` /
`UNSUPPORTED_MEDIA_TYPE`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`,
`413 MEDIA_TOO_LARGE`, `429` rate limited, `503 MEDIA_NOT_CONFIGURED`,
`502 MEDIA_PROVIDER_ERROR` (delete path only). Unknown body fields
(`folder`, `publicId`, `role`, `userId`, `timestamp`) are stripped or
ignored — identity and policy always come from the session and the policy
module.

## Security model

- Secret hygiene: `CLOUDINARY_API_SECRET` appears only in server env and the
  server-only `lib/media/cloudinary.ts` (never imported by web code;
  verified: no `CLOUDINARY_API_SECRET` reference under `apps/web`).
- Authorization: profile is self-scoped from `request.user.id`; product
  requires `requireOperationsAccess` (existing catalogue permission model —
  no new permission invented).
- Abuse: `sensitiveLimit` throttles signature issuance; signed fields are
  minimal and echoed verbatim; no arbitrary folders, public IDs,
  transformations, or resource types.
- Deletion: `destroyMedia(publicId)` is server-only with a base-folder
  prefix guard; **no generic HTTP delete endpoint** exists (Phase D/F
  domain endpoints will own authorized deletion).
- Logging: `media.upload_authorized` / `media.delete_failed` via pino with
  safe fields only (context, userId, publicId). No signatures, secrets,
  tokens, or payloads. No per-signature AuditLog rows (high-volume);
  destructive operations will be audited in Phase D/F.
- No SSRF surface: the server never fetches user-provided URLs.
- Frontend: `apps/web/lib/media-upload.ts` (XHR with real progress +
  AbortSignal cancellation + response normalization); `next/image` allows
  only `images.unsplash.com` (legacy) and `res.cloudinary.com`
  (hostname-only, no wildcards). No CSP change was needed (no CSP header
  exists yet; future CSP must allow `api.cloudinary.com` in `connect-src`
  and `res.cloudinary.com` in `img-src`).

## Consistency / orphan strategy

```text
Upload succeeds → domain persists validated metadata → asset referenced.
DB write fails → Cloudinary asset orphaned (documented, not silent).
DB delete succeeds + provider delete fails → reference gone, asset remains.
```

No distributed transactions are claimed. Mitigations: server-namespaced
folders (`profiles/<userId>/…`) allow orphan triage; delete-old-after-persist
ordering for future replacement flows (new upload → DB update → delete old);
explicit cleanup tooling is Phase D/F scope. Legacy Unsplash/external URLs
keep rendering unchanged — no migration attempted.

## Code map

- `apps/api/src/lib/media/policy.ts` — pure policy (contexts, MIME, sizes,
  folders, public IDs, URL trust).
- `apps/api/src/lib/media/cloudinary.ts` — server-only provider (config,
  signing, destroy, result normalization) + `setMediaConfigForTests` seam.
- `apps/api/src/lib/media/service.ts` — WHO/WHAT (session identity,
  context routing).
- `apps/api/src/routes/media.ts` — HTTP + guards; registered in `app.ts`.
- `apps/web/lib/media-upload.ts` — client helper (+ pure `normalize…`
  unit tests; XHR path covered by Phase D/F integration).

## Product-image lifecycle (Phase D — implemented)

`ProductImage` carries provider metadata (`publicId`, `secureUrl`,
`width/height/format/bytes`, `updatedAt`; legacy `url` retained and mirrored
from `secureUrl` for old readers). Domain endpoints under
`/admin/products/:productId/images` (list, create, metadata PATCH, primary,
reorder, replace, delete) enforce `requireOperationsAccess`, product→image
ownership on every call, DRAFT/ACTIVE-only mutation, first-image-wins
primary at position 0 (Pattern A: reorder never changes primary), complete-
set transactional reorder, replace-preserves-identity with post-commit old-
asset cleanup, delete with next-lowest-sortOrder promotion, and DB-first /
provider-cleanup-after consistency (`providerCleanup: deleted|failed|skipped`
is always reported, never hidden). Single-primary invariant holds via a
partial unique index `(productId) WHERE isPrimary` plus transactions; double
deletes are idempotent 404s. At most 20 images per product (operational
safeguard). Display sizes use fixed delivery presets
(`apps/web/lib/cloudinary-display.ts`); the canonical URL is never rewritten.
Audit actions: `PRODUCT_IMAGE_CREATED/UPDATED/REORDERED/REPLACED/DELETED`,
`PRODUCT_PRIMARY_IMAGE_CHANGED`.

## Profile-avatar lifecycle (Phase F — implemented)

`POST /account/profile/avatar` finalizes a direct upload: validates the
provider result, requires the public ID under the caller's own
`profiles/<userId>/` namespace (403 otherwise), persists `avatarUrl` +
server-only `avatarPublicId` (`User.avatarPublicId`, nullable migration),
then best-effort destroys the previous asset. `DELETE
/account/profile/avatar` clears both fields and removes the asset when
possible; cleanup outcomes report as `providerCleanup`
(`deleted|failed|skipped`). The profile page (`ProfileAvatar`) previews,
uploads with real progress, replaces, and removes; `notifySessionUpdated`
refreshes the navbar avatar without reload.

## Future consumers

- Category/collection/banner imagery can reuse the same signed-upload +
  finalize pattern with new contexts when the business requires it.

## Cloudinary dashboard (manual, not code)

Cloud name + API key/secret from dashboard; folder convention
`jb-mercantile/{products,profiles}` is enforced by the API (no preset
needed — signed uploads require none); keep account upload restrictions
sensible; dashboard setup completion is deployment-specific and NOT claimed
by this phase.
