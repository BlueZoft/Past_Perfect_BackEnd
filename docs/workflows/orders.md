# Orders and collection workflow

## Local validation setup

Checkout is disabled by default. For local development only set `PAYMENT_DRIVER=test`, restart the API, and use verified-email accounts. The existing local mail adapter provides verification links without any external credentials. A buyer cannot order their own listing. Suspended/blocked accounts and unavailable/hidden listings cannot start a new order.

1. Open an active listing as the verified buyer and choose Review order.
2. Review the quote and reserve it. The listing is locked for that order.
3. From its receipt, simulate success or failure. This never moves money.
4. After success, the seller marks it ready for collection; the buyer confirms collection.
5. My orders lists the participant's history. The receipt's message form opens the existing buyer/listing conversation to arrange collection.

`ORDER_HOLD_MINUTES` defaults to 15 (allowed 1–60). `ORDER_PLATFORM_FEE_MINOR` defaults to 0 (allowed 0–100000000). Both are starter technical settings, not researched commercial policy. Currency is LKR. Amounts are integer minor units, and delivery is 0 because there is no delivery service. The fee and item price are snapshotted; configuration/listing changes do not rewrite old orders.

Production refuses test payment mode and cannot create an order while no supported payment adapter is enabled. `PAYMENT_DRIVER=test` does not connect to Stripe or any other provider. No real provider credentials, card fields, external payment callbacks, payouts, real refunds or shipping integration are present. Do not use simulated receipts as proof of payment. See the version notes for integration requirements before any live rollout.

## State and concurrency

States: awaiting_payment → confirmed → ready → completed. Awaiting orders can instead become cancelled, expired or payment_failed. Paid test orders may also enter disputed/refunded states as described below. Only awaiting orders can be cancelled. Only the buyer can simulate payment or complete collection; only the seller can mark a confirmed order ready. Every action supplies the current order `revision` as `version`; stale/concurrent attempts return 409.

Orders and the current reservation reside on the listing so transitions and inventory changes are one atomic MongoDB write. Public serialization excludes this private ledger/reservation. The order snapshot retains buyer/seller IDs, title, item/fee/total values, currency, times, status, request key and optional test reference. No address or card data is collected. Normal owner edits, status changes, replacement media and removal cannot override an active order lock. Once completed, the sold listing can be removed while its private order history remains accessible to participants. No hard deletion is implemented.

A request key is scoped to the buyer and must be 16–80 letters/digits/underscore/hyphen. Reuse the same key and identical quote expectations when retrying an ambiguous response. Reuse for a changed request conflicts. Frontend keys persist within the current checkout instance; after a full page reload, recover a lost response through My orders rather than starting another order. The embedded ledger stops accepting orders at 100 entries per listing to bound document growth; an archival/migration design is required beyond that limit. Ensure the unique partial buyer/request-key and expiry indexes are built before deployment.

## Expiry and operations

The API runs a non-overlapping, unref'd sweep at startup/every minute, at most 100 expired listings per batch. On-demand quote/order reads also reconcile applicable expired holds. Confirmed orders have no active hold deadline. Releasing a hold always matches its order ID/revision, preventing stale actions from releasing a newer reservation.

```sh
npm run orders:expire
```

This command applies normal expiry transitions (it is not a dry run). Use the correct `MONGODB_URI`. Monitor failures and schedule additional batches if expiry backlog exceeds the per-minute capacity. API downtime may delay automatic expiry; direct quote/order reads can reconcile on recovery. No extra system cron is installed by this release.

Notifications and enquiry messages are separate records written after the canonical operation. They follow existing delivery/retry limitations; they are not a financial ledger. Future live integrations need verified/idempotent provider callbacks, late-event handling, real refunds/chargebacks and seller settlement. The simulator case workflow below is not a provider integration. No such integration is represented by the simulator.

## v2.8 disputes and simulated refunds

v2.8 adds the following test-order workflow; real refunds, chargebacks and provider settlement are still absent.

1. A buyer with a confirmed, ready or completed **test-paid** order can open a dispute from its receipt. Supply a nonempty reason of up to 2000 characters. This creates one case on that order and sets order status to `disputed`.
2. The seller can submit one nonempty response (up to 2000 characters). Both parties see the original reason and response. Blocking does not prevent case handling; ordinary enquiry messaging still follows block rules.
3. The seller can agree to a full **simulated** refund with a shared resolution. The allowlisted administrator can use `/admin/order-disputes` to review open/refunded/declined cases, open a case URL, and either simulate a full refund or decline it with a shared resolution. Admins cannot use the admin resolver for their own buyer/seller orders. They may still act as an ordinary participant through the participant endpoints.
4. A simulated refund records the immutable order total as `refundMinor`, `test-refund-<orderId>`, resolver ID, time and resolution. It sets order status and case status to `refunded`. A decline records the same decision metadata and restores the order's previous confirmed/ready/completed state; case status becomes `declined`.
5. Both participants receive an ordinary private order notification after each case transition, subject to the existing best-effort delivery limitation. Administrators refresh the queue; no separate admin alert or external email is sent.

Opening a case and simulating any refund require `PAYMENT_DRIVER=test` outside production. A seller response or admin decline can still finish review of an existing case when simulation is disabled. There is no real payment/refund endpoint or credential that enables live money movement. Never label a test reference as a real credit to a bank account.

Order `revision` protects opening, response and decisions. Concurrent decisions commit exactly once; stale requests receive 409 and must refresh. Case fields retain the buyer reason/opener/time, seller response/time, previous state and immutable final resolution/actor/time. A closed case cannot be reopened, edited or refunded again through these endpoints. The original money snapshot and payment reference are preserved. An active reservation lock remains during review; refund releases only its matching lock. Refunding leaves the listing sold, or preserves removal after a completed order. It never republishes inventory, verifies physical return or permits reactivation of a sold listing. Any legitimate resale requires a new listing.

Suspended participants can still read their own orders, open eligible disputes, submit a seller response and approve simulated refunds. Creating/paying/fulfilling orders and sending enquiries remain denied. This preserves access to order remedies without restoring marketplace selling access. Admin access remains denied for suspended admins.

### Placeholder policy and future configuration

The **one case per order**, **one seller response**, **full snapshot total including fees**, **no automatic dispute deadline**, **no attachments**, and **no automatic relisting** rules are conservative technical starter behavior, not a researched Sri Lankan legal/commercial policy or buyer-protection promise. There is no automated arbitration or return service. Build the `orders.dispute.status` / `orders.dispute.openedAt` compound index before enabling queue use in a deployment. Reason/response/resolution text is visible to both participants and the allowlisted admins; never paste confidential internal notes. Open cases have no automatic SLA or escalation timer. Review and triage manually.

Before live rollout, replace this policy with reviewed eligibility/deadlines, fee/partial-refund/return rules, evidence and appeal handling; implement the corresponding validation in `services/orderDisputes.js` and controls in the shared frontend `OrderDispute` component. Actual gateway credentials/webhook secrets must be supplied securely to a future provider adapter, never the browser. Real refunds require a durable request/outbox, provider idempotency keys, verified callbacks, refund-pending/failure/reconciliation states, correct payout/settlement adjustments and immutable financial audit storage. Do not make an external provider call and mark a refund successful with this single-document simulator implementation. Provider integration, shipping, partial/repeated refunds and financial reconciliation remain pending.

## v3.0 completed-order reviews and seller analytics

A buyer can submit one rating (integer 1–5) and nonempty review text (up to 2000 characters) on a completed test order using the current order revision. Sellers/outsiders, pending/disputed/refunded orders, stale writes and repeat reviews are rejected. Current review eligibility is explicitly limited to the existing test payment adapter; implementing real verified-transaction reputation requires a reviewed live-provider contract. The review is embedded in the canonical private order; its creation and moderation increment the same order revision. Reviews cannot be edited/replaced by users in this starter policy.

The seller page's public review feed contains only completed-order, non-hidden reviews from non-suspended buyers for a non-suspended seller. Starting a dispute or refund removes that order's review from current public results/averages without deleting its history; a declined dispute restored to completed becomes eligible again. Listing removal does not erase an order review. Test reviews show explicit simulation labels and a separate test average; they never contribute to a live customer rating. Public projection reveals the reviewer's display name, rating, text, date and test label, not email, buyer/order IDs, private order snapshot or moderation history.

`/admin/reviews` supports versioned hide/restore with a shared reason; admins cannot moderate their own buyer/seller orders. Both participants receive ordinary best-effort order notifications. Reasons/actor/times are retained in the order, with the last **10** review moderation entries to bound the embedded ledger; arrange reviewed archival before relying on long-term audit retention. Reasons are visible to order participants, so never enter confidential internal notes. A seller/user report can direct an admin to investigate associated reviews; a separate review report/evidence/appeal flow remains an optional extension. Hiding a listing and hiding a review remain independent decisions.

`/analytics` is private to the signed-in seller. It counts listings by status, separately counts hidden listings, counts owned orders by state and shows simulated checkout paid/refunded totals including snapshotted fees. These are **not** seller earnings, payout balances, tax reports, real GMV or cash-flow statements. No view/click tracking, attribution, banking or third-party analytics is installed. Completed/removed listing records remain in all-time counts; refunded totals retain the original snapshot. Suspension prevents analytics access but retains the earlier order remedy controls.
