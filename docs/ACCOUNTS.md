# Account email and notification configuration

## Local development

Without `MAIL_DRIVER`, email endpoints report that delivery is unconfigured. Set `MAIL_DRIVER=local` and optionally `MAIL_OUTBOX_DIR=.mail-outbox`, as in `.env.example`. Restart the API. The local adapter writes JSON emails with recipient, subject and text to a private filesystem directory (new directories 0700, files 0600). Open the link from the generated local email in the frontend. Never expose the outbox through a web server, logs, commits or a shared production mailbox. It is ignored by Git and rejected if inside the API upload directory. Do not paste token values into chat or documentation.

Signup sends a verification email when configured. Already-created users can use My profile → Send verification link. The emailed link opens `/verify-email#token=...`; the user explicitly confirms. My profile → Refresh verification status refreshes an existing tab after confirmation in another tab. Email verification does not certify a seller's identity or gate listing access in this release.

Forgot password opens `/recover`. Enter the email, then use `/reset-password#token=...` from the private email. Successful reset invalidates all prior sessions and requires login with the new password. Resending invalidates the previous link; use the newest generated email. Tokens expire after 30 minutes and are single-use. No public endpoint returns tokens. GET/email scanners cannot consume them; the frontend clears the fragment before a confirmation POST. Do not put tokens into query strings.

## Production SMTP placeholders

Set `MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT` (587 with STARTTLS or 465 with TLS), `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM`. Replace every `REPLACE_*` value securely. `WEB_ORIGIN` must be the actual HTTPS frontend origin; links are generated from configured origin, never the request Host header. Configure DNS/sender authorization with the chosen provider outside this repository. No actual provider, account or sender address is assumed.

Local email storage is forbidden in production. The SMTP adapter enforces TLS and normal certificate verification. Failures do not print credentials, passwords or email links. Existing accounts remain usable if signup mail fails; resend when service/configuration is restored. Recovery responses stay generic even on delivery failure for a known account. Observe generic delivery-failure logs to diagnose provider problems. Network delivery timing can differ; use production rate limits and abuse monitoring. A distributed mail job queue and guaranteed delivery are follow-up infrastructure, not silently configured here.

## In-app notifications

Received messages notify the other participant; moderation changes notify the listing owner; report decisions notify the reporter; email confirmation notifies the account. Notifications have event IDs for deduplication and do not contain message contents or tokens. They persist in MongoDB. GET `/user/notifications` returns a bounded page and `unreadCount`; read actions are owner-scoped. The frontend header refreshes every 30 seconds/on focus and listens for its own read events.

No notification represents an order, payment or identity check. Events are stored after their primary operation; database failures are logged without turning an already-committed operation into a misleading error. Use a transactional outbox/reconciliation service if guaranteed event delivery is required. Web Push, SMS and websocket infrastructure are not included.
