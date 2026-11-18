# API reference — v3.0.0

Audited against backend `aa07731`. There is **no `/api` path prefix** in the application. The examples assume `http://localhost:3001` and exact mutation `Origin: http://localhost:3000`; replace with configured values, not invented deployed domains. See [environment](../configuration/environment.md), [source map](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/reference/source-map.md) and [historical contracts](../releases/api-evolution.md).

## Conventions

JSON errors have `{ "error": "message" }`. Most errors use 400 validation, 401 missing/expired session, 403 authorization/origin/restriction, 404 inaccessible/missing record, 409 state/version/duplicate conflict, 429 limits, and 503 disabled service/configuration. Unexpected server errors are reduced to a generic service-unavailable message. A route may return 404 for another user's record to avoid exposing it.

All non-GET/HEAD/OPTIONS requests require the exact configured Origin, including unauthenticated signup/token flows and scripted clients. Browser requests need credentials for cookie sessions. Private/authenticated routes use no-store. JSON bodies are limited to 32 KB; image multipart routes impose separate limits. All IDs below are ObjectId strings; query values are strings unless specified otherwise. Account signup/login construct allowed account fields; this is not a generic model write API.

Standard pagination: `page` 1–100000, `limit` 1–50 (default 10). Results return named arrays, `count,page,limit`. Saved searches instead return a bounded set (`limit:25`), no pagination. Collection/index sorting includes deterministic ID tie-breakers. Public metadata and current match counts do not provide a frozen snapshot across pages.

| `version` payload source | Used for |
| --- | --- |
| Listing `__v` | Listing details/status/delete/images/admin visibility |
| Report `__v` | Report decision |
| User `avatarVersion` | Avatar replacement/removal |
| User `moderationVersion` | Suspension/restoration/appeal decisions |
| Order `revision` | Order/dispute/review actions |
| Saved search `revision` | Rename/alert settings/delete |

JSON versions are nonnegative integers; multipart versions use decimal strings. Refresh after 409; do not generate your own next version.

## Accounts, profiles and email

| Method | Route | Access / request / result |
| --- | --- | --- |
| POST | `/user/signup` | `{email,username,password,locale?}`; 201 session user + cookie; attempts verification mail when configured |
| POST | `/user/login` | `{email,password}`; 200 session user + new cookie; bad credentials 401 |
| GET | `/user/me` | Session; current session-user serialization |
| POST | `/user/logout` | Session; revoke current session, clear cookie, 204 |
| PATCH | `/user/profile` | Active session; `{username,bio}`; updated session user |
| PUT | `/user/avatar` | Active session; multipart `version`, one `avatar` file; updated user |
| DELETE | `/user/avatar` | Active session; `{version}`; updated user |
| POST | `/user/verification/request` | Session; `{locale?}`; 202; already-verified case also 202 |
| POST | `/user/verification/confirm` | `{token}`; consumes unexpired verification token; 200 message |
| POST | `/user/recovery/request` | `{email,locale?}`; generic 202 when mail configured (also unknown accounts); unconfigured mail 503 |
| POST | `/user/recovery/confirm` | `{token,password}`; single-use reset/authVersion invalidation; clears cookie; 200 message |

Session-user response includes `_id,email,account,emailVerified,avatarVersion,isAdmin,suspended,moderationVersion` and the reason when suspended. It is returned on **private/account flows**, not as a public seller profile. Hash, raw session/token records, saved searches, appeals/audits are excluded. Usernames trim to 1–80 characters, bios at most 1000, passwords minimum 8 characters/maximum 72 UTF-8 bytes, normalized email at most 254. `locale` accepts en/si/ta for mail. Verification/recovery links are 30-minute, digest-backed and single-use; confirmation does not log in a new user automatically.

Signup/login share a process-local 30 attempts/15-minute limiter. Token request/confirm paths have their own 10/15-minute IP limits. Live SMTP behavior and timing equivalence are not guaranteed by generic recovery responses. See [accounts](../configuration/accounts.md).

## Public catalogue, discovery and seller pages

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/catalogue` | Categories, sample geography and localized typed attribute definitions |
| GET | `/policy` | Configured version, localized notices and bounded literal rules; bundled content is placeholder |
| GET | `/offers` | Active/unhidden listings from active sellers; `{offers,count,page,limit}` |
| GET | `/offer/:id` | Visible non-removed detail with public owner profile; reserved/sold may be read directly |
| GET | `/seller/:id` | Active seller's public profile and active listing page; no email/session/private state |
| GET | `/seller/:id/reviews` | Current eligible test reviews, separate test/live summary, count/page/limit |

Filters are `q`, `title`, `category`, `district`, `town`, `condition`, `size`, `priceMin`, `priceMax`, `attributeFilters`, `sort`, `page`, `limit`. Keyword `q` is bounded to 120 characters before/after normalization and uses the title/description text index; nonempty `q` and `title` together are invalid. `title` is escaped case-insensitive substring matching (max 120). Empty keyword search has no text filter. Sorts are newest, price-asc, price-desc, relevance; relevance requires a keyword query and is its default if sort is absent.

Prices are whole-LKR integer bounds 0–1,000,000,000 for search; minimum must not exceed maximum. Category/location must be catalogue-valid; town needs a district. Conditions match the listing enum. Size is XS/S/M/L/XL/XXL; an explicit non-clothing category plus size is invalid. `attributeFilters` is a JSON string (max 4000 characters/up to eight fields) tied to category metadata: escaped text, exact enums and bounded numeric scalar or `{min,max}` ranges. No arbitrary query operators are accepted. See [search](../configuration/search.md) for syntax/index/alert behavior.

Public listing output includes asking price/currency, category/condition/size/location/attributes, image metadata, owner username/avatar, status/visibility-related fields and timestamps/version. Private order/reservation/audit data is omitted; text scores are not returned. Public review fields are rating/text/time, reviewer display name and `test:true`; no buyer/order ID, amount or moderation history. Only test-order reviews are currently eligible; live reputation remains empty.

## Seller inventory and media

| Method | Route | Contract |
| --- | --- | --- |
| POST | `/offer/publish` | Active session; multipart listing fields + `picture1`/`picture2`/`picture3`; 201 listing |
| GET | `/user/offers` | Active owner; current non-removed inventory incl. hidden; usual filters + status active/reserved/sold |
| GET | `/user/offers/:id` | Active owner; non-removed private listing view |
| PATCH | `/offer/:id` | Active owner; complete editable details and `{version}`; updated listing |
| PATCH | `/offer/:id/status` | Active owner; `{status,version}`; active→reserved/sold or reserved→active/sold |
| DELETE | `/offer/:id` | Active owner; `{version}`; soft remove, 204 |
| PUT | `/offer/:id/images` | Active owner; multipart `version`, repeated `images` files (1–3); whole-set replacement |

Listing fields: title 3–120, description 10–4000, integer asking price 1–1,000,000,000, condition New with Tags / Like New / Fairly Used / Used / Worn, optional clothing size, category (default other), district/town and typed attributes. Publishing accepts attributes as JSON string; editing accepts object values. It does not accept owner/currency/charge authority from the browser.

Images: JPEG/PNG/WebP input, at most 5 MB each, one to three listing files; full decode/20-million-pixel/10,000-px-axis/single-page limits. Output is metadata-free WebP, rotated/resized up to 1920 px for listings and 512 for avatars without enlargement. Processing saturation returns 429. Use returned URLs; local URLs are API-relative. Sold/hidden items cannot be edited/replaced/reactivated. Removal is possible when unlocked. Any active buyer order lock prevents owner mutation, including removal. No hard-delete/restore endpoint exists.

## Favourites, enquiries, blocks and reports

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/user/favourites` | Active owner; saved visible item page (reserved/sold may remain) |
| GET | `/user/favourites/:id` | Active owner; `{saved:boolean}` |
| PUT / DELETE | `/user/favourites/:id` | Active owner; idempotent save/remove, 204; PUT requires currently visible non-removed item/seller |
| POST | `/offer/:id/enquiries` | Active non-owner; `{message}` on active item; create/reuse buyer/listing thread, append message, 201 |
| GET | `/user/enquiries` | Active participant's inbox page |
| GET | `/enquiry/:id/messages` | Active participant; enquiry + chronological messages and paging |
| POST | `/enquiry/:id/messages` | Active participant; `{message}`; append, 201 |
| GET | `/user/blocks` | Active account's paged directed blocks |
| GET | `/user/blocks/:id` | Own `{blocked:boolean}` |
| PUT / DELETE | `/user/blocks/:id` | Idempotent block/unblock, 204; self-block rejected |
| POST | `/reports` | Active account; `{targetType,target,reason,details}`; 201 report ID/status (repeat reuses existing report) |
| GET | `/user/reports` | Own type/reason/status/timestamps page; no admin snapshot/resolution |

Messages trim to 1–2000 characters and are subject to blocking both ways and active recipients. Threads/history survive listing removal/sale; sends are not idempotent. The community enquiry/reply limiter is process-local 60 messages/hour/IP. Order contact uses its own participant route and the shared message service (do not assume every message route has identical rate middleware).

Report target types are listing/user/message; reasons scam/prohibited-item/harassment/spam/other; details up to 2000. Message reports require received participant content; self-reports are rejected. Report writes limit 30/hour/IP. Reports and blocks do not automatically change listing/order/account state or erase old conversations.

## Saved searches and notifications

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/user/saved-searches` | Active owner; `{searches,count,limit:25}` |
| POST | `/user/saved-searches` | `{name,query,alertsEnabled?}`; boolean alerts default false; 201 record |
| PATCH | `/user/saved-searches/:id` | `{version,name?,alertsEnabled?}`; at least one change; updated record |
| DELETE | `/user/saved-searches/:id` | `{version}`; remove own preset, 204 |
| GET | `/user/notifications` | Own `{notifications,count,unreadCount,page,limit}` |
| PATCH | `/user/notifications/:id/read` | Own ID only, 204 |
| POST | `/user/notifications/read-all` | Mark existing own notifications read, 204 |

Names trim to 1–80 characters. Saved query values are strings from the discovery allowlist **excluding page/limit**; default sort, price and attribute JSON canonicalization support duplicate detection. Duplicate filters/capacity/stale versions conflict. Preset output has `_id,name,query,alertsEnabled,revision,createdAt,updatedAt`; internal fingerprint/start/cursor are omitted. Setting alerts true starts a server-time window; no historical pre-enable backfill. Search notifications are in-app only.

Notification output has `_id,type,link,readAt?,createdAt`; types message/moderation/report/verification/account/order/search. Server-created links lead to private context or a matched listing; no token/message body is embedded. Ordinary event delivery is best-effort; saved-search delivery uses strict persistence and retry cursors. See [search](../configuration/search.md).

## Orders, disputes, reviews and analytics

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/orders/config` | Public disabled/test mode, LKR, hold/fee/collection settings |
| GET | `/offer/:id/quote` | Active non-owner; server-priced current quote and listing version; does not place a hold |
| POST | `/orders` | Verified active buyer; `{listingId,listingVersion,expectedTotalMinor,idempotencyKey}`; 201 new/200 identical replay |
| GET | `/user/orders` | Participant order page |
| GET | `/orders/:id` | Participant order snapshot/current revision/dispute/review |
| POST | `/orders/:id/cancel` | Either participant; `{version}`; only awaiting_payment |
| POST | `/orders/:id/test-success` | Buyer; `{version}`; pending unexpired hold, test adapter only |
| POST | `/orders/:id/test-failure` | Buyer; `{version}`; failed simulation releases pending hold |
| POST | `/orders/:id/ready` | Seller; `{version}`; confirmed→ready |
| POST | `/orders/:id/complete` | Buyer; `{version}`; ready→completed |
| POST | `/orders/:id/enquiry` | Active participant; `{message}`; shared buyer/listing thread, 201 `{_id}` |
| POST | `/orders/:id/dispute` | Buyer; `{version,reason}`; one case on confirmed/ready/completed test order |
| POST | `/orders/:id/dispute-response` | Seller; `{version,response}`; one response on open case |
| POST | `/orders/:id/test-refund` | Seller; `{version,resolution}`; full original total on open case; test adapter only |
| POST | `/orders/:id/review` | Active buyer; `{version,rating,text}`; one completed test-order review, 201 updated order |
| GET | `/user/analytics` | Active owner; listing/order counts, hidden count, simulated paid/refunded checkout totals |
| POST | `/payment` | Legacy authenticated route; 503, no order/charge |

Only non-production `PAYMENT_DRIVER=test` enables new orders, payment simulation, opening cases and refund simulation; otherwise 503. There is no real provider/webhook/payout/carrier endpoint. Quote creation/read does not itself place a hold. New orders are limited to 5 attempts/15 minutes per buyer; keys are 16–80 alphanumeric/underscore/hyphen characters. Fees/amounts derive from server snapshot; expected total only detects quote drift. Money is integer LKR minor units, delivery zero.

Order states are awaiting_payment/confirmed/ready/completed/payment_failed/cancelled/expired/disputed/refunded. Dispute texts trim to 1–2000; declined cases restore previous stage, refunded cases preserve sold/removed inventory and never auto-relist. Reviews require integer 1–5 and text 1–2000; public eligibility depends on current completed test status/visibility/accounts. Analytics is not earnings/payouts. See [order rules](../workflows/orders.md) and the [marketplace state diagrams](https://github.com/BlueZoft/Past_Perfect_Web/blob/master/docs/workflows/marketplace.md).

## Administrative endpoints

All require an active authenticated allowlisted admin. The `:id` for review/dispute actions is the **order ID**, not a separately stored review/case collection ID.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/admin/reports` | Report queue; status open/resolved/dismissed, paginated |
| PATCH | `/admin/reports/:id` | `{status,resolution,version}`; open→resolved/dismissed; resolution up to 2000 |
| GET | `/admin/offers/:id` | Listing with private moderation audit |
| PATCH | `/admin/offers/:id/moderation` | `{hidden,reason,version}`; reason 1–1000, updated listing; clears policy-review flag |
| GET | `/admin/users/:id` | Known user state/version/account audit |
| PATCH | `/admin/users/:id/moderation` | `{suspended,reason,version}`; reason 1–1000; invalidates sessions |
| GET | `/admin/appeals` | Queue by open/accepted/rejected status |
| PATCH | `/admin/appeals/:id` | `{decision,resolution,version}`; accepted/rejected, holder-visible text 1–1000; 204 |
| GET | `/admin/policy-listings` | Non-removed listings pending policy review |
| GET | `/admin/order-disputes` | Queue by open/refunded/declined status |
| GET | `/admin/order-disputes/:id` | Case/order snapshot without requestKey |
| POST | `/admin/order-disputes/:id/resolve` | `{version,decision,resolution}`; refund/decline, text 1–2000; updated order without requestKey |
| GET | `/admin/reviews` | Paged review/order snapshots with review audit |
| PATCH | `/admin/reviews/:id` | `{version,hidden,reason}`; text 1–1000; `{_id,revision,review}` |

Report decisions, visibility, suspension, disputes and review hiding are independent. Current allowlisted admins/self cannot be suspended through account moderation; own-order admin dispute/review actions are forbidden. Decisions are versioned; listing/account audit keeps last 100 entries, review audit last 10. No indefinite archive or admin MFA exists.

## Appeals, restricted accounts and health

`GET /user/appeals` returns own paged appeals; `POST /user/appeals` accepts `{text,version}` (text 10–2000, current moderationVersion) and returns 201 new/200 existing. One appeal per suspension version, at most 100. Acceptance/restoration closes current open appeals atomically; rejection does not lift suspension.

Suspended sessions may GET `/user/me`, `/user/appeals`, `/user/notifications`, `/user/orders`, `/orders/:id`; POST `/user/logout`, `/user/appeals`, `/user/notifications/read-all`, `/user/verification/request` and order cancel/dispute/dispute-response/test-refund; PATCH own notification read. All normal action/state/test-mode checks still apply. They cannot publish/message/create/pay/fulfil/review orders or use saved searches/analytics/admin APIs. Public unauthenticated resources remain public.

`GET /health/live` returns 200 `{status:"ok"}` while HTTP responds. `GET /health/ready` returns 200 `{status:"ready"}` only when Mongoose reports connected, otherwise 503 `{status:"not_ready"}`, with no-store. It does not ping/check SMTP/media/indexes/worker capacity. `GET /` returns the API welcome message.
