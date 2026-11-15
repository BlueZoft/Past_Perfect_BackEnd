# v2 action plan

## Completed in this release

1. Repair password verification and replace browser-readable permanent tokens with expiring, revocable HTTP-only sessions.
2. Restore frontend compilation with React 18/Vite, remove missing session helper imports, centralize API requests and configuration.
3. Align listing schemas and UI, connect search/sorting/pagination, and add loading/error/empty states.
4. Add server validation and bounded image uploads; provide local development storage and configurable Cloudinary.
5. Disable unsafe payments; remove real/test gateway keys and fictional checkout fees.
6. Add regression suites, repository CI workflows, environment examples and v2 documentation.

## Next: marketplace MVP

- Owner-authorized listing edit/remove/reserve/mark-sold flows and My Listings UI.
- Categories with typed attributes, district/town discovery, seller profiles, favourites and buyer enquiries.
- Verification, password recovery, report/block actions and an admin moderation queue.
- Sinhala/Tamil/English interface translations, accessibility audit and mobile upload improvements.

## Later: managed transactions

- Validate actual provider/business requirements; replace documented placeholders securely.
- Orders, reservations, authoritative pricing, verified webhooks, delivery, refunds and disputes.
- Transaction-linked reviews, notifications, saved searches and seller analytics.

This release does not claim these future capabilities. No present-day market research or existing-data migration is required for this implementation. Keep each README and API/configuration documentation synchronized with future changes.
