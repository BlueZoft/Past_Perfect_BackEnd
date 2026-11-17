# v3.0 local application milestone

## Completed application work

1. Repair password verification and replace browser-readable permanent tokens with expiring, revocable HTTP-only sessions.
2. Restore frontend compilation with React 18/Vite, remove missing session helper imports, centralize API requests and configuration.
3. Align listing schemas and UI, connect search/sorting/pagination, and add loading/error/empty states.
4. Add server validation and bounded image uploads; provide local development storage and configurable Cloudinary.
5. Disable unsafe payments; remove real/test gateway keys and fictional checkout fees.
6. Add regression suites, repository CI workflows, environment examples and v2 documentation.
7. Complete owner-only text/price editing, My Listings with pagination/status filters, reserve/release, mark sold, confirmed soft removal, and stale-update protection.
8. Add configurable categories and district/town discovery, public seller profiles and username/bio editing, private favourites, buyer enquiry inboxes and participant-only replies.
9. Add owner-only whole-set photo replacement, versioned avatars, retryable retired-media cleanup and dry-run retention tooling, report/block controls and an allowlisted admin moderation queue.
10. Complete email verification and single-use password recovery with session invalidation, English/Sinhala/Tamil application and email translations, and private in-app notifications with unread/read controls.
11. Add suspension/restoration and restricted account sessions, atomic owner-scoped appeals, suspension-aware public discovery, and configurable prohibited-item rejection/review workflows.
12. Add decoded/resized metadata-free image output, local orphan reconciliation, configurable typed category fields, skip navigation, route focus, mobile layouts and automated DOM accessibility checks.
13. Add server-priced order snapshots, atomic buyer reservations, idempotent creation, cancellation/expiry, participant-only order history/contact, collection fulfilment and an explicitly non-production payment simulator.
14. Add private buyer disputes, seller responses, atomic full test refunds, admin review, English/Sinhala/Tamil screens, and participant notifications.
15. Add language-neutral indexed keyword search with relevance ordering and condition/size filters, plus private named saved searches with atomic limits and versioned rename/removal.
16. Add metadata-based attribute filters and saved-query support; opt-in in-app matching alerts with durable scan progress, retry and duplicate protection.
17. Add immutable completed test-order buyer reviews, separate simulated reputation, versioned admin hide/restore, and private seller counts/test-checkout analytics.
18. Add liveness/database-readiness checks and a local release checklist with reproducible tests and explicit remaining responsibilities.

## Local milestone closed

See [LOCAL_RELEASE.md](LOCAL_RELEASE.md) for the implemented scope and validation. No live deployment or environment publication is performed. Real-world values remain documented placeholders.

## Operator/provider launch responsibilities

Hosting/TLS, secrets, backups/restore, resource controls, shared rate limits, monitoring/scheduling/capacity, remote media reconciliation/scanning, actual SMTP/geography/catalogue/policy, real payments/webhooks/settlement/refunds/chargebacks/shipping, and manual accessibility/native-speaker review remain outside this local release. Existing test payment/refund/review flows never move money or establish real reputation.

## Optional product and hardening tracks

Admin MFA/step-up auth, long-term audit archival/export, review-specific evidence/report/appeal policy, fuzzy/transliterated search, realtime messaging/Web Push/email alerts, traffic analytics and delivery notifications remain separate scoped extensions. Current in-app saved-search alerts, collection order notifications and seller inventory/order analytics are complete for local validation. These optional tracks are not silently claimed as implemented.
