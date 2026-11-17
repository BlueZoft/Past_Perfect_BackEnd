# v3.0 local application release checklist

This closes the local application milestone accepted in this session. It does **not** declare the service ready for public financial transactions or claim every optional roadmap idea is implemented. No live deployment or environment publication is part of this release.

## Included and reviewable

- Existing account/session, verification/recovery, seller inventory, discovery, favourites, enquiries, media, safety/moderation, account appeals, translations and in-app notifications.
- Server-priced collection orders, bounded reservations/expiry, participant history/contact, test payment/collection transitions, disputes and full simulated refunds.
- Indexed keyword/title discovery with condition/size/location/price and metadata-generated typed attribute filters; private named saved presets and opt-in retryable in-app matching alerts.
- Completed test-order buyer reviews, separate simulated reputation, administrator hide/restore and owner-only seller count/test-total analytics.
- HTTP liveness/connection-readiness endpoints, bounded local CLI jobs, automated backend/frontend/DOM accessibility regression coverage, production frontend build, maintained API/configuration guides and roadmap.

## Reproduce locally without external services

Use Node 22+ (validated with Node 24), npm and MongoDB 7. Keep existing `.env` files; do not overwrite them. Start the existing `pastperfect-mongo` container or follow the README to create one if absent.

```sh
# In Past_Perfect_BackEnd:
npm ci
npm test
npm start
# Optional one-batch housekeeping in a second shell, with the intended local MONGODB_URI:
npm run orders:expire
npm run search:alerts
# Inspection-only media checks:
npm run media:maintenance
npm run media:orphans
```

```sh
# In Past_Perfect_Web:
npm ci
npm test
npm run build
npm start
```

Use local `IMAGE_DRIVER=local`, `MAIL_DRIVER=local` and, only to exercise transactions, `PAYMENT_DRIVER=test` outside production. Keep the mail outbox private; use its verification links. Seed user actions through the UI rather than resetting existing data. Opt into alerts for a named search, publish a matching item from another active account and allow the configured settling delay/bounded sweep to run. Confirm the private notification opens its listing and disabling alerts stops later work. For reviews, finish a simulated collection as its buyer, submit a review, inspect the test label on the seller page and use an allowlisted admin to hide/restore it. Check `/analytics` under different accounts to verify isolation. Test suites use disposable databases; they do not erase development records.

Readiness checks: `/health/live` should return ok; `/health/ready` checks only database connection state. Restart the API after catalogue/policy/configuration changes. Build indexes described in SEARCH.md through the deployment's reviewed database workflow; do not drop/create production indexes blindly.

## Launch work intentionally not performed

Actual hosting, TLS, backups/restore drills, secret management, multi-instance rate limits, workload limits, monitoring/scheduling/SLA capacity, remote asset reconciliation/scanning, production SMTP, real geography/catalogue/policy/retention review, provider onboarding, signature-verified callbacks, payouts/settlement, real refunds/chargebacks and shipping all remain operator/provider work. Placeholders stay in example configuration and guides; no current real-world facts or credentials have been invented. Manual assistive-technology/device/contrast testing and native-speaker translation/policy review still need humans with the target tools/context.

## Optional future product/hardening tracks

Administrator MFA/step-up authentication, long-term audit export/archival, dedicated review reports/evidence/appeals, user review editing/response policy, fuzzy/transliterated discovery, external realtime/Web Push/email alerts, engagement/traffic analytics and carrier delivery notifications remain separate enhancements. They are not prerequisites for exercising this local milestone and are not represented as deployed or completed. Current security/abuse and best-effort notification limitations remain in the relevant guides. Approve their scope and policy before presenting them as product guarantees.

Release verification: **94 backend tests**, **75 frontend tests**, and the frontend production build pass. No live provider or hosted deployment verification is claimed.
