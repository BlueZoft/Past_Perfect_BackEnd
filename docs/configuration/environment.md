# Environment and placeholder reference

Run the API from its repository root; `lib/config.js` loads dotenv there. Start from [`.env.example`](../../.env.example) only when no existing configuration exists. Keep credentials/private paths out of Git. The frontend's [`.env.example`](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/.env.example) contains public build-time configuration only.

## Core connection and authentication

| Key | Executable default / behavior | Replacement or caution |
| --- | --- | --- |
| `PORT` | 3001 | Local API listener; frontend script separately uses strict port 3000 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/pastperfect` | Real database URI is private; test suites use separate random test DB names |
| `WEB_ORIGIN` | `http://localhost:3000` | Exact frontend origin for credentialed CORS, mutations and email links |
| `NODE_ENV` | No production flag unless explicitly set | Production enables Secure cookies, rejects local image/mail operation, disables test payments |
| `ADMIN_USER_IDS` | Empty grants no admin access | Comma-separated existing 24-hex User IDs; example placeholder is intentionally invalid |
| `VITE_API_URL` (Web only) | `http://localhost:3001` | Public build-time API origin; never put credentials here |

Session lifetime is fixed in `lib/config.js` at 24 hours, not exposed as an environment key. HTTP-only SameSite=Strict cookies assume compatible same-site browser/API hosting. Enabling production flags alone does not provision HTTPS, backups, storage or a payment service.

## Media

| Key | Default / meaning |
| --- | --- |
| `IMAGE_DRIVER` | `local` when absent; accepts local/cloudinary |
| `UPLOAD_DIR` | `./uploads`, resolved from working directory |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_APIKEY`, `CLOUDINARY_APISECRET` | No usable default; `REPLACE_*` values rejected for cloudinary |
| `MEDIA_RETENTION_DAYS` | 30; starter age threshold for removed-listing media maintenance |
| `MEDIA_ORPHAN_GRACE_HOURS` | 24; starter grace for local orphan candidates |

Sharp output limits/quality/concurrency are in `services/images.js`, not arbitrary environment keys: 5 MB input, 20 million pixels, 10,000 px axis, single page; WebP quality 80, 1920 px listing/512 px avatar, at most two active saves. Local storage is rejected in production. Maintenance is dry-run unless explicitly applied; choose reviewed retention/grace and the original driver before deletion. No malware scanner or remote-provider orphan enumeration is supplied.

## Email

| Key | Default / meaning |
| --- | --- |
| `MAIL_DRIVER` | Disabled when absent/unsupported; local/smtp enable the feature. The example explicitly sets local |
| `MAIL_OUTBOX_DIR` | `.mail-outbox`; private and outside uploads; local mode only |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` | No usable production defaults; replace placeholders securely |
| `SMTP_PORT` | 587 (STARTTLS); 465 uses TLS; other ports rejected |

TLS certificate checks stay enabled and minimum TLS is 1.2. Local mail sends files, not external emails, and fails in production. Token lifetime is 30 minutes in `services/accountTokens.js`; it is not an email-provider setting. See [account setup](accounts.md) for failure and recovery behavior.

## Catalogue, policy and demo transactions

| Key | Default / meaning |
| --- | --- |
| `CATALOGUE_FILE` | Bundled `config/catalogue.json`; optional override path, absolute recommended |
| `POLICY_FILE` | Bundled `config/policy.json`; optional reviewed JSON override |
| `PAYMENT_DRIVER` | New checkout disabled unless exactly test outside production; example sets disabled |
| `ORDER_HOLD_MINUTES` | 15; integer 1–60 |
| `ORDER_PLATFORM_FEE_MINOR` | 0; integer 0–100,000,000 LKR minor units |
| `SEARCH_ALERT_DELAY_SECONDS` | 60; integer 0–3600 settling delay |
| `TEST_MONGODB_URI` | Test runner connection default `mongodb://127.0.0.1:27017`; random disposable DB name is supplied by tests |

Bundled location values (`sample-district`, Example district, Example town), category attributes, policy phrases/notices, reservation/fee settings and retention choices are explicit starter examples. They are not researched geography, legal rules, commercial prices, customer guarantees or SLAs. Replace catalogue/policy through reviewed files and restart; changes do not automatically migrate existing listings or rewrite saved queries.

There are no actual gateway/card/webhook/payout/carrier credentials to configure in v3.0 because those integrations are absent. Adding Stripe-like keys does not activate them. Do not disable verification/TLS/security checks to make placeholders look connected. Read [order rules](../workflows/orders.md), [search](search.md), [operations](../operations/operations.md) and [local release](../operations/local-release.md) for the exact boundary.
