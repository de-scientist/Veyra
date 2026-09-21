# Phase F Report — Profile Media (Avatars)

## 1. Executive Summary

Phase F closed the profile-media loop on the Phase C foundation: users
upload profile photos direct to Cloudinary (signed `profile` context),
the API finalizes validated assets scoped to the caller's own namespace,
replacement cleans the previous asset, removal clears both fields, and
the navbar avatar syncs without a page refresh.

## 2. Database

Migration `20260921_phase16_profile_avatar` (applied): nullable
`User.avatarPublicId` (server-only provider identity; existing rows
unaffected). `avatarUrl` remains the client-visible field. No other
schema changes; no reset; no history rewrite.

## 3. API

- `POST /account/profile/avatar` (`requireAuth`, self-scoped):
  `{publicId, secureUrl, width, height, format, bytes?}` → validates via
  `normalizeUploadResult(…, 'profile')`, requires
  `profiles/<userId>/…` prefix (403 `AVATAR_NOT_OWNED` otherwise),
  persists `avatarUrl + avatarPublicId`, best-effort destroys the prior
  asset post-commit. Returns profile + `providerCleanup`.
- `DELETE /account/profile/avatar`: clears both fields; destroys the
  asset when one exists (`skipped` when none); failures reported, never
  hidden.
- `avatarPublicId` is never serialized (responses + grep-verified); no
  client-supplied user IDs; standard error envelope.

## 4. UI/UX

`ProfileAvatar` on `/account/profile`: current photo (or initials
fallback) + blob preview, real XHR progress bar, replace/remove actions,
MIME pre-check, confirmed destructive remove (`JBConfirmDialog`), toasts
via existing provider, `notifySessionUpdated` → navbar sync. Old photo
stays live until the replacement finalizes; failures leave state
unchanged. Token-only styles, responsive, keyboard-accessible.

## 5. Testing

- New `account-avatar.test.ts` (4): 401s, cross-user 403 + code,
  set→replace (cleanup `deleted`, destroy called once)→remove
  (`deleted`, null URL)→repeat (`skipped`), invalid format 400,
  secret/publicId absence in bodies.
- Full `npm test`: 24 files / 192 tests — all pass on the final run
  (the known pre-existing bcrypt parallel-load flake passed this time;
  it passes isolated when it does trip).
- `typecheck` (api+web) pass; `lint` pass (4 pre-existing `<img>`
  warnings); `next build` pass (58 routes).

## 6. Known Limitations

- No cropping UI (upload as-is; Cloudinary transformations available
  later without migration).
- Declared upload MIME/bytes advisory until server finalization
  (inherited Phase C property).
- No orphan reaper for abandoned uploads (namespaced triage, as
  documented in CLOUDINARY.md).
- Browser interaction QA deferred to pre-release manual pass.

## 7. Files Changed

- `prisma/schema.prisma`, `prisma/migrations/20260921_phase16_profile_avatar/`
- `apps/api/src/lib/media/profile.ts` (new), `apps/api/src/routes/account.ts`
- `apps/api/src/routes/account-avatar.test.ts` (new)
- `apps/web/lib/shopping-api.ts` (avatar client), `apps/web/components/ProfileAvatar.tsx` (new)
- `apps/web/app/account/profile/page.tsx`, `apps/web/app/globals.css`
- `docs/CLOUDINARY.md`, `docs/API.md`, `docs/PHASE-F-REPORT.md`

```text
PHASE F STATUS: COMPLETE
```
