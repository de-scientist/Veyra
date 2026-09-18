# Release Candidate Identity

```text
Repository: https://github.com/de-scientist/Veyra.git
Branch: main
Commit: 3e63e81bc44434face4d3b55137faac99100759a
Commit date: 2026-09-18 (+ runtime fixes below, uncommitted at validation time)
Version: unversioned (no package version / tag; tagging NOT authorized)
Environment: local development (Windows, Node v24.21.0, npm 11.19.0, PostgreSQL 18)
Validation date: 2026-09-18
```

## Candidate Changes Since Commit

Two uncommitted runtime fixes, both validated by the gates below:

| File | Change | Reason |
|---|---|---|
| `apps/api/package.json` | dev script loads root `.env` via `--env-file` | API crashed on boot otherwise |
| `apps/web/next.config.mjs` | `images.remotePatterns` for `images.unsplash.com` | Homepage/shop 500 otherwise |

Plus release-docs additions (`robots.ts`, `sitemap.ts`, env-driven `metadataBase` from the prior session).

No release tag created (authorization not given). The staged/validated code must be committed and tagged before any production deployment; re-run the gates on the tagged tree.
