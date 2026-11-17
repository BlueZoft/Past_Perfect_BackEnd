# PastPerfect API — v3.0

Express/MongoDB API for a Sri Lankan used-item marketplace. Version 2 repairs authentication, provides a consistent listing contract, validates browsing/uploads, and disables the unsafe prototype payment endpoint.

## Local setup

Use Node 22+ (validated on Node 24), npm, and MongoDB 7. A local database and local image storage require no external credentials.

```sh
npm ci
cp .env.example .env # only if you do not already have local configuration
# If MongoDB is not already running:
docker run -d --name pastperfect-mongo -p 127.0.0.1:27017:27017 mongo:7.0
npm start
```

For an existing stopped container use `docker start pastperfect-mongo`. `npm run dev` enables restart-on-change. The API awaits database connection before listening on port 3001. Run the companion frontend on `http://localhost:3000`. Use localhost consistently; do not mix it with 127.0.0.1 in browser URLs.

```sh
npm test
```

Tests require MongoDB at `mongodb://127.0.0.1:27017`, or `TEST_MONGODB_URI`. Integration tests create a randomly named `pastperfect_test_*` database and remove only that database and their temporary image directory. They do not reset development records.

## Configuration

| Setting | Local default / replacement |
| --- | --- |
| `PORT` | `3001` |
| `MONGODB_URI` | Local MongoDB; replace with the real connection URI in secure settings |
| `WEB_ORIGIN` | `http://localhost:3000`; replace with the exact frontend origin |
| `IMAGE_DRIVER` | `local` for development, `cloudinary` for production |
| `UPLOAD_DIR` | `./uploads`; ignored by Git, keep persistent storage/backups if needed locally |
| `CLOUDINARY_CLOUD_NAME` | `REPLACE_WITH_ACCOUNT_NAME` placeholder |
| `CLOUDINARY_APIKEY` | `REPLACE_WITH_API_KEY` placeholder |
| `CLOUDINARY_APISECRET` | `REPLACE_WITH_API_SECRET` placeholder |
| `NODE_ENV` | Set `production` for secure cookies; HTTPS required |

Cloudinary placeholders deliberately cannot activate that driver. Supply actual values securely. No account names, shipping rates, gateway credentials or business policies are assumed. Live payments remain unavailable. The local test simulator requires `PAYMENT_DRIVER=test` outside production and never moves money.

## Design and limitations

- `app.js` builds the HTTP application; `index.js` connects MongoDB and starts/shuts down the server.
- `lib/` contains configuration, request validation and error helpers; `services/` contains sessions and image providers.
- Sessions last 24 hours, use random cookies with HttpOnly/SameSite=Strict, store only SHA-256 token digests, and are checked for expiry on every authenticated request. Logout revokes the current session. Production cookies are Secure.
- Mutations require an exact `Origin` match, including scripted clients. Browser credentials are enabled for that origin. Production frontend/API must be same-site; arbitrary cross-site hosting is not supported by these cookie settings.
- Login/signup have an in-memory rate limiter. Multi-instance deployments need a shared limiter store and reviewed proxy/IP configuration. Do not blindly enable trust proxy.
- Local images are limited to 3 files, 5 MB each, with JPEG/PNG/WebP signature and decode checks. Images are re-encoded to metadata-free WebP, listings up to 1920px and avatars up to 512px. Production rejects the local driver. Processing is bounded per process; production still needs ingress/resource monitoring and malware scanning where appropriate.
- Owner-scoped management enforces status transitions and optimistic concurrency using listing versions. Public seller responses expose username/avatar, not email or session data. Replacement media is compensated on failed updates. Retired media is queued for deletion, with reference checks and retryable failures; see the operations guide for remaining crash/orphan reconciliation limitations.
- Realtime messaging, Web Push, live payments, shipping and real refunds remain planned. Dispute review and full simulated refunds are available for test-paid orders.

See [API contract](docs/API.md), [action plan](docs/ACTION_PLAN.md) and [release notes](docs/V2.md). The v2 schema is breaking; existing prototype data is not migrated or deleted automatically.

Version 2.1 seller management details, limitations and validation are recorded in [release notes](docs/V2.md).

Category and district/town choices come from `config/catalogue.json`. Its geography is explicitly placeholder-only. Set `CATALOGUE_FILE` to a reviewed JSON file and restart the API to replace it; see [catalogue configuration](docs/CATALOGUE.md). Enquiries and favourites are private to the authenticated account/participants.

Version 2.2 adds category/location discovery, public seller profiles, profile editing, favourites and buyer/seller enquiries. See [release notes](docs/V2.md) for behavior and limitations.

Version 2.3 adds listing photo replacement, profile avatars, reports, blocking and an allowlisted admin moderation queue. Configure `ADMIN_USER_IDS` with existing user IDs to grant access; no account is an administrator by default. [Operations guide](docs/OPERATIONS.md) covers configuration and media retention.

See [v2.3 release notes](docs/V2.md) for media, reporting/blocking and moderation behavior and limitations.

Version 2.4 completes email verification and password recovery, private in-app notifications, and localized email templates. Copy the example environment without overwriting existing settings, use `MAIL_DRIVER=local` for development, and read the private `.mail-outbox/` files as local emails. Production requires actual SMTP settings; the included values are placeholders. See [account and notification setup](docs/ACCOUNTS.md).

Version 2.5 adds restricted suspended-account sessions, versioned suspension/restoration, user appeals with atomic admin decisions, and configurable prohibited-item rejection/review queues. Bundled policy rules are labelled placeholders; replace them before launch. See [release notes](docs/V2.md).

Version 2.6 adds decoded/resized WebP uploads, conservative dry-run local orphan reconciliation, configurable typed category attributes, skip navigation/route focus, larger touch targets and responsive form/listing layouts. See [release notes](docs/V2.md).

Version 2.7 adds server-priced orders, atomic buyer-specific reservations, cancellation/expiry, order history, participant enquiries and collection status handling. **No real charging is enabled.** Defaults keep checkout disabled; local `PAYMENT_DRIVER=test` enables an explicitly labelled simulator that is refused in production. See the backend [order guide](docs/ORDERS.md) for configuration and limitations.

Version 2.8 adds buyer order disputes, one seller response, seller-approved full simulated refunds, and an allowlisted administrator review queue. Decisions are versioned, retain a shared resolution, notify both participants and preserve private order history. Suspended participants retain these dispute controls. See [release notes](docs/V2.md) and the backend order guide for placeholder policy and live-payment limitations.

Version 2.9 adds indexed title/description keyword search, relevance sorting, condition/size filters, and private named saved searches with rename/delete controls. Legacy literal title search URLs still work. Saved searches reopen current public results; opt-in in-app alerts arrive in v3.0. See [release notes](docs/V2.md) and the [search guide](docs/SEARCH.md) for index setup and limitations.

Version 3.0 closes the local application milestone with typed attribute search, opt-in in-app matching alerts, completed test-order reviews with admin moderation, private seller analytics and health checks. Simulated reviews/totals never claim real customer reputation or earnings. See [local release checklist](docs/LOCAL_RELEASE.md) for reproducible validation and explicit launch/optional follow-up. No live deployment or external financial integration is enabled.
