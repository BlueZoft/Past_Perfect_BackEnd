# Operations and placeholder configuration

## Administrator access

Set `ADMIN_USER_IDS` to a comma-separated list of existing User ObjectIds, then restart the API. The example `REPLACE_WITH_ADMIN_USER_IDS` grants nobody access. Obtain IDs through your authorized database/admin workflow; do not add admin flags to signup/profile payloads. Existing sessions derive authorization server-side on every request. Refresh the frontend after changing access so its `isAdmin` navigation flag is refreshed. API enforcement never trusts that browser flag.

The `/admin/moderation` UI shows report queues. Load the current listing before a hide/restore decision. Visibility changes require the current listing version and a reason; report resolution/dismissal separately requires the report version and a note. Reload on 409 conflicts. The last 100 visibility decisions are embedded on each listing and hidden from public APIs. A durable, indefinite compliance audit archive and administrator MFA are follow-up work.

Do not auto-assign the first signup as administrator. Account suspensions, appeals, message deletion and prohibited-item policy automation are not implemented. Reasons in the UI are generic product placeholders; configure an actual operating policy and support process before launch. No real support address or response-time promise is assumed.

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
