# v2.6 action plan

## Completed in this release

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

## Next: marketplace MVP

- Production scheduling/monitoring, remote-provider orphan reconciliation, malware scanning and deployment resource controls.
- Reviewed production geography/catalogue configuration, indexed advanced search and optional realtime messaging/Web Push delivery.
- Production SMTP credentials, reviewed real marketplace policy, audit archival, administrator MFA and further moderation tooling.
- Manual assistive-technology, contrast and device testing; ongoing accessibility and translation review as features grow.

## Later: managed transactions

- Validate actual provider/business requirements; replace documented placeholders securely.
- Orders, reservations, authoritative pricing, verified webhooks, delivery, refunds and disputes.
- Transaction-linked reviews, order/delivery notifications, saved searches and seller analytics.

This release does not claim these future capabilities. No present-day market research or existing-data migration is required for this implementation. Keep each README and API/configuration documentation synchronized with future changes.
