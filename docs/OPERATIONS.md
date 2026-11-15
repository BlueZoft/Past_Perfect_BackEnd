# Operations and placeholder configuration

## Administrator access

Set `ADMIN_USER_IDS` to a comma-separated list of existing User ObjectIds, then restart the API. The example `REPLACE_WITH_ADMIN_USER_IDS` grants nobody access. Obtain IDs through your authorized database/admin workflow; do not add admin flags to signup/profile payloads. Existing sessions derive authorization server-side on every request. Refresh the frontend after changing access so its `isAdmin` navigation flag is refreshed. API enforcement never trusts that browser flag.

The `/admin/moderation` UI shows report queues. Load the current listing before a hide/restore decision. Visibility changes require the current listing version and a reason; report resolution/dismissal separately requires the report version and a note. Reload on 409 conflicts. The last 100 visibility decisions are embedded on each listing and hidden from public APIs. A durable, indefinite compliance audit archive and administrator MFA are follow-up work.

Do not auto-assign the first signup as administrator. Account suspensions/appeals and configurable policy triage are now implemented in v2.5; message deletion and advanced policy automation remain future work. Reasons in the UI are generic product placeholders; configure an actual operating policy and support process before launch. No real support address or response-time promise is assumed.

## Media cleanup and retention

Local development storage needs no keys. Production Cloudinary settings remain documented placeholders in `.env.example`; enter real values securely when ready. No provider verification is bypassed.

```sh
# Preview only; makes no changes to listing media or provider storage:
npm run media:maintenance
# Explicitly apply a reviewed retention decision and retry queued asset deletions:
npm run media:maintenance -- --apply
```

Run from the API repository with the correct `MONGODB_URI`, image driver, upload directory and provider credentials. `MEDIA_RETENTION_DAYS` defaults to 30, a starter placeholder policy. Set a reviewed positive integer before applying. Each run considers at most 100 removed listings with images, an explicit `removedAt`, and elapsed retention. Legacy removed records without a timestamp are not silently purged. Applying clears their image references and increments listing versions; records, enquiries and reports remain. Other deletion/erasure requests need a separate process.

Cleanup jobs retain their storage driver; run cleanup with the original driver when retiring assets from a previous provider. A mismatched provider is refused and remains queued. The persistent AssetCleanup queue protects currently referenced images, retries failed provider deletions and processes at most 100 jobs per drain. Referenced/failed jobs rotate to avoid starving later jobs. Re-running apply is safe: cleared listings are no longer eligible. Replacement and avatar operations queue old assets before their successful update and attempt cleanup afterward; failed new uploads are compensated. Provider failures leave queued work. Run maintenance regularly through a deployment-owned scheduler and monitor its queue/exit status; no cron process is installed by this release.

Known limits: newly saved files can be orphaned by a process crash before the database write or compensation; periodically reconcile the provider against database references. A queue/database outage after a successful update can leave cleanup work that needs investigation. Deletion does not guarantee immediate cache eviction. Hidden listing images are not detached by moderation. Provider deletion behavior is only integration-tested with local storage, not live Cloudinary. Never run an orphan sweep without checking current listing/avatar references and reviewing the candidate set.

## Reporting and blocking

Report snapshots can include private received-message text intentionally supplied to moderators by a participant. Restrict administrator access accordingly. Reporter IDs, resolution notes and snapshots are not public. One report per reporter/target is retained; repeat submissions do not reopen closed reports. Blocking is a messaging control: it does not hide public profiles/listings or erase conversation history, and unblocking resumes messaging. Do not describe it as complete identity isolation.


## Account enforcement and appeals

Use `/admin/accounts` to load an existing User ObjectId and current moderation version. Suspension/restoration requires a reason; this text is visible to the account holder, so do not paste confidential reporter information. Administrators cannot suspend themselves or another currently allowlisted admin. Access removal for an administrator is an operator-level allowlist decision, not this API. Every account-state decision invalidates sessions; affected users must log in again to see current status.

Suspended users get a restricted session and `/account-status` UI. They can view their reason, submit one appeal per suspension version, read appeal outcomes/notifications and log out. Other authenticated operations are rejected. Admin appeal acceptance restores and closes the current appeal atomically on the account document. Manual restoration also accepts the current open appeal; rejection does not restore access. Concurrent/stale decisions return 409. Refresh before retrying. Each account retains up to 100 appeals; archive/process additional cases through a separately reviewed operation rather than silently discarding history. Audit arrays retain the last 100 decisions; arrange long-term archival separately if required.

## Prohibited-item policy placeholders

`POLICY_FILE` optionally points to reviewed JSON; otherwise `config/policy.json` is used. It contains a version, notice and rule labels in en/si/ta, and up to 100 rules. Rule IDs are unique slugs, action is `reject` or `review`, and each rule has 1–30 literal terms of 3–80 characters. Text/labels are bounded. Invalid configuration fails startup. Restart after changes.

The bundled example phrases are placeholders, not actual legal/business guidance. Replace notices/rules with reviewed operating policy. Terms match title/description case-insensitively after NFKC normalization; substring matching can need human review. It neither analyzes photos nor provides a legal classifier. Changes do not retroactively modify existing listings. Review matches are hidden pending `/admin/policy` review; approving or retaining a hidden listing is a versioned decision with an audit note. Edited text is evaluated again.

Suspension hides public listings by checking seller eligibility in the query, without overwriting listing-specific moderation decisions. Restoring an account does not unhide separately moderated listings. Already-known image URLs and retained messages are not erased by suspension. No suspension or purge is run automatically by onboarding.
