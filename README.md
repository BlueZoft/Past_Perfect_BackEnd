# PastPerfect API — v2.3

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

Cloudinary placeholders deliberately cannot activate that driver. Supply actual values securely. No account names, shipping rates, gateway credentials or business policies are assumed. Payments remain unavailable regardless of environment settings until a complete order/provider integration is implemented.

## Design and limitations

- `app.js` builds the HTTP application; `index.js` connects MongoDB and starts/shuts down the server.
- `lib/` contains configuration, request validation and error helpers; `services/` contains sessions and image providers.
- Sessions last 24 hours, use random cookies with HttpOnly/SameSite=Strict, store only SHA-256 token digests, and are checked for expiry on every authenticated request. Logout revokes the current session. Production cookies are Secure.
- Mutations require an exact `Origin` match, including scripted clients. Browser credentials are enabled for that origin. Production frontend/API must be same-site; arbitrary cross-site hosting is not supported by these cookie settings.
- Login/signup have an in-memory rate limiter. Multi-instance deployments need a shared limiter store and reviewed proxy/IP configuration. Do not blindly enable trust proxy.
- Local images are limited to 3 files, 5 MB each, with JPEG/PNG/WebP signature checks. Production rejects the local driver. Files are held in bounded request memory; production should add image re-encoding, resource/concurrency limits and scanning where appropriate.
- Owner-scoped management enforces status transitions and optimistic concurrency using listing versions. Public seller responses expose username/avatar, not email or session data. Replacement media is compensated on failed updates. Retired media is queued for deletion, with reference checks and retryable failures; see the operations guide for remaining crash/orphan reconciliation limitations.
- Password reset, verification, realtime messaging/notifications, account suspension/appeals, buyer-specific reservations and orders are not implemented yet.

See [API contract](docs/API.md), [action plan](docs/ACTION_PLAN.md) and [release notes](docs/V2.md). The v2 schema is breaking; existing prototype data is not migrated or deleted automatically.

Version 2.1 seller management details, limitations and validation are recorded in [release notes](docs/V2.md).

Category and district/town choices come from `config/catalogue.json`. Its geography is explicitly placeholder-only. Set `CATALOGUE_FILE` to a reviewed JSON file and restart the API to replace it; see [catalogue configuration](docs/CATALOGUE.md). Enquiries and favourites are private to the authenticated account/participants.

Version 2.2 adds category/location discovery, public seller profiles, profile editing, favourites and buyer/seller enquiries. See [release notes](docs/V2.md) for behavior and limitations.

Version 2.3 adds listing photo replacement, profile avatars, reports, blocking and an allowlisted admin moderation queue. Configure `ADMIN_USER_IDS` with existing user IDs to grant access; no account is an administrator by default. [Operations guide](docs/OPERATIONS.md) covers configuration and media retention.

See [v2.3 release notes](docs/V2.md) for media, reporting/blocking and moderation behavior and limitations.
