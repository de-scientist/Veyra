# Environment

Sources: `.env.example` (33 lines) + `apps/api/src/lib/env.ts` (also reads `NODE_ENV`, `API_HOST`, `API_PORT`, legacy `M_PESA_*` aliases, `RETURN_WINDOW_DAYS` — the last group is NOT in the example). Never commit real secrets; only `.env.example` is tracked.

| Name | Purpose | Required | Secret |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection | Yes | Yes |
| `API_URL` | Internal API base | Yes | No |
| `NEXT_PUBLIC_API_URL` | Browser-facing API base (only `NEXT_PUBLIC_*` var) | Yes | No |
| `AUTH_SECRET`, `SESSION_SECRET` | Session/token signing (≥32 random chars) | Yes | Yes |
| `APP_URL` | Canonical web URL (deep links, JSON-LD, callbacks) | Yes | No |
| `CORS_ORIGIN` | Exact allowed origin, no wildcards | Yes (prod) | No |
| `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET` | Media storage — demo values; no wired usage found | No | Key/secret yes |
| `MPESA_CONSUMER_KEY/SECRET` | Daraja OAuth | Yes for payments | Yes |
| `MPESA_SHORTCODE`, `MPESA_PASSKEY` | STK push identity | Yes for payments | Passkey yes |
| `MPESA_CALLBACK_URL` | Must be HTTPS in production | Yes for payments | No |
| `MPESA_ENVIRONMENT` | `sandbox` / `production` | Yes for payments | No |
| `RATE_LIMIT_MAX/WINDOW_MS/AUTH_MAX/SENSITIVE_MAX` | Rate budgets (100/min global; 10 auth; 30 sensitive) | No (defaults) | No |
| `BODY_LIMIT_BYTES` | Request body cap (default ~1MB) | No | No |
| `EMAIL_PROVIDER` (`log`/`mock`/`smtp`), `EMAIL_FROM_ADDRESS/NAME`, `EMAIL_WEBHOOK_SECRET` | Outbound email | No (dev defaults) | Webhook secret yes |
| `SMS_PROVIDER` (`mock`/`log`), `SMS_SENDER_ID`, `SMS_WEBHOOK_SECRET` | Outbound SMS | No (dev defaults) | Webhook secret yes |
| `NOTIFICATION_MAX_ATTEMPTS/BASE_DELAY_MS/MAX_DELAY_MS/BATCH_SIZE` | Outbox retry tuning | No (defaults) | No |

Notes: `APP_URL` appears twice in `.env.example` (duplicate — harmless, last wins). Sender defaults still carry the historic brand (`EMAIL_FROM_NAME="Veyra"`, `SMS_SENDER_ID="VEYRA"`, seed admin `admin@veyra.local`) — REQUIRES BUSINESS DECISION before production. `RETURN_WINDOW_DAYS` is read by code but missing from the example — add it when finalizing returns policy.
