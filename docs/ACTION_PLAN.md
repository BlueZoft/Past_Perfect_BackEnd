# v2.4 action plan

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

## Next: marketplace MVP

- Production scheduling/monitoring of media maintenance, orphan reconciliation after process crashes, and image re-encoding/scanning.
- Additional category-specific attributes beyond clothing size, production geography configuration, and optional realtime messaging/Web Push delivery.
- Production SMTP credentials, account suspension/appeals, prohibited-item policy configuration and advanced moderation tools.
- Accessibility audit, mobile upload improvements and ongoing translation review as features grow.

## Later: managed transactions

- Validate actual provider/business requirements; replace documented placeholders securely.
- Orders, reservations, authoritative pricing, verified webhooks, delivery, refunds and disputes.
- Transaction-linked reviews, notifications, saved searches and seller analytics.

This release does not claim these future capabilities. No present-day market research or existing-data migration is required for this implementation. Keep each README and API/configuration documentation synchronized with future changes.
