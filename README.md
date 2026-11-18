# Past Perfect API — v3.0.0

Express/Mongoose API for the Past Perfect used-item marketplace prototype, with a companion React web client. Core account, inventory, community/moderation, search and in-app alert flows are implemented. Collection orders, payments/refunds and completed-order reviews use an explicit **non-production simulator**; there is no live financial/carrier integration.

## Documentation

Start at the [API documentation index](docs/README.md) or the [platform handbook](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/README.md).

- [Current API contract](docs/reference/api.md), [environment/defaults/placeholders](docs/configuration/environment.md).
- [Accounts/email](docs/configuration/accounts.md), [catalogue](docs/configuration/catalogue.md), [search/alerts](docs/configuration/search.md), [orders/disputes/reviews](docs/workflows/orders.md).
- [Operations](docs/operations/operations.md), [local release checklist](docs/operations/local-release.md), [roadmap](docs/planning/roadmap.md), [release history](docs/releases/history.md).
- Companion [architecture](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/architecture/overview.md), [workflows](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/workflows/marketplace.md), [demo guide](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/guides/local-demo.md).

Current guides were audited against API `aa07731` / Web `2abc119`. Earlier documentation filenames remain redirect pages; release history is not the current operating contract.

## Local setup

Use Node 22+ (previous validation: Node 24), npm and MongoDB 7. Keep existing configuration; copy the example only when `.env` does not already exist.

```sh
npm ci
# If no .env exists, create it from .env.example and review local settings.
# For an existing stopped local container:
docker start pastperfect-mongo
npm start
```

If the container does not exist and no MongoDB is running, the optional local creation command is:

```sh
docker run -d --name pastperfect-mongo -p 127.0.0.1:27017:27017 mongo:7.0
```

The API awaits the configured database and defaults to port 3001; the frontend defaults to `http://localhost:3000`. Browser requests use the exact configured `WEB_ORIGIN` and same-site HTTP-only sessions. Use localhost consistently in browser URLs. Local image storage needs no provider credentials. `MAIL_DRIVER=local` writes private mail files for verification/recovery; it does not deliver to a real mailbox. Checkout stays disabled unless `PAYMENT_DRIVER=test` outside production. Never commit `.env`, outbox tokens, uploads or database contents.

## Checks and jobs

```sh
npm test
npm run orders:expire
npm run search:alerts
npm run media:maintenance
npm run media:orphans
```

Tests create/drop only disposable `pastperfect_test_*` databases and need MongoDB. Expiry/alert commands write normal bounded job state; media commands default to inspection, with explicit apply described in the operations guide. Confirm the intended database/driver before any maintenance.

`/health/live` checks HTTP liveness and `/health/ready` reports Mongoose connection state, not complete mail/media/index/worker readiness. The recorded v3.0 validation was 94 API tests, 75 web tests and a successful web production build; this documentation revision does not claim new live-provider or browser/device validation.

Production geography, policy, SMTP/storage/service credentials, hosting/security/backup/capacity decisions and human review remain documented launch work. No automatic old-prototype data migration, live deployment or environment publication is performed. Saved-search/review/audit/history bounds and independent side-effect limitations are documented rather than treated as delivery/financial guarantees.
