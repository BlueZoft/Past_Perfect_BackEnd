# Historical API evolution (v2–v3)

Archived version-by-version contracts. Early sections contain superseded shapes and limitations; use the maintained [current API reference](../reference/api.md) and topic guides for implementation today. Preserved to explain earlier changes, not as current user guidance.

## Original API v2 contract

JSON errors have `{ "error": "message" }` and appropriate 4xx/5xx status codes. Mutation requests require `Origin: <WEB_ORIGIN>`; cookie-authenticated browser requests must include credentials. Signup/login use JSON. Avatar upload is no longer part of signup.

| Method | Route | Request / result |
| --- | --- | --- |
| POST | `/user/signup` | `{email, username, password}` → 201 public user + session cookie |
| POST | `/user/login` | `{email, password}` → 200 public user + new session cookie; 401 on mismatch |
| GET | `/user/me` | Session required → public user, otherwise 401 |
| POST | `/user/logout` | Session required → 204, revoke session and clear cookie |
| GET | `/offers` | Filtered active listings and pagination metadata |
| GET | `/offer/:id` | Listing with public seller; 400 invalid ID, 404 absent/removed |
| POST | `/offer/publish` | Session + multipart fields and files → 201 listing |
| POST | `/payment` | Session required → 503; no charge or order is created |

Public user: `{_id, email, account: {username, avatar?}}`. No token/hash is returned. Passwords must be at least 8 characters and at most 72 UTF-8 bytes, reflecting bcrypt limits. Emails are normalized to lowercase; usernames are 1–80 characters.

Listing:

```json
{
  "_id": "<mongodb-object-id>",
  "title": "Used book",
  "description": "A book in good condition",
  "price": 1000,
  "currency": "LKR",
  "size": "",
  "condition": "Used",
  "images": [{"url": "/uploads/<generated-name>.png", "publicId": "<generated-name>.png"}],
  "status": "active",
  "owner": {"_id": "<seller-id>", "account": {"username": "Example seller"}},
  "createdAt": "<ISO timestamp>",
  "updatedAt": "<ISO timestamp>"
}
```

All sample identifiers/content are illustrative placeholders. Cloudinary image URLs are absolute HTTPS URLs; local image URLs are relative to the API origin. Missing/deleted sellers may populate as null.

Publish fields: `title` (3–120 characters), `description` (10–4000), `price` (integer LKR, 1–1,000,000,000), `condition`, optional `size`, and 1–3 files under `picture1`, `picture2`, `picture3`. Unicode content is accepted. Conditions: `New with Tags`, `Like New`, `Fairly Used`, `Used`, `Worn`. Sizes: empty, XS, S, M, L, XL, XXL. The upper price bound is a configurable business-policy follow-up, not a researched market limit.

Discovery query: `title` (literal case-insensitive search, maximum 120 characters), `priceMin`/`priceMax` (nonnegative integers), `sort` (`newest`, `price-asc`, `price-desc`), `page` (1–100000), `limit` (1–50, default 10). Response: `{count, page, limit, offers}`. Sorts include an ID tie-breaker. These filters are bounded but title search is not yet an indexed full-text service.


## Seller management (v2.1)

All routes require a session; mutations require the configured Origin. Listings include Mongoose's integer `__v`. Send that value as `version` for PATCH/DELETE; do not increment it client-side.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/user/offers` | `{count,page,limit,offers}` for the current owner, excluding removed records. Supports existing title/price/sort/page/limit plus optional `status=active`, `reserved` or `sold`. |
| PATCH | `/offer/:id` | JSON `{title,description,price,condition,size?,version}`; complete editable details required, photos retained. Returns updated listing. Only active/reserved listings. |
| PATCH | `/offer/:id/status` | JSON `{status,version}`; active → reserved/sold, reserved → active/sold. Returns updated listing. |
| DELETE | `/offer/:id` | JSON `{version}`; soft removal from any current state, returns 204. |

Missing/invalid versions and unexpected fields return 400. Invalid transitions and stale updates return 409; reload the listing before retrying. Nonexistent, removed and other owners' listings return 404 for mutations. Anonymous requests return 401. Owner pagination defaults to 10 records and caps at 50. Removed assets are retained pending an explicit retention/purge policy; this is not permanent data erasure.


## Community API (v2.2)

Listing requests/responses additionally support `category` (default `other`), `district` and `town` (default empty). Discovery and owner-list queries accept the same filters. Values must come from GET `/catalogue`; town requires its configured district. `size` is valid only for `category=clothing`. Multipart publishing supports these three additional fields.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/catalogue` | Public `{categories,locations}`; see CATALOGUE.md for placeholder policy |
| GET | `/seller/:id` | Public `{seller,offers,count,page,limit}` with active listings and safe seller fields; supports normal listing filters |
| PATCH | `/user/profile` | Session + Origin; `{username,bio}` only; updates current user and returns public account response (including their own email) |
| GET | `/user/favourites` | Private `{offers,count,page,limit}`, excluding removed/deleted listings; supports page/limit |
| GET | `/user/favourites/:id` | Private `{saved:boolean}` |
| PUT | `/user/favourites/:id` | Save visible listing idempotently, 204; no body required |
| DELETE | `/user/favourites/:id` | Remove own saved entry idempotently, 204; no body required |
| POST | `/offer/:id/enquiries` | `{message}` → 201 `{_id:threadId}`; seller derived from active listing, buyer from session |
| GET | `/user/enquiries` | Private `{enquiries,count,page,limit}` inbox sorted by latest message; page/limit |
| GET | `/enquiry/:id/messages` | Participant-only `{enquiry,messages,count,page,limit}`, oldest-first, page/limit |
| POST | `/enquiry/:id/messages` | Participant-only `{message}` → 201 message |

All community mutations require exact Origin matching. Unknown profile/message fields are rejected. Public seller fields are `_id`, username/avatar/bio and joined timestamp; email/hash are excluded. Username is 1–80 characters, bio 0–1000. Messages are trimmed, 1–2000 characters; write limit is 60 requests/hour per IP using a process-local store. Threads expose buyer/seller IDs and usernames only. Another account receives 404 for thread reads/replies. Anonymous private requests receive 401. New enquiries require active listings and cannot target your own listing. Existing participants can continue after removal/sale; the retained title is a historical snapshot.

Favourites remain private: response counts include only visible saved records, never another user's data. PUT/DELETE do not infer ownership from request bodies. Unique indexes enforce one favourite per user/listing and one enquiry thread per buyer/listing. Message sends are not idempotent; clients should refresh before retrying after an ambiguous network failure. Avatar editing, realtime delivery, blocking/reporting and moderation are follow-ups.


## Media and trust API (v2.3)

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/user/offers/:id` | Owner-only current listing, including moderation-hidden listings; 404 for other owners/removed records |
| PUT | `/offer/:id/images` | Owner session + multipart `version` and repeated `images` files (1–3); whole-set replacement, returns listing with new `__v` |
| PUT | `/user/avatar` | Session + multipart `version` and one `avatar` file; returns private user response with new `avatarVersion` |
| DELETE | `/user/avatar` | Session + JSON `{version}`; removes avatar and increments version |
| GET | `/user/blocks` | Own paginated `{blocks,count,page,limit}` with blocked users' public names |
| GET | `/user/blocks/:id` | Own `{blocked:boolean}` state only |
| PUT / DELETE | `/user/blocks/:id` | Idempotent block/unblock, 204; self-blocking rejected |
| POST | `/reports` | JSON `{targetType,target,reason,details}` → 201 `{_id,status}` |
| GET | `/admin/reports` | Admin-only paginated queue, `status=open|resolved|dismissed` |
| PATCH | `/admin/reports/:id` | Admin-only `{status,resolution,version}`; open → resolved/dismissed, returns report |
| GET | `/admin/offers/:id` | Admin-only listing with moderation audit |
| PATCH | `/admin/offers/:id/moderation` | Admin-only `{hidden:boolean,reason,version}`; returns updated listing/audit |

All mutations require exact Origin matching. Media is JPEG/PNG/WebP, signature-checked, at most 5 MB/file. Multipart versions are decimal strings; JSON versions are integers. Concurrent/stale changes return 409. Sold/hidden listings cannot be edited/replaced/reactivated by owners, but can be removed. Removal records `removedAt` for explicit retention processing. Private user responses include `avatarVersion` and server-computed `isAdmin`; neither grants client-controlled privileges.

Reports: targetType is `listing`, `user` or `message`; target is an ObjectId string. Reasons: `scam`, `prohibited-item`, `harassment`, `spam`, `other`. Details are a string up to 2000 characters. Self-reports are rejected; message reports require conversation participation and another sender. A target snapshot is kept for admins. Report writes are limited to 30/hour/IP. Repeat reporter/target submissions return the original report. Admin resolution notes are required (up to 2000 characters); visibility reasons are required (up to 1000). Resolving/dismissing reports and hiding/restoring listings are independent operations.

Blocking causes both new enquiries and replies between the accounts to return 403; old history remains readable by its participants. Block data is private. Admin APIs return 403 for ordinary users and 401 without a session. Visibility audit data is excluded from public details and favourite aggregates. Hidden listings return public 404 and are excluded from public counts, favourites and seller discovery. Existing private enquiry history remains accessible.


## Accounts and notifications (v2.4)

| Method | Route | Contract |
| --- | --- | --- |
| POST | `/user/verification/request` | Session; `{locale?: "en"|"si"|"ta"}` → 202; resends verification email |
| POST | `/user/verification/confirm` | `{token}` → 200; consumes unexpired verification token once |
| POST | `/user/recovery/request` | `{email,locale?}` → generic 202 if email driver configured, including unknown emails |
| POST | `/user/recovery/confirm` | `{token,password}` → 200; atomic password replacement and session invalidation |
| GET | `/user/notifications` | Private `{notifications,count,unreadCount,page,limit}` |
| PATCH | `/user/notifications/:id/read` | Owner-only, 204; another account's ID returns 404 |
| POST | `/user/notifications/read-all` | Marks current recipient's existing notifications read, 204 |
| GET | `/user/reports` | Own paginated `{reports,count,page,limit}`, with type/reason/status and timestamps only |

Signup accepts optional `locale` for verification mail. Private user responses now include boolean `emailVerified`. Public seller profiles expose the same boolean, not token records. Notifications contain `_id`, `type`, `link`, `readAt?`, `createdAt`; types are message/moderation/report/verification and links are generated by the server. No user ID, message text, token or moderator resolution note appears in a notification response. Page defaults/caps match other paginated APIs.

Token request/confirm routes enforce the same exact Origin policy as other mutations and have separate 10-per-15-minute IP limits. Invalid/expired/consumed tokens return 400. Unknown/malformed extra fields are rejected. An unconfigured mail driver returns 503; recovery for a nonexistent account otherwise has the same status/body as an existing account. A new request replaces the previous token of that purpose. Confirmation does not automatically log in the user. Reset clears the browser session cookie and uses a per-user auth version to reject pre-reset sessions. See ACCOUNTS.md for security/configuration and timing/delivery limitations.


## Account moderation, appeals and policy (v2.5)

Private user responses include `suspended`, `suspensionReason` (only when suspended) and `moderationVersion`. Account decisions increment `authVersion`; prior cookies fail with 401. A new suspended-account session permits only GET me/appeals/notifications, POST appeals/logout/verification-request/notification-read-all, and PATCH own notification-read. Other authenticated routes return 403. Login/recovery remain accessible but cannot clear suspension.

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/policy` | Public version, localized notice and bounded rules/terms |
| GET | `/admin/users/:id` | Admin-only username, suspension state/version and bounded decision audit |
| PATCH | `/admin/users/:id/moderation` | `{suspended,reason,version}`; versioned admin decision, holder-visible reason |
| GET | `/user/appeals` | Own paginated `{appeals,count,page,limit}`, including holder-visible resolutions |
| POST | `/user/appeals` | Suspended session; `{text,version}` (10–2000 characters), version is current moderationVersion; 201 new / 200 existing |
| GET | `/admin/appeals` | Admin queue `{appeals,count,page,limit}`, `status=open|accepted|rejected` |
| PATCH | `/admin/appeals/:id` | `{decision,resolution,version}`, accepted/rejected; public resolution required, 204 |
| GET | `/admin/policy-listings` | Paginated listings awaiting policy review |

Suspension/restoration notes and appeal resolutions are required, up to 1000 characters. Decisions use the suspension version, never a client-provided user role. Self/admin suspension is rejected. Appeal acceptance and restoration are one document update; concurrent/repeated/stale decisions return 409. Rejection leaves suspension intact. One appeal per suspension version is retained, bounded to 100 per account. Owner/other-account IDs cannot be overridden in requests. Public profiles never expose suspension reasons, appeals or account audit records.

Publishing/editing attaches policy version/rule IDs and flags review matches hidden. Existing listing moderation decisions clear the policy-review flag and may approve visibility. GET `/offers`, public details/seller pages and favourites exclude suspended sellers with counts calculated after eligibility filtering. Existing message history remains participant-private; active users cannot send to suspended recipients. Account notifications use type `account` and link to `/account-status`.


## Image output and category attributes (v2.6)

Listing create/edit accepts `attributes`: an object for JSON requests or a JSON-encoded object for multipart publishing. GET `/catalogue` provides allowed field definitions by category. Unknown/cross-category fields, invalid types/ranges and nested values return 400. Optional empty inputs are omitted; numeric values are persisted as numbers. Listing responses include a plain attributes object. No existing records are automatically rewritten.

Image inputs remain JPEG/PNG/WebP and at most 5 MB, but must now fully decode and fit the image dimension/page limits. Output is metadata-free, auto-rotated WebP. Image objects include `width`, `height`, `bytes` and `driver`; callers must use the returned URL rather than infer an input extension. Avatars use 512px bounds, listings 1920px, without enlargement. Malformed/animated/oversized content returns 400 and saturated processing returns 429. Image bodies are processed server-side; client headers and metadata do not override these limits.


## Collection orders and test checkout (v2.7)

| Method | Route | Contract |
| --- | --- | --- |
| GET | `/orders/config` | Public paymentMode (disabled/test), currency, holdMinutes, platformFeeMinor and collection fulfilment |
| GET | `/offer/:id/quote` | Authenticated non-owner quote: listingId/title/version, item/fee/delivery/total minor units and configuration |
| POST | `/orders` | Verified buyer; `{listingId,listingVersion,expectedTotalMinor,idempotencyKey}` → 201 new / 200 replay |
| GET | `/user/orders` | Participant-only `{orders,count,page,limit}` with normal pagination bounds |
| GET | `/orders/:id` | Participant-only order snapshot and current status/revision |
| POST | `/orders/:id/cancel` | Either participant, `{version}`, only awaiting_payment |
| POST | `/orders/:id/test-success` | Buyer-only, `{version}`, explicit non-production test mode |
| POST | `/orders/:id/test-failure` | Buyer-only, `{version}`, releases pending hold without confirmation |
| POST | `/orders/:id/ready` | Seller-only, `{version}`, confirmed → ready |
| POST | `/orders/:id/complete` | Buyer-only, `{version}`, ready → completed |
| POST | `/orders/:id/enquiry` | Participant-only `{message}`; existing blocking/suspension rules, 201 `{_id:enquiryId}` |

`version` on order actions is the order's `revision`, not listing `__v`. Unknown fields, including supplied card/amount data, are rejected. Server pricing uses current listing price and configuration; expectedTotalMinor is only an equality guard. Quotes can change; reload after 409. Request keys have a unique partial compound index across buyer/key pairs. Creation is limited to 5 attempts per buyer per 15 minutes, including failed/retried requests. Disabled/production simulator calls return 503 without charge.

Order states: awaiting_payment, confirmed, ready, completed, cancelled, expired, payment_failed, disputed, refunded. Immutable money fields are itemMinor/platformFeeMinor/deliveryMinor/totalMinor/currency; fulfilment is collection. Active order locks prevent owner mutations. Cancellation/expiry/failure releases inventory only while the matching pending reservation is active. Confirmed orders retain the lock until completion or simulated refund and are not subject to hold expiry.

Another account receives 404 on order reads/actions/contact. Suspended participants may GET their own orders, POST pending cancellation and access the dispute remedies below; other order mutations remain denied. Private order data is select-excluded and explicitly removed from public aggregates. Order-related notifications use type `order`. The legacy `/payment` endpoint remains 503. No externally callable real-provider webhook exists; see ORDERS.md before future live integration.

## v2.8 order disputes (development refunds only)

| Method | Path | Contract |
| --- | --- | --- |
| POST | `/orders/:id/dispute` | Buyer participant, `{version, reason}`; confirmed/ready/completed test-paid order → disputed |
| POST | `/orders/:id/dispute-response` | Seller participant, `{version, response}`; one response per open case |
| POST | `/orders/:id/test-refund` | Seller participant, `{version, resolution}`; open dispute → simulated full refund |
| GET | `/admin/order-disputes?status=open&page=1&limit=10` | Active allowlisted admin; status open/refunded/declined; paginated `{orders,count,page,limit}` |
| GET | `/admin/order-disputes/:id` | Active allowlisted admin; one case's order snapshot; requestKey omitted |
| POST | `/admin/order-disputes/:id/resolve` | Active allowlisted admin, `{version, decision, resolution}`; decision refund/decline; own orders forbidden |

All POST fields are allowlisted. `version` is the current order revision; text fields are trimmed and must contain 1–2000 characters. No caller-supplied amounts, references, actors, states or dates are accepted. Participant endpoints return 404 for another user's order. Unknown case IDs return 404; malformed IDs/inputs return 400; wrong roles return 403; stale/closed/ineligible transitions return 409. Simulation disabled or production returns 503 for new case creation/refunds. Every success returns the updated order; all private routes use no-store.

New order states: `disputed`, `refunded`. Order `dispute` contains status open/refunded/declined, previousStatus, reason/openedBy/openedAt, optional response/respondedAt, resolution/resolvedBy/resolvedAt, and refundMinor/refundReference only after simulated refund. Original amounts are unchanged. Admin queues omit requestKey; public listing responses continue to exclude the entire embedded ledger. Participant history/detail includes shared case information.

Disputed orders cannot progress collection. Decline restores previous state; full simulated refund releases a matching uncollected reservation lock but keeps the listing sold. Completed/removed inventory is preserved. Repeated final decisions conflict. Suspended users can access their own dispute endpoints as well as read/cancel; they still cannot send enquiries or resume commerce. Responses and admin decline do not require simulation to remain enabled. See [order guide](../workflows/orders.md) for the explicit placeholder policy, return limitations and future real-provider requirements.

## v2.9 keyword search and private saved searches

`GET /offers` and public seller listing queries accept `q` (1–120 nonempty normalized characters for keyword search), `condition` and `size`, in addition to existing filters. Whitespace/empty `q` behaves as no keyword filter; a nonempty title and q together return 400. `sort=relevance` requires q and is its default when sort is omitted. Other sort values keep their existing meanings. Standard MongoDB text phrase/negation syntax applies. `title` retains escaped literal substring semantics. Text scores are not returned. Conditions use schema enum values; size is XS/S/M/L/XL/XXL and cannot be paired with an explicit non-clothing category. Invalid inputs return 400.

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/user/saved-searches` | Active session; `{searches,count,limit:25}` (bounded collection, no pagination) |
| POST | `/user/saved-searches` | `{name,query}`; 201 saved record; query string values from the search allowlist only |
| PATCH | `/user/saved-searches/:id` | `{name,version}`; rename only; returns updated record |
| DELETE | `/user/saved-searches/:id` | `{version}`; removes owner's record; 204 |

Records contain `_id,name,query,revision,createdAt,updatedAt`. Internal fingerprints and other accounts' searches are not exposed. Unknown body/query fields are rejected on save. Names trim to 1–80 characters. Stored filters exclude page/limit; canonical defaults and numeric price representations deduplicate equivalent queries. Duplicate filters or limit/stale conflicts return 409; foreign/missing IDs return 404. Reads/mutations use no-store, cookie session authentication and existing exact-origin mutation checks. Suspended accounts receive 403. Reopening a saved search uses the regular public query endpoint and current visibility; it does not reserve inventory or send alerts. See [search guide](../configuration/search.md) for text syntax, index provisioning and limits.

## v3.0 local application completion

| Method | Path | Contract |
| --- | --- | --- |
| GET | `/health/live` | 200 `{status:"ok"}` while HTTP service responds; no secrets/configuration |
| GET | `/health/ready` | 200 `{status:"ready"}` when Mongoose is connected, otherwise 503 `{status:"not_ready"}`; no-store; connection state only |
| POST | `/orders/:id/review` | Active buyer participant, `{version,rating,text}`; rating integer 1–5, trimmed text 1–2000; completed test order, one immutable review; 201 updated order |
| GET | `/seller/:id/reviews?page=1&limit=10` | Public visible completed-order reviews plus separate test/live summary; current implementation accepts test-order reviews only |
| GET | `/admin/reviews?page=1&limit=10` | Active allowlisted admin; private paginated review/order snapshots and moderation history |
| PATCH | `/admin/reviews/:id` | Active allowlisted admin, `{version,hidden,reason}`; reason 1–1000; own buyer/seller orders forbidden; returns `_id,revision,review` |
| GET | `/user/analytics` | Active session owner's inventory/order counts, hidden count, simulated checkout/refund totals in integer LKR minor units; no-store |

Review versions are the order revision. A review write and concurrent collection/dispute/moderation transitions use the same atomic listing ledger/version. Wrong participant receives 404, wrong buyer/admin role 403, malformed inputs 400 and ineligible/repeated/stale actions 409. Review creation returns 201, moderation 200. Public review projection excludes order IDs, buyer IDs/email, amounts, internal state and moderation audit; usernames and user-written text are intentionally public. Hidden reviews, suspended reviewers/sellers and orders no longer completed are excluded from counts/averages/results. Returned reviews carry `test:true`; summaries separate test/live (`live` remains zero). A simulated review must not be treated as real customer reputation. No live-payment review adapter is enabled.

Search queries now accept `attributeFilters` as a JSON string with at most eight metadata-defined fields and a valid `category`. Text is bounded case-insensitive literal substring matching; enum values match exactly; numbers accept a bounded scalar or `{min,max}` range (either bound optional). Unknown keys/operators, non-finite/out-of-schema values, reversed/empty ranges and absent categories return 400. Example: `category=furniture&attributeFilters={"widthCm":{"min":50,"max":100}}` (URL-encode JSON). Keyword/condition/size/location filters continue to combine normally. The saved-search allowlist also accepts this string and canonicalizes JSON key/range ordering.

`POST /user/saved-searches` adds optional boolean `alertsEnabled` (default false). `PATCH /user/saved-searches/:id` now accepts `name` and/or `alertsEnabled` with `version`; at least one change field is required. Setting alerts true starts a new server-time eligibility window; disabling leaves previously delivered notifications intact. Returned records expose the boolean, never scan cursors/start times/fingerprints. Alerts use notification type `search` with a server-generated `/offer/:id` link. These are in-app notifications only. See [local release guide](../operations/local-release.md) and [search guide](../configuration/search.md).
