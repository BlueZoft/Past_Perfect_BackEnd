# Orders and collection workflow

## Local validation setup

Checkout is disabled by default. For local development only set `PAYMENT_DRIVER=test`, restart the API, and use verified-email accounts. The existing local mail adapter provides verification links without any external credentials. A buyer cannot order their own listing. Suspended/blocked accounts and unavailable/hidden listings cannot start a new order.

1. Open an active listing as the verified buyer and choose Review order.
2. Review the quote and reserve it. The listing is locked for that order.
3. From its receipt, simulate success or failure. This never moves money.
4. After success, the seller marks it ready for collection; the buyer confirms collection.
5. My orders lists the participant's history. The receipt's message form opens the existing buyer/listing conversation to arrange collection.

`ORDER_HOLD_MINUTES` defaults to 15 (allowed 1–60). `ORDER_PLATFORM_FEE_MINOR` defaults to 0 (allowed 0–100000000). Both are starter technical settings, not researched commercial policy. Currency is LKR. Amounts are integer minor units, and delivery is 0 because there is no delivery service. The fee and item price are snapshotted; configuration/listing changes do not rewrite old orders.

Production refuses test payment mode and cannot create an order while no supported payment adapter is enabled. `PAYMENT_DRIVER=test` does not connect to Stripe or any other provider. No real provider credentials, card fields, external payment callbacks, payouts, refunds or shipping integration are present. Do not use simulated receipts as proof of payment. See the version notes for integration requirements before any live rollout.

## State and concurrency

States: awaiting_payment → confirmed → ready → completed. Awaiting orders can instead become cancelled, expired or payment_failed. Only awaiting orders can be cancelled. Only the buyer can simulate payment or complete collection; only the seller can mark a confirmed order ready. Every action supplies the current order `revision` as `version`; stale/concurrent attempts return 409.

Orders and the current reservation reside on the listing so transitions and inventory changes are one atomic MongoDB write. Public serialization excludes this private ledger/reservation. The order snapshot retains buyer/seller IDs, title, item/fee/total values, currency, times, status, request key and optional test reference. No address or card data is collected. Normal owner edits, status changes, replacement media and removal cannot override an active order lock. Once completed, the sold listing can be removed while its private order history remains accessible to participants. No hard deletion is implemented.

A request key is scoped to the buyer and must be 16–80 letters/digits/underscore/hyphen. Reuse the same key and identical quote expectations when retrying an ambiguous response. Reuse for a changed request conflicts. Frontend keys persist within the current checkout instance; after a full page reload, recover a lost response through My orders rather than starting another order. The embedded ledger stops accepting orders at 100 entries per listing to bound document growth; an archival/migration design is required beyond that limit. Ensure the unique partial buyer/request-key and expiry indexes are built before deployment.

## Expiry and operations

The API runs a non-overlapping, unref'd sweep at startup/every minute, at most 100 expired listings per batch. On-demand quote/order reads also reconcile applicable expired holds. Confirmed orders have no active hold deadline. Releasing a hold always matches its order ID/revision, preventing stale actions from releasing a newer reservation.

```sh
npm run orders:expire
```

This command applies normal expiry transitions (it is not a dry run). Use the correct `MONGODB_URI`. Monitor failures and schedule additional batches if expiry backlog exceeds the per-minute capacity. API downtime may delay automatic expiry; direct quote/order reads can reconcile on recovery. No extra system cron is installed by this release.

Notifications and enquiry messages are separate records written after the canonical operation. They follow existing delivery/retry limitations; they are not a financial ledger. Future live integrations need verified/idempotent provider callbacks, late-event handling, refunds/disputes and seller settlement, plus moderation handling for paid orders whose accounts are suspended. No such integration is represented by the simulator.
