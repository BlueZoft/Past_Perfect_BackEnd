# Search and private saved searches — v3.0

## Discovery behavior

The browse page defaults to **Titles and descriptions** keyword search. It sends `q`, capped at 120 characters before and after NFKC normalization, with surrounding whitespace removed. MongoDB's `listing_keywords` text index covers title (weight 4) and description (weight 1), with `default_language: none`. This avoids imposing English stemming/stop words on Sinhala/Tamil text. It does not transliterate, translate, correct spelling or provide fuzzy/prefix matching. Unicode keyword matching is covered locally for English, Sinhala and Tamil; broader linguistic quality still needs native-speaker review.

The standard MongoDB text search syntax applies: unquoted terms match any term; double quotes request a phrase and a leading hyphen can exclude a term. For example `reading lamp`, `"reading lamp"` and `lamp -broken` have different meanings. This is word search, not substring search or regular expression execution. Keyword results default to `relevance`; title weight affects text score and ties use ascending `_id`. Callers can request newest/price ordering instead. Scores are internal and absent from public JSON.

**Title contains** uses the existing `title` query: case-insensitive literal substring matching, bounded at 120 characters, with regex metacharacters escaped. Existing URLs retain this behavior. Use title matching for partial strings. Do not supply both a nonempty `q` and nonempty `title`. Relevance sort requires a nonempty keyword query. Empty search shows the normal newest feed.

Both modes combine with category/district/town, whole-LKR price ranges, condition and clothing size. Conditions are the listing schema's canonical values; sizes are XS/S/M/L/XL/XXL. Size can be used across categories or with clothing; another explicit category plus size is rejected. The UI clears size when moving to another category. Pagination remains bounded at 50 results/page and stable for equal sort values. These are current-result pages, not a frozen snapshot; concurrent publishing/moderation can change later pages.

Public discovery joins eligible non-suspended sellers and excludes hidden/removed/reserved/sold listings **before** count and pagination. Public seller search uses the same path. Saved searches cannot override owner/status/moderation constraints or expose orders/reservations. The same query parsing also applies to an owner's private inventory, whose existing status/hidden visibility rules remain separate.

Examples:

```text
GET /offers?q=lamp&condition=Used&priceMax=5000
GET /offers?q=shirt&category=clothing&size=M&sort=price-asc
GET /offers?title=boo&category=books&sort=newest
```

## Index setup and operations

`models/Offer.js` declares the named MongoDB text index `listing_keywords`. The normal Mongoose auto-index workflow builds it; keyword-query paths await `Offer.init()` so an initial request does not race index construction. Build/validate the index before production traffic using the deployment's controlled database change process and service credentials. If a deployment disables auto-index creation, the operator must explicitly create this index with the declared weights and `default_language: none`. MongoDB allows only one text index per collection; inspect and plan replacement if an operator has already installed a different one. No drop/rebuild command or data reset is run by this release.

Index builds use database resources. Back up and schedule production changes appropriately; test with representative data and explain plans. Tests assert the named index appears in the keyword query plan. No external paid search provider, Atlas Search setup or new secret is required. Literal `title` search remains an unanchored escaped regex and is not claimed to be index-backed. Faceted counts, owner visibility lookups, sorting large matching sets and deep skip pagination can still be expensive. There is no production throughput guarantee; tune/measure before launch. A future search adapter may provide typo tolerance, typed attributes and reviewed language analysis without changing saved-search ownership rules.

## Private saved searches

Signed-in active accounts can name and save the currently successful browse filters, open them from **Saved searches**, rename or delete them. Names trim to 1–80 characters and must contain non-whitespace text. There are at most **25 searches per account**, including under concurrent requests. These are starter technical limits, not researched commercial policy. They are defined in `services/savedSearches.js`; change the atomic array bound, response limit, UI text and tests together if a reviewed policy changes them.

Records are embedded in `User.savedSearches`, excluded from ordinary user queries and public/session/profile serialization. The API returns only the session owner's records; the browser never supplies an owner. A search holds its name, canonical query, created/updated times and revision. An internal SHA-256 filter fingerprint detects duplicates; it is not returned. Storing different labels for the same canonical query is rejected with 409. Default sort is made explicit; price strings are canonicalized. Keyword normalization matches discovery, while literal title spaces are preserved. Case/term-order aliases are not globally deduplicated. No result IDs or historical listing snapshots are stored.

Supported saved query keys: `q`, `title`, `category`, `district`, `town`, `condition`, `size`, `priceMin`, `priceMax`, `sort`. Pagination and page size are omitted. Unknown keys, nested operator objects and non-string values are rejected. An empty filter set is allowed and saves the newest feed. Reopening constructs an internal browse URL from the allowlist and starts at page 1 with the normal default page size; supplied external redirect fields are never used. New catalogue configuration may invalidate an old filter. Such a search remains renameable/deletable; replace it by saving the reviewed current filters. Do not silently rewrite stored user preferences.

Every rename/delete supplies `version` equal to that record's `revision`. Renames increment the revision; stale writes return 409 and foreign/missing IDs return 404. Refresh before retrying. The UI disables save until a valid listing response is loaded. A network failure can hide a successful save response; retrying may return “already saved.” Open Saved searches to recover that record. Deletion removes this saved preference; it does not remove any listing or favourite. Editing filters means running the search, changing the browse controls and saving a new preset; rename changes only its name.

Saved searches can now opt into in-app alerts using the v3.0 workflow below. Reopening a preset always queries current visible inventory; it does not reserve an item. Actual production catalogue/geography, hosting and service credentials remain the existing documented placeholders.

## v3.0 typed attribute filters

`attributeFilters` is a bounded JSON string tied to a selected catalogue category. Metadata controls allowed keys/types/bounds. Text filters use escaped literal substring matching (no fuzzy engine); enums require an exact configured value. Numeric fields accept a scalar or min/max range, with at least one valid bound and min no greater than max. The browse UI generates text/enum controls or numeric range inputs from localized catalogue metadata. Changing category clears stale attribute filters. Search URLs and saved presets include the same filters; key/range ordering is normalized for duplicate detection. These filters are correct database constraints, not a claim that arbitrary attribute queries have dedicated indexes. Profile representative production queries before adding index/provider changes.

## v3.0 opt-in in-app matching alerts

v3.0 adds this opt-in workflow to v2.9 saved presets. New saved searches default to **alerts off**. Opt in during save or toggle a saved search later. Enabling sets a server-time start and cursor; re-enabling starts a fresh window. Listings older than that enable time are not backfilled. No email, SMS, Web Push, external recipient or message to another user is sent.

The API runs a non-overlapping alert sweep at startup and every minute. `npm run search:alerts` runs one batch manually. A durable `JobState` checkpoint rotates through at most 10 eligible accounts per run; each has at most 25 saved searches. Each search scans at most 10 matching visible listings per run in createdAt/_id order. Incomplete ranges continue from the last item. Completed passes wrap to the enable-time floor to catch late inserts and visibility changes within the eligibility window. This deliberately favors retry/recovery over a hard realtime SLA; long histories/backlogs increase delivery latency. The process reads only active, non-hidden inventory with active sellers, excludes the recipient's own listings and rechecks visibility immediately before notification persistence. Catalogue-invalid preferences are retained but skipped until corrected/replaced.

`SEARCH_ALERT_DELAY_SECONDS` defaults to **60**, allowed 0–3600. This is a technical settling delay, not a real-world/commercial promise. Notifications have a unique `(user,event)` key containing saved-search ID and listing ID. Strict notification writes happen before cursor advancement. Database failure leaves progress retryable; rescans/concurrent workers deduplicate without resetting read state. Cursor updates compare the search revision and prior cursor, so a toggle/delete/rename cannot be overwritten by an old batch. Duplicate concurrent job checkpoints may cause extra rescans, not duplicate visible notifications. Retain notification event markers if future retention jobs are added; deleting them can allow repeat alerts on a later pass.

Pause/disable affects subsequent work; a notification already in flight can still finish and is retained. A listing may sell or be hidden after delivery, so opening its link can show unavailable/404. Alerts are discovery hints, not reservations. Recipient suspension skips further delivery. Existing account restrictions and private notification reads remain enforced. Scan start/cursor/fingerprint are excluded from responses. There is no always-on scheduler guarantee while the API is stopped; the manual command resumes bounded work. No cron, hosted job, production credentials or live deployment is installed. Monitor generic retry logs and capacity before enabling alerts at production scale.
